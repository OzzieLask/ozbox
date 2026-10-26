mod drag;
mod morph;
mod pacing;

use tauri::{
    Manager,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};

/// Style the window frame for the glass look: ask Windows 11 to round the corners
/// (undecorated windows without the native shadow don't get rounding by default,
/// and enabling the shadow imposes a minimum window width) and drop the dark 1px
/// border it draws, which clashes with the glass rim.
#[cfg(windows)]
fn style_glass_frame(window: &tauri::WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Dwm::{
        DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
        DWMWINDOWATTRIBUTE, DwmSetWindowAttribute,
    };

    let Ok(hwnd) = window.hwnd() else { return };
    let set = |attribute: DWMWINDOWATTRIBUTE, value: u32| unsafe {
        let _ = DwmSetWindowAttribute(
            HWND(hwnd.0),
            attribute,
            &value as *const _ as *const _,
            std::mem::size_of_val(&value) as u32,
        );
    };
    set(DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND.0 as u32);
    set(DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE);
}

/// Windows only draws acrylic while a window is active; when focus moves elsewhere
/// it swaps in a flat grey. The window learns it was deactivated via WM_NCACTIVATE,
/// so intercept that message and always report "active".
#[cfg(windows)]
fn keep_backdrop_active(window: &tauri::WebviewWindow) {
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
    use windows::Win32::UI::WindowsAndMessaging::WM_NCACTIVATE;

    unsafe extern "system" fn always_active(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _id: usize,
        _data: usize,
    ) -> LRESULT {
        let wparam = if msg == WM_NCACTIVATE {
            WPARAM(1)
        } else {
            wparam
        };
        unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
    }

    if let Ok(hwnd) = window.hwnd() {
        unsafe {
            let _ = SetWindowSubclass(HWND(hwnd.0), Some(always_active), 1, 0);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            drag::start_drag,
            drag::end_drag,
            drag::stop_glide,
            morph::morph
        ])
        .setup(|app| {
            #[cfg(windows)]
            if let Some(main) = app.get_webview_window("main") {
                style_glass_frame(&main);
                keep_backdrop_active(&main);
                let _ = main.set_size(tauri::LogicalSize::new(56.0, 56.0));
            }

            // The orb has no taskbar entry or title bar, so the tray is how you quit.
            let quit = MenuItem::with_id(app, "quit", "Quit OzBox", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("OzBox")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    if event.id.as_ref() == "quit" {
                        app.exit(0);
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
