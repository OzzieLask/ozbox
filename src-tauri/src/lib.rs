mod drag;
#[cfg(windows)]
mod drop;
mod focus;
#[cfg(windows)]
mod frame;
mod morph;
mod pacing;
mod pin;
mod tray;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .manage(pin::Pins::default())
        .invoke_handler(tauri::generate_handler![
            drag::start_drag,
            drag::end_drag,
            drag::stop_glide,
            focus::set_focus_mode,
            morph::morph,
            pin::open_pin,
            pin::pin_file,
            pin::list_pins,
            pin::close_pin
        ])
        .setup(|app| {
            #[cfg(windows)]
            if let Some(main) = app.get_webview_window("main") {
                if let Ok(hwnd) = main.hwnd() {
                    let hwnd = windows::Win32::Foundation::HWND(hwnd.0);
                    frame::style_glass_frame(hwnd);
                    frame::hook_window_messages(hwnd, frame::Hook::Main);
                }
                focus::init(&main);
                drop::listen_for_file_drops(&main);
                let _ = main.set_size(tauri::LogicalSize::new(56.0, 56.0));
            }

            tray::build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
