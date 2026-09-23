mod youtube;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_os::init());

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    // On Windows the window starts hidden (tauri.windows.conf.json) and the page shows it after
    // its first paint, so launch never flashes an empty white frame. This is the safety net:
    // if the page somehow never calls show(), the window still appears.
    #[cfg(desktop)]
    let builder = builder.setup(|app| {
        use tauri::Manager;
        let handle = app.handle().clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(2500));
            if let Some(w) = handle.get_webview_window("main") {
                let _ = w.show();
            }
        });
        Ok(())
    });

    builder
        .invoke_handler(tauri::generate_handler![youtube::fetch_youtube_transcript])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
