//! Native window styling shared by OzBox's glass windows (the main tile and pins).
//! Windows-only; takes the raw window handle so it works for any Tauri window type.

use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::Graphics::Dwm::{
    DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
    DWMWINDOWATTRIBUTE, DwmSetWindowAttribute,
};
use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{MA_NOACTIVATE, WM_MOUSEACTIVATE, WM_NCACTIVATE};

use crate::focus;

/// Style the window frame for the glass look: ask Windows 11 to round the corners
/// (undecorated windows without the native shadow don't get rounding by default,
/// and enabling the shadow imposes a minimum window width) and drop the dark 1px
/// border it draws, which clashes with the glass rim.
pub fn style_glass_frame(hwnd: HWND) {
    let set = |attribute: DWMWINDOWATTRIBUTE, value: u32| unsafe {
        let _ = DwmSetWindowAttribute(
            hwnd,
            attribute,
            &value as *const _ as *const _,
            std::mem::size_of_val(&value) as u32,
        );
    };
    set(DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND.0 as u32);
    set(DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE);
}

/// What a hooked window should do beyond keeping its acrylic.
#[derive(Clone, Copy, PartialEq)]
pub enum Hook {
    /// The main OzBox window: also refuses activation while collapsed (focus.rs).
    Main = 1,
    /// Any other glass window, e.g. a pin.
    Glass = 0,
}

/// Hook the window's messages:
/// - Windows only draws acrylic while a window is active; when focus moves elsewhere
///   it swaps in a flat grey. The window learns it was deactivated via WM_NCACTIVATE,
///   so always report "active".
/// - For the main window, while collapsed, answer WM_MOUSEACTIVATE with "don't
///   activate" so clicking the tile or dock leaves focus in the user's app.
pub fn hook_window_messages(hwnd: HWND, hook: Hook) {
    unsafe extern "system" fn window_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _id: usize,
        hook: usize,
    ) -> LRESULT {
        match msg {
            WM_NCACTIVATE => unsafe { DefSubclassProc(hwnd, msg, WPARAM(1), lparam) },
            WM_MOUSEACTIVATE if hook == Hook::Main as usize && focus::blocks_activation() => {
                LRESULT(MA_NOACTIVATE as isize)
            }
            _ => unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) },
        }
    }

    unsafe {
        let _ = SetWindowSubclass(hwnd, Some(window_proc), 1, hook as usize);
    }
}
