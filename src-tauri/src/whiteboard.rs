//! The whiteboard: a see-through drawing layer over the screen the cursor is on.
//! - "draw": the layer takes the mouse/pen and shows its toolbar;
//! - "view": drawings stay visible but clicks pass through to the apps below;
//! - "off": the window is destroyed, so it costs nothing. Drawings are saved by the
//!   page itself (whiteboard.json) and come back next time.

use std::sync::Mutex;

use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

const LABEL: &str = "whiteboard";
/// Sent with the new mode ("off" | "draw" | "view") whenever it changes.
pub const MODE_EVENT: &str = "ozbox://whiteboard-mode";

/// The current mode. Managed as app state.
pub struct WhiteboardMode(Mutex<String>);

impl Default for WhiteboardMode {
    fn default() -> Self {
        Self(Mutex::new("off".into()))
    }
}

#[tauri::command]
pub fn whiteboard_mode(mode: tauri::State<'_, WhiteboardMode>) -> String {
    mode.0.lock().unwrap().clone()
}

#[tauri::command]
pub async fn set_whiteboard_mode(app: AppHandle, mode: String) -> Result<(), String> {
    let err = |e: tauri::Error| e.to_string();
    match mode.as_str() {
        "off" => {
            if let Some(window) = app.get_webview_window(LABEL) {
                window.destroy().map_err(err)?;
            }
        }
        "draw" | "view" => {
            let window = match app.get_webview_window(LABEL) {
                Some(w) => w,
                None => create(&app).map_err(err)?,
            };
            window.set_ignore_cursor_events(mode == "view").map_err(err)?;
            if mode == "draw" {
                window.set_focus().map_err(err)?;
            }
            // The layer is always-on-top too; keep the OzBox tile above it.
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.set_always_on_top(true);
            }
        }
        _ => return Err(format!("Unknown whiteboard mode: {mode}")),
    }
    *app.state::<WhiteboardMode>().0.lock().unwrap() = mode.clone();
    let _ = app.emit(MODE_EVENT, mode);
    Ok(())
}

/// A transparent, borderless, always-on-top window covering the work area (screen
/// minus taskbar) of the monitor under the cursor.
fn create(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("whiteboard.html".into()))
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
