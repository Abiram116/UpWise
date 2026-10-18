package com.abiram.upwise

import android.app.Activity
import android.content.Intent
import android.os.Bundle

// Launchers start static shortcuts with FLAG_ACTIVITY_CLEAR_TASK, which would destroy a running
// MainActivity and reload the whole app (replaying the launch intro). This invisible trampoline
// lives in its own task, so that clear only hits itself; it hands the target to MainActivity,
// which (singleTask) just receives it in onNewIntent if it's already running.
class ShortcutActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    startActivity(Intent(this, MainActivity::class.java).apply {
      action = Intent.ACTION_VIEW
      data = intent?.data
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    })
    finish()
    @Suppress("DEPRECATION") overridePendingTransition(0, 0)
  }
}
