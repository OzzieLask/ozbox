//! The whiteboard: a see-through drawing layer over the screen the cursor is on,
//! plus a separate small glass toolbar window (real acrylic, like the OzBox tile).
//! - "draw": the layer takes the mouse/pen and the toolbar is shown;
//! - "view": drawings stay visible but clicks pass through; the toolbar hides;
//! - "off": both windows are destroyed, so it costs nothing. Drawings are saved by
//!   the layer itself (whiteboard.json) and come back next time.
//!
//! Getting stuck behind a full-screen layer must never happen, so:
//! - every window gets a fresh label (a closing window's cleanup can't remove the
//!   new one's registration, which once left an orphaned, unresponsive layer);
//! - mode changes are serialized (double-clicking Draw can't make two layers);
//! - while drawing, Esc is a native global shortcut (works even if the page doesn't),
//!   and the tray has "Turn off whiteboard".

use std::sync::atomic::{AtomicU32, Ordering};

use tauri::async_runtime::Mutex;
use tauri::window::{Color, Effect, EffectsBuilder};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut};

/// Sent with the new mode ("off" | "draw" | "view") whenever it changes.
pub const MODE_EVENT: &str = "ozbox://whiteboard-mode";

/// Toolbar size in logical px. The width is a first guess: the page measures its
/// buttons and calls `fit_whiteboard_toolbar` to size the window exactly.
const TOOLBAR_SIZE: (f64, f64) = (840.0, 50.0);
const TOOLBAR_TOP_GAP: f64 = 12.0;

static NEXT_ID: AtomicU32 = AtomicU32::new(1);

#[derive(Default)]
struct Inner {
    mode: String,
    layer: Option<String>,
    toolbar: Option<String>,
}

/// Managed as app state. An async mutex so a whole mode change runs at a time.
#[derive(Default)]
pub struct Whiteboard(Mutex<Inner>);

fn escape() -> Shortcut {
    Shortcut::new(None, Code::Escape)
}

/// Called by the global-shortcut handler (lib.rs) for any registered shortcut.
pub fn on_shortcut(app: &AppHandle, shortcut: &Shortcut) {
    if *shortcut == escape() {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = set_mode(&app, "off").await;
        });
    }
}

#[tauri::command]
pub async fn whiteboard_mode(state: tauri::State<'_, Whiteboard>) -> Result<String, String> {
    let inner = state.0.lock().await;
    Ok(if inner.mode.is_empty() { "off".into() } else { inner.mode.clone() })
}

#[tauri::command]
pub async fn set_whiteboard_mode(app: AppHandle, mode: String) -> Result<(), String> {
    set_mode(&app, &mode).await
}

pub async fn set_mode(app: &AppHandle, mode: &str) -> Result<(), String> {
    let err = |e: tauri::Error| e.to_string();
    let state = app.state::<Whiteboard>();
    let mut inner = state.0.lock().await;

    match mode {
        "off" => {
            for label in [inner.layer.take(), inner.toolbar.take()].into_iter().flatten() {
                if let Some(window) = app.get_webview_window(&label) {
                    let _ = window.destroy();
                }
            }
        }
        "draw" | "view" => {
            let layer = match inner.layer.as_deref().and_then(|l| app.get_webview_window(l)) {
                Some(w) => w,
                None => {
                    let w = create_layer(app).map_err(err)?;
                    inner.layer = Some(w.label().to_string());
                    w
                }
            };
            layer.set_ignore_cursor_events(mode == "view").map_err(err)?;

            let toolbar = match inner.toolbar.as_deref().and_then(|l| app.get_webview_window(l)) {
                Some(w) => w,
                None => {
                    let w = create_toolbar(app, &layer).map_err(err)?;
                    inner.toolbar = Some(w.label().to_string());
                    w
                }
            };
            if mode == "draw" {
                toolbar.show().map_err(err)?;
                // The layer never takes focus (see create_layer), so the toolbar gets
                // the keyboard for Ctrl+Z / Ctrl+Y.
                toolbar.set_focus().map_err(err)?;
            } else {
                toolbar.hide().map_err(err)?;
            }
            // The layer and toolbar are always-on-top too; keep the OzBox tile above them.
            if let Some(main) = app.get_webview_window("main") {
                bring_to_top(&main);
            }
        }
        _ => return Err(format!("Unknown whiteboard mode: {mode}")),
    }

    // Esc as a native shortcut only while drawing; it's everyone's Esc otherwise.
    let shortcuts = app.global_shortcut();
    if mode == "draw" {
        if !shortcuts.is_registered(escape()) {
            let _ = shortcuts.register(escape());
        }
    } else if shortcuts.is_registered(escape()) {
        let _ = shortcuts.unregister(escape());
    }

    inner.mode = mode.to_string();
    let _ = app.emit(MODE_EVENT, mode);
    Ok(())
}

