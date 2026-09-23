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
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.HapticFeedbackConstants
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import org.json.JSONObject

class MainActivity : TauriActivity() {
  private var webView: WebView? = null
  private var pendingShare: String? = null
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
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    this.webView = webView
    webView.addJavascriptInterface(NativeBridge(), "AndroidNative")
    pendingShare?.let { deliver(it) }
  }

  private inner class NativeBridge {
    @JavascriptInterface
    fun setLightStatusBar(light: Boolean) {
      handler.post {
        WindowInsetsControllerCompat(window, window.decorView).isAppearanceLightStatusBars = light
      }
    }

    // Subtle, OS-tuned taps instead of a blunt vibrate() buzz — same constants system UI uses.
    @JavascriptInterface
    fun haptic(type: String) {
      handler.post {
        val view = webView ?: return@post
        val constant = when (type) {
          "success" -> HapticFeedbackConstants.CONFIRM
          "warn" -> HapticFeedbackConstants.REJECT
          else -> HapticFeedbackConstants.VIRTUAL_KEY
        }
        view.performHapticFeedback(constant)
      }
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
