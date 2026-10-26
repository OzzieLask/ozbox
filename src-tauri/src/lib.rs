mod drag;
mod focus;
mod morph;
mod pacing;
mod tray;

use tauri::Manager;

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

/// Hook the window's messages:
/// - Windows only draws acrylic while a window is active; when focus moves elsewhere
///   it swaps in a flat grey. The window learns it was deactivated via WM_NCACTIVATE,
///   so always report "active".
/// - While collapsed, answer WM_MOUSEACTIVATE with "don't activate" so clicking the
///   tile or dock leaves focus in the user's app (see focus.rs).
#[cfg(windows)]
fn hook_window_messages(window: &tauri::WebviewWindow) {
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
    use windows::Win32::UI::WindowsAndMessaging::{MA_NOACTIVATE, WM_MOUSEACTIVATE, WM_NCACTIVATE};

    unsafe extern "system" fn window_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _id: usize,
        _data: usize,
    ) -> LRESULT {
        match msg {
            WM_NCACTIVATE => unsafe { DefSubclassProc(hwnd, msg, WPARAM(1), lparam) },
            WM_MOUSEACTIVATE if focus::blocks_activation() => LRESULT(MA_NOACTIVATE as isize),
            _ => unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) },
        }
    }

    if let Ok(hwnd) = window.hwnd() {
        unsafe {
            let _ = SetWindowSubclass(HWND(hwnd.0), Some(window_proc), 1, 0);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            drag::start_drag,
            drag::end_drag,
            drag::stop_glide,
            focus::set_focus_mode,
            morph::morph
        ])
        .setup(|app| {
            #[cfg(windows)]
            if let Some(main) = app.get_webview_window("main") {
                style_glass_frame(&main);
                hook_window_messages(&main);
                focus::init(&main);
                let _ = main.set_size(tauri::LogicalSize::new(56.0, 56.0));
            }

            tray::build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
