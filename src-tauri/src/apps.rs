//! Keeping other apps' windows on top (Word, Spotify, a terminal…): list the user's
//! open windows and toggle the always-on-top flag on any of them. Windows OzBox
//! pinned are returned to normal when OzBox quits.

use std::collections::HashSet;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Serialize)]
pub struct AppWindow {
    /// The window handle, passed back to `set_app_on_top`.
    id: i64,
    title: String,
    app: String,
    on_top: bool,
}

/// Windows OzBox has put on top. Managed as app state.
#[derive(Default)]
pub struct PinnedApps(Mutex<HashSet<i64>>);

#[tauri::command]
pub fn list_app_windows() -> Vec<AppWindow> {
    #[cfg(windows)]
    return imp::list();
    #[cfg(not(windows))]
    Vec::new()
}

#[tauri::command]
pub fn set_app_on_top(app: AppHandle, id: i64, on_top: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        imp::set_on_top(id, on_top)?;
        let pinned = app.state::<PinnedApps>();
        let mut pinned = pinned.0.lock().unwrap();
        if on_top {
            pinned.insert(id);
        } else {
            pinned.remove(&id);
        }
        // The pinned window just joined the always-on-top layer above OzBox; put
        // the OzBox tile back on top of it.
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.set_always_on_top(true);
        }
        let _ = app.emit(crate::pin::PINS_CHANGED_EVENT, ());
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = (app, id, on_top);
        Err("Pinning app windows is only supported on Windows.".into())
    }
}

/// Count of app windows OzBox currently has on top (for the dock glance), forgetting
/// any that have since closed.
#[tauri::command]
pub fn pinned_app_count(pinned: tauri::State<'_, PinnedApps>) -> usize {
    let mut pinned = pinned.0.lock().unwrap();
    #[cfg(windows)]
    pinned.retain(|&id| imp::exists(id));
    pinned.len()
}

/// Return every window OzBox pinned to normal. Called when OzBox exits.
pub fn unpin_all(app: &AppHandle) {
    let pinned = app.state::<PinnedApps>();
    for id in pinned.0.lock().unwrap().drain() {
        #[cfg(windows)]
        let _ = imp::set_on_top(id, false);
        #[cfg(not(windows))]
        let _ = id;
    }
}

#[cfg(windows)]
mod imp {
    use super::AppWindow;
    use windows::core::{BOOL, PWSTR};
    use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
    use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
    use windows::Win32::System::Threading::{
        GetCurrentProcessId, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindow, GetWindowLongPtrW, GetWindowTextLengthW, GetWindowTextW,
        GetWindowThreadProcessId, IsWindow, IsWindowVisible, SetWindowPos, GWL_EXSTYLE, GW_OWNER,
        HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, WS_EX_APPWINDOW,
        WS_EX_TOOLWINDOW, WS_EX_TOPMOST,
    };

    fn hwnd(id: i64) -> HWND {
        HWND(id as isize as *mut _)
    }

    pub fn list() -> Vec<AppWindow> {
        let mut handles: Vec<HWND> = Vec::new();
        unsafe extern "system" fn collect(hwnd: HWND, list: LPARAM) -> BOOL {
            unsafe { (*(list.0 as *mut Vec<HWND>)).push(hwnd) };
            BOOL(1)
        }
        unsafe {
            let _ = EnumWindows(Some(collect), LPARAM(&mut handles as *mut _ as isize));
        }
        let own_pid = unsafe { GetCurrentProcessId() };
        // EnumWindows walks top to bottom, so the result is most recently used first.
        handles.into_iter().filter_map(|h| describe(h, own_pid)).collect()
    }

    /// The window as the user would recognise it, or None if it isn't one they'd
    /// pick: hidden, cloaked (e.g. suspended store apps), owned popups, tool
    /// windows, untitled, the desktop, or OzBox's own windows.
    fn describe(h: HWND, own_pid: u32) -> Option<AppWindow> {
        unsafe {
            if !IsWindowVisible(h).as_bool() || GetWindow(h, GW_OWNER).is_ok_and(|o| !o.is_invalid()) {
                return None;
            }
            let ex_style = GetWindowLongPtrW(h, GWL_EXSTYLE) as u32;
            if ex_style & WS_EX_TOOLWINDOW.0 != 0 && ex_style & WS_EX_APPWINDOW.0 == 0 {
                return None;
            }
            let mut cloaked = 0u32;
            let _ = DwmGetWindowAttribute(
                h,
                DWMWA_CLOAKED,
                &mut cloaked as *mut _ as *mut _,
                std::mem::size_of::<u32>() as u32,
            );
            if cloaked != 0 {
                return None;
            }
            let mut pid = 0;
            GetWindowThreadProcessId(h, Some(&mut pid));
            if pid == own_pid {
                return None;
            }

            let len = GetWindowTextLengthW(h);
            if len == 0 {
                return None;
            }
            let mut buf = vec![0u16; len as usize + 1];
            let n = GetWindowTextW(h, &mut buf);
            let title = String::from_utf16_lossy(&buf[..n as usize]);
            if title == "Program Manager" {
                return None;
            }

            Some(AppWindow {
                id: h.0 as isize as i64,
                title,
                app: process_name(pid).unwrap_or_default(),
                on_top: ex_style & WS_EX_TOPMOST.0 != 0,
            })
        }
    }

    /// "C:\...\Spotify.exe" -> "Spotify".
    fn process_name(pid: u32) -> Option<String> {
        unsafe {
            let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut buf = [0u16; 1024];
            let mut len = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len);
            let _ = CloseHandle(process);
            ok.ok()?;
            let path = String::from_utf16_lossy(&buf[..len as usize]);
            std::path::Path::new(&path).file_stem().map(|s| s.to_string_lossy().into_owned())
        }
    }

    pub fn exists(id: i64) -> bool {
        unsafe { IsWindow(Some(hwnd(id))).as_bool() }
    }

    pub fn set_on_top(id: i64, on_top: bool) -> Result<(), String> {
        let h = hwnd(id);
        unsafe {
            if !IsWindow(Some(h)).as_bool() {
                return Err("That window has closed.".into());
            }
            let after = if on_top { HWND_TOPMOST } else { HWND_NOTOPMOST };
            SetWindowPos(h, Some(after), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)
                // Windows blocks this for apps running as administrator.
                .map_err(|_| "Windows won't let OzBox pin that window (it may be running as administrator).".to_string())
        }
    }
}
