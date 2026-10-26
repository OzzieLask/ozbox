//! Morphing the window between the collapsed tile and expanded layouts. The window
//! grows away from the nearest screen edges, keeping the corner where the tile sits
//! fixed, and animates position + size together on its own frame-paced thread.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Instant;
use tauri::WebviewWindow;

use crate::pacing::wait_frame;

/// Collapsed tile size, in logical px. Must match the window size in tauri.conf.json.
const TILE: f64 = 56.0;
/// Morph animation length, in seconds.
const DURATION: f64 = 0.24;

/// Bumped on every morph so a newer one cancels an animation still running.
static GENERATION: AtomicU64 = AtomicU64::new(0);
// Which corner the tile is anchored to. Decided when expanding from the tile and
// kept until the next expansion, so collapsing shrinks back into the same spot.
static ANCHOR_RIGHT: AtomicBool = AtomicBool::new(false);
static ANCHOR_BOTTOM: AtomicBool = AtomicBool::new(false);

/// Which edges of the window stay put while it grows: the frontend mirrors its
/// layout to match, so the OZ button stays where the tile was.
#[derive(Clone, Copy, Serialize)]
pub struct Anchor {
    right: bool,
    bottom: bool,
}

#[derive(Clone, Copy)]
struct Rect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

/// Animate the window to `width` x `height` (logical px). Returns the anchor used.
#[tauri::command]
pub fn morph(window: WebviewWindow, width: f64, height: f64) -> Result<Anchor, String> {
    let err = |e: tauri::Error| e.to_string();
    let scale = window.scale_factor().map_err(err)?;
    let pos = window.outer_position().map_err(err)?;
    let size = window.outer_size().map_err(err)?;
    let from = Rect {
        x: pos.x as f64,
        y: pos.y as f64,
        w: size.width as f64,
        h: size.height as f64,
    };

    let tile = (TILE * scale).round();
    let collapsed = (from.w - tile).abs() < 2.0 && (from.h - tile).abs() < 2.0;
    if collapsed {
        // Grow toward the roomier side of the monitor the tile is on.
        if let Ok(Some(monitor)) = window.current_monitor() {
            let area = monitor.work_area();
            let center_x = area.position.x as f64 + area.size.width as f64 / 2.0;
            let center_y = area.position.y as f64 + area.size.height as f64 / 2.0;
            ANCHOR_RIGHT.store(from.x + from.w / 2.0 > center_x, Ordering::SeqCst);
            ANCHOR_BOTTOM.store(from.y + from.h / 2.0 > center_y, Ordering::SeqCst);
        }
    }
    let anchor = Anchor {
        right: ANCHOR_RIGHT.load(Ordering::SeqCst),
        bottom: ANCHOR_BOTTOM.load(Ordering::SeqCst),
    };

    let (w, h) = ((width * scale).round(), (height * scale).round());
    let to = Rect {
        x: if anchor.right {
            from.x + from.w - w
        } else {
            from.x
        },
        y: if anchor.bottom {
            from.y + from.h - h
        } else {
            from.y
        },
        w,
        h,
    };

    let id = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    std::thread::spawn(move || animate(window, from, to, id));
    Ok(anchor)
}

fn animate(window: WebviewWindow, from: Rect, to: Rect, id: u64) {
    let start = Instant::now();
    loop {
        wait_frame();
        if GENERATION.load(Ordering::SeqCst) != id {
            return;
        }
        let t = (start.elapsed().as_secs_f64() / DURATION).min(1.0);
        let e = 1.0 - (1.0 - t).powi(3); // ease-out cubic
        let lerp = |a: f64, b: f64| a + (b - a) * e;
        set_rect(
            &window,
            Rect {
                x: lerp(from.x, to.x),
                y: lerp(from.y, to.y),
                w: lerp(from.w, to.w),
                h: lerp(from.h, to.h),
            },
        );
        if t >= 1.0 {
            return;
        }
    }
}

/// Move and resize in one call; separate move + resize calls make the anchored
/// edge visibly jitter.
#[cfg(windows)]
fn set_rect(window: &WebviewWindow, r: Rect) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        SWP_NOACTIVATE, SWP_NOOWNERZORDER, SWP_NOZORDER, SetWindowPos,
    };

    let Ok(hwnd) = window.hwnd() else { return };
    // Snap both edges, then derive size, so the anchored edge never wobbles by a pixel.
    let (left, top) = (r.x.round() as i32, r.y.round() as i32);
    let (right, bottom) = ((r.x + r.w).round() as i32, (r.y + r.h).round() as i32);
    unsafe {
        let _ = SetWindowPos(
            HWND(hwnd.0),
            None,
            left,
            top,
            right - left,
            bottom - top,
            SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOOWNERZORDER,
        );
    }
}

#[cfg(not(windows))]
fn set_rect(window: &WebviewWindow, r: Rect) {
    use tauri::{PhysicalPosition, PhysicalSize};

    let _ = window.set_size(PhysicalSize::new(r.w.round() as u32, r.h.round() as u32));
    let _ = window.set_position(PhysicalPosition::new(
        r.x.round() as i32,
        r.y.round() as i32,
    ));
}
