//! Keeping OzBox from stealing focus. While collapsed (tile or dock) clicks don't
//! activate the window, so typing stays in whatever app you were using. Opening a
//! panel takes focus (Notes needs the keyboard) and closing it hands focus back.

use tauri::WebviewWindow;

/// `focus: true` when a panel opens, `false` when it closes.
#[tauri::command]
pub fn set_focus_mode(window: WebviewWindow, focus: bool) {
    #[cfg(windows)]
    imp::set_focus_mode(&window, focus);
    #[cfg(not(windows))]
    if focus {
        let _ = window.set_focus();
    }
}

#[cfg(windows)]
pub use imp::{blocks_activation, init};

#[cfg(windows)]
mod imp {
    use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
    use tauri::WebviewWindow;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        GWL_EXSTYLE, GetForegroundWindow, GetWindowLongPtrW, IsWindow, SetForegroundWindow,
        SetWindowLongPtrW, WS_EX_NOACTIVATE,
    };

    static NO_ACTIVATE: AtomicBool = AtomicBool::new(true);
    /// The window that had focus before a panel took it (0 if none).
    static PREVIOUS: AtomicIsize = AtomicIsize::new(0);

    /// Read by the window subclass to answer WM_MOUSEACTIVATE.
    pub fn blocks_activation() -> bool {
        NO_ACTIVATE.load(Ordering::SeqCst)
    }

    /// Start out collapsed: clicks don't activate the window.
    pub fn init(window: &WebviewWindow) {
        if let Ok(hwnd) = window.hwnd() {
            set_no_activate_style(HWND(hwnd.0), true);
        }
    }

    pub fn set_focus_mode(window: &WebviewWindow, focus: bool) {
        let Ok(hwnd) = window.hwnd() else { return };
        let ours = HWND(hwnd.0);
        unsafe {
            if focus {
                let current = GetForegroundWindow();
                if current != ours {
                    PREVIOUS.store(current.0 as isize, Ordering::SeqCst);
                }
                NO_ACTIVATE.store(false, Ordering::SeqCst);
                set_no_activate_style(ours, false);
                let _ = SetForegroundWindow(ours);
            } else {
                NO_ACTIVATE.store(true, Ordering::SeqCst);
                set_no_activate_style(ours, true);
                // Only hand focus back if we still have it; if the user has already
                // moved on to another app, leave them there.
                let previous = HWND(PREVIOUS.swap(0, Ordering::SeqCst) as *mut _);
                if GetForegroundWindow() == ours
                    && !previous.is_invalid()
                    && IsWindow(Some(previous)).as_bool()
                {
                    let _ = SetForegroundWindow(previous);
                }
            }
        }
    }

    fn set_no_activate_style(hwnd: HWND, on: bool) {
        unsafe {
            let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            let flag = WS_EX_NOACTIVATE.0 as isize;
            let next = if on { style | flag } else { style & !flag };
            if next != style {
                SetWindowLongPtrW(hwnd, GWL_EXSTYLE, next);
            }
        }
    }
}
