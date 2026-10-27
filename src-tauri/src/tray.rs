//! The system-tray icon: OzBox has no taskbar button or title bar, so this is
//! where you show/hide it, reset it, choose whether it starts with Windows, and quit.

use tauri::{
    App, AppHandle, Emitter, Manager, Wry,
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_autostart::ManagerExt;

/// Tells the frontend to collapse and move the tile back to its default spot.
pub const RESET_POSITION_EVENT: &str = "ozbox://reset-position";

pub fn build(app: &App) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(app, "toggle", "Hide OzBox", true, None::<&str>)?;
    let reset = MenuItem::with_id(app, "reset", "Reset position", true, None::<&str>)?;
    let whiteboard_off =
        MenuItem::with_id(app, "whiteboard-off", "Turn off whiteboard", true, None::<&str>)?;

    // Autostart registers this exe's path with Windows; a dev build launched that way
    // has no dev server to load its UI from, so only offer it in release builds.
    let installed = !cfg!(debug_assertions);
    let autostart = CheckMenuItem::with_id(
        app,
        "autostart",
        if installed {
            "Launch at startup"
        } else {
            "Launch at startup (installed app only)"
        },
        installed,
        installed && app.autolaunch().is_enabled().unwrap_or(false),
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "Quit OzBox", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &toggle,
            &reset,
            &whiteboard_off,
            &PredefinedMenuItem::separator(app)?,
            &autostart,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    let toggle_for_click = toggle.clone();
    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("OzBox")
        .menu(&menu)
        // Left-click toggles OzBox; right-click opens the menu.
        .show_menu_on_left_click(false)
        .on_tray_icon_event(move |tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_visibility(tray.app_handle(), &toggle_for_click);
            }
        })
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "toggle" => toggle_visibility(app, &toggle),
            "reset" => {
                set_visible(app, &toggle, true);
                let _ = app.emit(RESET_POSITION_EVENT, ());
            }
            "autostart" => {
                // The check mark has already flipped; make Windows match it.
                let want = autostart.is_checked().unwrap_or(false);
                let manager = app.autolaunch();
                let result = if want {
                    manager.enable()
                } else {
                    manager.disable()
                };
                if result.is_err() {
                    let _ = autostart.set_checked(!want);
                }
            }
            "whiteboard-off" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = crate::whiteboard::set_mode(&app, "off").await;
                });
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    Ok(())
}

fn toggle_visibility(app: &AppHandle, item: &MenuItem<Wry>) {
    let visible = app
        .get_webview_window("main")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    set_visible(app, item, !visible);
}

fn set_visible(app: &AppHandle, item: &MenuItem<Wry>, visible: bool) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = if visible {
        window.show()
    } else {
        window.hide()
    };
    let _ = item.set_text(if visible { "Hide OzBox" } else { "Show OzBox" });
}
