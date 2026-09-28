package com.abiram.upwise

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.HapticFeedbackConstants
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.core.app.NotificationManagerCompat
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import org.json.JSONObject

class MainActivity : TauriActivity() {
  private var webView: WebView? = null
  private var pendingShare: String? = null
  private var pendingNotification: String? = null
  private var pendingDownloadId: Long = -1
  private val handler = Handler(Looper.getMainLooper())

  private val downloadReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1)
      if (id == -1L || id != pendingDownloadId) return
      try {
        val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val uri = dm.getUriForDownloadedFile(id) ?: return
        startActivity(Intent(Intent.ACTION_VIEW).apply {
          setDataAndType(uri, "application/vnd.android.package-archive")
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        })
      } catch (e: Exception) {
        Log.e("UpWise", "opening downloaded update failed", e)
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    handleShare(intent)
    handleNotificationTap(intent)
    val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(downloadReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      registerReceiver(downloadReceiver, filter)
    }

    // CSS env(safe-area-inset-*) is unreliable in this WebView under edge-to-edge (confirmed
    // live: the status-bar scrim and the PIN screen's keyboard handling both silently did
    // nothing) — read real inset pixel values natively and push them to the page directly
    // instead of trusting the WebView to report them itself.
    // TauriActivity leaves back unhandled, so by default it finishes the activity from any
    // screen. Ask the page first (close a sheet, go up a level); if it has nothing left to
    // do, background the app the way every Android app does from its start screen instead
    // of killing it — reopening is then instant and keeps your place.
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        val view = webView
        if (view == null) { moveTaskToBack(true); return }
        view.evaluateJavascript("(function(){try{return !!(window.__upwiseBack&&window.__upwiseBack())}catch(e){return false}})()") { handled ->
          if (handled != "true") moveTaskToBack(true)
        }
      }
    })

    ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { _, insets ->
      val density = resources.displayMetrics.density
      val statusBar = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top / density
      val navBar = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom / density
      val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom / density
      webView?.evaluateJavascript(
        "document.documentElement.style.setProperty('--native-safe-top','${statusBar}px');" +
          "document.documentElement.style.setProperty('--native-safe-bottom','${navBar}px');" +
          "document.documentElement.style.setProperty('--native-keyboard-inset','${keyboard}px');",
        null,
      )
      insets
    }
  }

  override fun onDestroy() {
    try { unregisterReceiver(downloadReceiver) } catch (e: Exception) { /* never registered */ }
    super.onDestroy()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleShare(intent)
    handleNotificationTap(intent)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    this.webView = webView
    // The WebView draws its own native scrollbar over the page; CSS can't reach it.
    webView.isVerticalScrollBarEnabled = false
    webView.isHorizontalScrollBarEnabled = false
    webView.addJavascriptInterface(NativeBridge(), "AndroidNative")
    pendingShare?.let { deliver(it) }
    pendingNotification?.let { deliverNotification(it) }
  }

  private inner class NativeBridge {
    @JavascriptInterface
    fun setLightStatusBar(light: Boolean) {
      handler.post {
        val c = WindowInsetsControllerCompat(window, window.decorView)
        c.isAppearanceLightStatusBars = light
        c.isAppearanceLightNavigationBars = light
      }
    }

    // A notification's "Later"/"Skip" button has to open the app to be delivered at all; once
    // the page has handled it, step back out so it feels like it never left the notification.
    @JavascriptInterface
    fun moveToBackground() {
      handler.post { moveTaskToBack(true) }
    }

    // Deep-links to this app's notification settings — once a permission request has been
    // denied, Android won't show the dialog again, so this is the only way back.
    @JavascriptInterface
    fun openNotificationSettings() {
      handler.post {
        try {
          startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName))
        } catch (e: Exception) {
          Log.e("UpWise", "openNotificationSettings failed", e)
        }
      }
    }

    // Pixel phones have a precise haptic motor that plays composed "primitives" (tick, click,
    // rise, spin) — the same building blocks system UI uses. Each app moment gets its own
    // texture; older/other devices fall back to the standard haptic constants.
    @JavascriptInterface
    fun haptic(type: String) {
      handler.post { playHaptic(type) }
    }

    // Material You: the wallpaper-derived tonal palette, so the app can match the phone's theme.
    @JavascriptInterface
    fun dynamicColors(): String {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return "{}"
      val ids = mapOf(
        "a1-100" to android.R.color.system_accent1_100, "a1-200" to android.R.color.system_accent1_200,
        "a1-600" to android.R.color.system_accent1_600, "a1-700" to android.R.color.system_accent1_700,
        "a1-800" to android.R.color.system_accent1_800, "a1-900" to android.R.color.system_accent1_900,
        "a3-100" to android.R.color.system_accent3_100, "a3-200" to android.R.color.system_accent3_200,
        "a3-600" to android.R.color.system_accent3_600, "a3-700" to android.R.color.system_accent3_700,
        "a3-900" to android.R.color.system_accent3_900,
      )
      val o = JSONObject()
      for ((k, id) in ids) o.put(k, String.format("#%06X", 0xFFFFFF and getColor(id)))
      return o.toString()
    }

    // Downloads the update APK via the system DownloadManager (survives backgrounding, shows
    // a real notification) and opens the installer automatically once it lands, instead of
    // handing the user off to a browser download they then have to hunt down themselves.
    @JavascriptInterface
    fun downloadAndInstall(url: String) {
      handler.post {
        try {
          // A stale file from a previous update attempt can make DownloadManager choke on reuse.
          java.io.File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "upwise-update.apk").delete()
          val request = DownloadManager.Request(Uri.parse(url))
            .setTitle("UpWise update")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalFilesDir(this@MainActivity, Environment.DIRECTORY_DOWNLOADS, "upwise-update.apk")
          val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
          pendingDownloadId = dm.enqueue(request)
        } catch (e: Exception) {
          Log.e("UpWise", "downloadAndInstall failed", e)
        }
      }
    }

    // Whether the OS will let this app launch an installer at all — separate from a runtime
    // permission dialog, it's a per-app toggle the user grants via a dedicated Settings screen.
    @JavascriptInterface
    fun canInstallPackages(): Boolean {
      return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) packageManager.canRequestPackageInstalls() else true
    }

    // Deep-links straight to this app's "Install unknown apps" toggle, so onboarding can offer
    // to get it out of the way up front instead of surprising the user mid-update.
    @JavascriptInterface
    fun openInstallPermissionSettings() {
      handler.post {
        try {
          startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
        } catch (e: Exception) {
          Log.e("UpWise", "openInstallPermissionSettings failed", e)
        }
      }
    }
  }

  private fun playHaptic(type: String) {
    val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
    } else @Suppress("DEPRECATION") (getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && vibrator != null && vibrator.areAllPrimitivesSupported(
        VibrationEffect.Composition.PRIMITIVE_TICK, VibrationEffect.Composition.PRIMITIVE_CLICK,
        VibrationEffect.Composition.PRIMITIVE_SLOW_RISE, VibrationEffect.Composition.PRIMITIVE_QUICK_RISE,
        VibrationEffect.Composition.PRIMITIVE_LOW_TICK, VibrationEffect.Composition.PRIMITIVE_SPIN)) {
      val c = VibrationEffect.startComposition()
      when (type) {
        "select" -> c.addPrimitive(VibrationEffect.Composition.PRIMITIVE_LOW_TICK, 0.9f)
        "success" -> c.addPrimitive(VibrationEffect.Composition.PRIMITIVE_QUICK_RISE, 0.45f)
          .addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK, 0.8f, 20)
        "warn" -> c.addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK, 0.7f)
          .addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK, 0.5f, 90)
        // A small crescendo that lands: rise, hit, then a trail of fading ticks.
        "celebrate" -> c.addPrimitive(VibrationEffect.Composition.PRIMITIVE_SLOW_RISE, 0.5f)
          .addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK, 1f, 30)
          .addPrimitive(VibrationEffect.Composition.PRIMITIVE_TICK, 0.8f, 70)
          .addPrimitive(VibrationEffect.Composition.PRIMITIVE_TICK, 0.55f, 60)
          .addPrimitive(VibrationEffect.Composition.PRIMITIVE_TICK, 0.3f, 60)
        "spin" -> c.addPrimitive(VibrationEffect.Composition.PRIMITIVE_SPIN, 0.7f)
          .addPrimitive(VibrationEffect.Composition.PRIMITIVE_CLICK, 0.9f, 40)
        else -> c.addPrimitive(VibrationEffect.Composition.PRIMITIVE_TICK, 0.7f)
      }
      val effect = c.compose()
      // USAGE_TOUCH respects the phone's "touch feedback" setting, like system UI does.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        vibrator.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_TOUCH))
      } else vibrator.vibrate(effect)
      return
    }
    val view = webView ?: return
    view.performHapticFeedback(when (type) {
      "success", "celebrate", "spin" -> HapticFeedbackConstants.CONFIRM
      "warn" -> HapticFeedbackConstants.REJECT
      else -> HapticFeedbackConstants.VIRTUAL_KEY
    })
  }

  // Notification body taps and action buttons (Start / Later / Tomorrow / Skip) arrive as an
  // activity intent. The notification plugin's own JS event is easy to miss on a cold start,
  // so deliver it to the page ourselves, the same retrying way shared links arrive.
  private fun handleNotificationTap(intent: Intent?) {
    if (intent == null || intent.getBooleanExtra("upwiseHandled", false)) return
    val action = intent.getStringExtra("NotificationUserAction") ?: return
    intent.putExtra("upwiseHandled", true)
    val id = intent.getIntExtra("NotificationId", Int.MIN_VALUE)
    if (id != Int.MIN_VALUE) NotificationManagerCompat.from(this).cancel(id)
    val obj = try { JSONObject(intent.getStringExtra("LocalNotficationObject") ?: "{}") } catch (e: Exception) { JSONObject() }
    val payload = JSONObject().put("action", action).put("notification", obj).toString()
    pendingNotification = payload
    if (webView != null) deliverNotification(payload)
  }

  private fun deliverNotification(payload: String) {
    val token = System.nanoTime().toString()
    val js = "(function(){try{" +
      "var t='$token';window.__upwiseSeen=window.__upwiseSeen||{};if(window.__upwiseSeen[t])return;" +
      "if(window.__upwiseNotif){window.__upwiseSeen[t]=1;window.__upwiseNotif($payload);}" +
      "else{window.__upwisePendingNotif=$payload;}" +
      "}catch(e){}})();"
    for (delay in longArrayOf(0, 700, 1800, 3500, 6000)) {
      handler.postDelayed({ webView?.evaluateJavascript(js, null) }, delay)
    }
    pendingNotification = null
  }

  private fun handleShare(intent: Intent?) {
    if (intent?.action != Intent.ACTION_SEND || intent.type?.startsWith("text/") != true) return
    val text = intent.getStringExtra(Intent.EXTRA_TEXT) ?: return
    intent.action = Intent.ACTION_MAIN // avoid re-delivering on config changes
    pendingShare = text
    if (webView != null) deliver(text)
  }

  // The page may still be loading on a cold start, so retry a few times. The JS side dedupes by token.
  private fun deliver(text: String) {
    val token = System.currentTimeMillis().toString()
    val payload = JSONObject.quote(text)
    val js = "(function(){try{" +
      "var t='$token';window.__upwiseSeen=window.__upwiseSeen||{};if(window.__upwiseSeen[t])return;" +
      "if(window.__upwiseShare){window.__upwiseSeen[t]=1;window.__upwiseShare($payload);}" +
      "else{window.__upwisePendingShare=$payload;}" +
      "}catch(e){}})();"
    for (delay in longArrayOf(0, 700, 1800, 3500, 6000)) {
      handler.postDelayed({ webView?.evaluateJavascript(js, null) }, delay)
    }
    pendingShare = null
  }
}