/// The toolbar measured its buttons (`width`, logical px): resize it to fit exactly
/// and keep it centered over the layer.
#[tauri::command]
pub async fn fit_whiteboard_toolbar(app: AppHandle, window: WebviewWindow, width: f64) -> Result<(), String> {
    let err = |e: tauri::Error| e.to_string();
    let state = app.state::<Whiteboard>();
    let inner = state.0.lock().await;
    let Some(layer) = inner.layer.as_deref().and_then(|l| app.get_webview_window(l)) else {
        return Ok(());
    };
    let scale = window.scale_factor().map_err(err)?;
    let (pw, ph) = ((width * scale).round() as i32, (TOOLBAR_SIZE.1 * scale).round() as i32);
    let pos = layer.outer_position().map_err(err)?;
    let layer_size = layer.outer_size().map_err(err)?;
    window.set_size(PhysicalSize::new(pw as u32, ph as u32)).map_err(err)?;
    window
        .set_position(PhysicalPosition::new(
            pos.x + (layer_size.width as i32 - pw) / 2,
            pos.y + (TOOLBAR_TOP_GAP * scale).round() as i32,
        ))
        .map_err(err)
}

/// Move a topmost window to the top of the always-on-top layer.
fn bring_to_top(window: &WebviewWindow) {
    #[cfg(windows)]
    if let Ok(hwnd) = window.hwnd() {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
        };
        unsafe {
            let _ = SetWindowPos(
                HWND(hwnd.0),
                Some(HWND_TOPMOST),
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            );
        }
    }
    #[cfg(not(windows))]
    let _ = window.set_always_on_top(true);
}

/// A transparent, borderless, always-on-top window covering the work area (screen
/// minus taskbar) of the monitor under the cursor.
fn create_layer(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let label = format!("whiteboard-{}", NEXT_ID.fetch_add(1, Ordering::SeqCst));
    let window = WebviewWindowBuilder::new(app, label, WebviewUrl::App("whiteboard.html".into()))
        .title("OzBox whiteboard")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        // Drawing a 4K transparent layer wants the GPU (OzBox itself runs without it).
        .data_directory(crate::pin::gpu_profile(app)?)
        .additional_browser_args(crate::pin::GPU_BROWSER_ARGS)
        .build()?;

    // Clicking a window activates it, and activating an always-on-top window lifts it
    // above the others: drawing would bury the toolbar and the OzBox tile under the
    // (transparent) layer, so the layer never activates.
    #[cfg(windows)]
    if let Ok(hwnd) = window.hwnd() {
        let hwnd = windows::Win32::Foundation::HWND(hwnd.0);
        crate::frame::set_no_activate(hwnd);
        crate::frame::hook_window_messages(hwnd, crate::frame::Hook::NoActivate);
    }

    let cursor = app.cursor_position()?;
    let monitor = app
        .monitor_from_point(cursor.x, cursor.y)?
        .or(app.primary_monitor()?);
    if let Some(monitor) = monitor {
        let area = monitor.work_area();
        window.set_position(PhysicalPosition::new(area.position.x, area.position.y))?;
        window.set_size(PhysicalSize::new(area.size.width, area.size.height))?;
    }
    window.show()?;
    Ok(window)
}

/// The glass toolbar: its own acrylic window, centered at the top of the layer.
fn create_toolbar(app: &AppHandle, layer: &WebviewWindow) -> tauri::Result<WebviewWindow> {
    let label = format!("wbbar-{}", NEXT_ID.fetch_add(1, Ordering::SeqCst));
    let (w, h) = TOOLBAR_SIZE;
    let window = WebviewWindowBuilder::new(app, label, WebviewUrl::App("wb-toolbar.html".into()))
        .title("OzBox whiteboard tools")
        .inner_size(w, h)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .effects(EffectsBuilder::new().effect(Effect::Acrylic).color(Color(255, 255, 255, 4)).build())
        // Owned by the layer: Windows always keeps an owned window above its owner
        // (and closes it along with the owner).
        .parent(layer)?
        // Same profile and arguments as the main OzBox window (see tauri.conf.json).
        .additional_browser_args(crate::pin::OZBOX_BROWSER_ARGS)
        .build()?;

    #[cfg(windows)]
    if let Ok(hwnd) = window.hwnd() {
        let hwnd = windows::Win32::Foundation::HWND(hwnd.0);
        crate::frame::style_glass_frame(hwnd);
        crate::frame::hook_window_messages(hwnd, crate::frame::Hook::Glass);
    }

    let pos = layer.outer_position()?;
    let layer_size = layer.outer_size()?;
    let scale = layer.scale_factor()?;
    let (pw, ph) = ((w * scale).round() as i32, (h * scale).round() as i32);
    window.set_size(PhysicalSize::new(pw as u32, ph as u32))?;
    window.set_position(PhysicalPosition::new(
        pos.x + (layer_size.width as i32 - pw) / 2,
        pos.y + (TOOLBAR_TOP_GAP * scale).round() as i32,
    ))?;
    Ok(window)
}
