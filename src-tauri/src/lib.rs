#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // Opening a URL in the user's real browser. Without this plugin the
    // webview simply swallows window.open(), which is what left the
    // paywall's Unlock button doing nothing on desktop.
    .plugin(tauri_plugin_opener::init())
    .setup(|app| {
      // Desktop-only in-app updater + process (relaunch) plugins.
      #[cfg(desktop)]
      {
        app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
        app.handle().plugin(tauri_plugin_process::init())?;
      }
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
