//! Real paths for files dropped onto the main window. With Tauri's own drop handler
//! off (so dropped *links* reach the page), the page sees dropped files as DOM `File`s
//! with no path. WebView2's documented way back to the path: the page passes the
//! files to `chrome.webview.postMessageWithAdditionalObjects`, and the host reads
//! each one's path. We then hand the paths to the frontend as an event.
//!
//! Tauri's IPC listens on the same message channel; it ignores our message (logging
//! a parse error to the page console), and we ignore everything except ours.

use tauri::{Emitter, WebviewWindow};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2File, ICoreWebView2WebMessageReceivedEventArgs,
    ICoreWebView2WebMessageReceivedEventArgs2,
};
use webview2_com::{take_pwstr, WebMessageReceivedEventHandler};
use windows::core::{Interface, PWSTR};

/// The message the page sends along with dropped files. Matches pins.ts.
const DROP_MESSAGE: &str = "ozbox-drop-files";
/// Emitted to the frontend with the dropped files' paths.
pub const FILES_DROPPED_EVENT: &str = "ozbox://files-dropped";

pub fn listen_for_file_drops(window: &WebviewWindow) {
    let target = window.clone();
    let _ = window.with_webview(move |platform| unsafe {
        let Ok(core) = platform.controller().CoreWebView2() else {
            return;
        };
        let handler = WebMessageReceivedEventHandler::create(Box::new(move |_, args| {
            let Some(args) = args else { return Ok(()) };
            let mut message = PWSTR::null();
            if args.TryGetWebMessageAsString(&mut message).is_err() || take_pwstr(message) != DROP_MESSAGE {
                return Ok(());
            }
            let paths = file_paths(&args);
            if !paths.is_empty() {
                let _ = target.emit(FILES_DROPPED_EVENT, paths);
            }
            Ok(())
        }));
        let mut token = 0;
        let _ = core.add_WebMessageReceived(&handler, &mut token);
    });
}

unsafe fn file_paths(args: &ICoreWebView2WebMessageReceivedEventArgs) -> Vec<String> {
    let Ok(objects) = args
        .cast::<ICoreWebView2WebMessageReceivedEventArgs2>()
        .and_then(|a| unsafe { a.AdditionalObjects() })
    else {
        return Vec::new();
    };
    let mut count = 0;
    if unsafe { objects.Count(&mut count) }.is_err() {
        return Vec::new();
    }
    (0..count)
        .filter_map(|i| {
            let file = unsafe { objects.GetValueAtIndex(i) }.ok()?.cast::<ICoreWebView2File>().ok()?;
            let mut path = PWSTR::null();
            unsafe { file.Path(&mut path) }.ok()?;
            Some(take_pwstr(path))
        })
        .collect()
}
