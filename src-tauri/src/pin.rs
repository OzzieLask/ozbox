//! Pinned pages: a webpage in its own always-on-top glass window. Each pin is one
//! native window holding two webviews:
//! - a glass bar on top (OzBox's own `pin-bar.html`), to drag and close the pin;
//! - the page itself below it, in a separate browser profile with no access to
//!   OzBox's commands (no capability matches it) and the GPU enabled for video.

use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU32, Ordering};

use serde::Serialize;
use tauri::webview::NewWindowResponse;
use tauri::window::{Color, Effect, EffectsBuilder};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Url, Webview, WebviewBuilder,
    WebviewUrl, WindowBuilder, WindowEvent,
};
use tauri_plugin_opener::OpenerExt;

/// Sent whenever a pin opens, closes or its page title changes.
pub const PINS_CHANGED_EVENT: &str = "ozbox://pins-changed";

/// Height of the glass bar, in logical px.
const BAR_HEIGHT: f64 = 32.0;
/// Glass margin around the page; doubles as the grip for resizing from the edges.
const FRAME: f64 = 6.0;
/// Initial page size (16:9), in logical px.
const PAGE_SIZE: (f64, f64) = (480.0, 270.0);

/// The bar shares OzBox's browser profile, and webviews sharing a profile must use
/// the same browser arguments: keep in sync with `additionalBrowserArgs` in tauri.conf.json.
const OZBOX_BROWSER_ARGS: &str =
    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --disable-gpu";
/// Pinned pages get their own profile, with the GPU on so video plays smoothly.
const PAGE_BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";

#[derive(Clone, Serialize)]
pub struct PinInfo {
    id: u32,
    url: String,
    title: String,
}

/// Open pins, keyed by id. Managed as app state.
#[derive(Default)]
pub struct Pins(Mutex<HashMap<u32, PinInfo>>);

static NEXT_ID: AtomicU32 = AtomicU32::new(1);

fn window_label(id: u32) -> String {
    format!("pin-{id}")
}

/// Pin `url` (http/https only) in a new window. Returns the pin's id.
#[tauri::command]
pub async fn open_pin(app: AppHandle, url: String) -> Result<u32, String> {
    let url = Url::parse(&url).map_err(|e| e.to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Only http and https pages can be pinned.".into());
    }
    let host = url.host_str().unwrap_or("Pinned page").to_string();
    open(app, url, host)
}

/// File types a pin can show (it's a browser view). Anything else would download
/// instead of displaying. Keep in sync with VIEWABLE_EXTENSIONS in pins.ts.
const VIEWABLE_EXTENSIONS: &[&str] = &[
    "pdf", "png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "svg", "mp4", "webm",
    "m4v", "mov", "mp3", "wav", "ogg", "m4a", "flac", "txt", "log", "json", "csv", "xml",
    "html", "htm", "css", "js",
];

/// Pin a local file (PDF, image, video, text…). Returns the pin's id.
#[tauri::command]
pub async fn pin_file(app: AppHandle, path: String) -> Result<u32, String> {
    let path = std::path::PathBuf::from(path);
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "File".into());
    if !path.is_file() {
        return Err(format!("{name} isn't a file OzBox can open."));
    }
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if !VIEWABLE_EXTENSIONS.contains(&ext.as_str()) {
        return Err(format!("OzBox can't show .{ext} files in a pin."));
    }
    let url = Url::from_file_path(&path).map_err(|_| format!("{name} has an invalid path."))?;
    open(app, url, name)
}

