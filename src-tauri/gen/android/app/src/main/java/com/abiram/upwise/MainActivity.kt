package com.abiram.upwise

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import org.json.JSONObject

class MainActivity : TauriActivity() {
  private var webView: WebView? = null
  private var pendingShare: String? = null
  private val handler = Handler(Looper.getMainLooper())

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    handleShare(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleShare(intent)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    this.webView = webView
    pendingShare?.let { deliver(it) }
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