fn open(app: AppHandle, url: Url, title: String) -> Result<u32, String> {
    let err = |e: tauri::Error| e.to_string();
    let id = NEXT_ID.fetch_add(1, Ordering::SeqCst);
    let host = title;

    let (page_w, page_h) = PAGE_SIZE;
    let (w, h) = (page_w + 2.0 * FRAME, BAR_HEIGHT + page_h + FRAME);
    let window = WindowBuilder::new(&app, window_label(id))
        .title(&host)
        .inner_size(w, h)
        .min_inner_size(240.0, 160.0)
        .decorations(false)
        .transparent(true)
        .shadow(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .effects(
            EffectsBuilder::new()
                .effect(Effect::Acrylic)
                .color(Color(255, 255, 255, 4))
                .build(),
        )
        .visible(false)
        .build()
        .map_err(err)?;

    #[cfg(windows)]
    if let Ok(hwnd) = window.hwnd() {
        let hwnd = windows::Win32::Foundation::HWND(hwnd.0);
        crate::frame::style_glass_frame(hwnd);
        crate::frame::hook_window_messages(hwnd, crate::frame::Hook::Glass);
    }

    let bar = window
        .add_child(
            WebviewBuilder::new(
                format!("pinbar-{id}"),
                WebviewUrl::App(format!("pin-bar.html?id={id}").into()),
            )
            .transparent(true)
            .additional_browser_args(OZBOX_BROWSER_ARGS),
            LogicalPosition::new(0.0, 0.0),
            LogicalSize::new(w, BAR_HEIGHT),
        )
        .map_err(err)?;

    let profile = app
        .path()
        .app_local_data_dir()
        .map_err(err)?
        .join("pinned-pages");
    let popups_app = app.clone();
    let title_app = app.clone();
    let page = window
        .add_child(
            WebviewBuilder::new(format!("pinpage-{id}"), WebviewUrl::External(url.clone()))
                .data_directory(profile)
                .additional_browser_args(PAGE_BROWSER_ARGS)
                // Links that would open a new window/tab go to the user's browser instead.
                .on_new_window(move |url, _| {
                    let _ = popups_app.opener().open_url(url.as_str(), None::<&str>);
                    NewWindowResponse::Deny
                })
                .on_document_title_changed(move |_, title| set_title(&title_app, id, title)),
            LogicalPosition::new(FRAME, BAR_HEIGHT),
            LogicalSize::new(page_w, page_h),
        )
        .map_err(err)?;

    app.state::<Pins>().0.lock().unwrap().insert(
        id,
        PinInfo {
            id,
            url: url.to_string(),
            title: host,
        },
    );
    let _ = app.emit(PINS_CHANGED_EVENT, ());

    let events_window = window.clone();
    let events_app = app.clone();
    window.on_window_event(move |event| match event {
        // Child webviews don't follow the window by themselves; keep them laid out.
        WindowEvent::Resized(size) => {
            let scale = events_window.scale_factor().unwrap_or(1.0);
            let size = size.to_logical::<f64>(scale);
            layout(&bar, &page, size.width, size.height);
        }
        WindowEvent::Destroyed => {
            events_app.state::<Pins>().0.lock().unwrap().remove(&id);
            let _ = events_app.emit(PINS_CHANGED_EVENT, ());
        }
        _ => {}
    });

    window.show().map_err(err)?;
    Ok(id)
}

fn layout(bar: &Webview, page: &Webview, w: f64, h: f64) {
    let _ = bar.set_size(LogicalSize::new(w, BAR_HEIGHT));
    let _ = page.set_position(LogicalPosition::new(FRAME, BAR_HEIGHT));
    let _ = page.set_size(LogicalSize::new(
        (w - 2.0 * FRAME).max(1.0),
        (h - BAR_HEIGHT - FRAME).max(1.0),
    ));
}

fn set_title(app: &AppHandle, id: u32, title: String) {
    if title.trim().is_empty() {
        return;
    }
    if let Some(pin) = app.state::<Pins>().0.lock().unwrap().get_mut(&id) {
        pin.title = title;
    }
    let _ = app.emit(PINS_CHANGED_EVENT, ());
}

#[tauri::command]
pub fn list_pins(pins: tauri::State<'_, Pins>) -> Vec<PinInfo> {
    let mut list: Vec<PinInfo> = pins.0.lock().unwrap().values().cloned().collect();
    list.sort_by_key(|p| p.id);
    list
}

#[tauri::command]
pub fn close_pin(app: AppHandle, id: u32) {
    if let Some(window) = app.get_window(&window_label(id)) {
        let _ = window.destroy();
    }
}
