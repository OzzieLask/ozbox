//! Window dragging with momentum: the window follows the cursor while the pointer is
//! held, then glides to a stop after release. Runs on its own thread, paced to the
//! compositor's frame rate, so the frontend only has to say "start" and "released".

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use tauri::WebviewWindow;

/// How long the glide takes to lose ~63% of its speed. Larger = longer slide.
#[cfg(windows)]
const GLIDE_TIME_CONSTANT: f64 = 0.12;
/// Release speed cap, in physical px/s, so a flick can't fling it across the screen.
#[cfg(windows)]
const MAX_SPEED: f64 = 6000.0;
/// Below this speed (physical px/s) the glide stops.
#[cfg(windows)]
const STOP_SPEED: f64 = 30.0;
/// Release velocity is measured over this much of the end of the drag.
#[cfg(windows)]
const VELOCITY_WINDOW: std::time::Duration = std::time::Duration::from_millis(60);

/// Bumped on every new press so an older drag or glide still running stops.
static GENERATION: AtomicU64 = AtomicU64::new(0);
/// True while the pointer that started the drag is still down.
static HELD: AtomicBool = AtomicBool::new(false);

/// Start following the cursor. `pointer_type` comes from the DOM event: for a mouse
/// we also poll the button directly, in case the page misses the release.
#[tauri::command]
pub fn start_drag(window: WebviewWindow, pointer_type: String) {
    let id = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    HELD.store(true, Ordering::SeqCst);
    #[cfg(windows)]
    std::thread::spawn(move || imp::run(window, id, pointer_type == "mouse"));
    #[cfg(not(windows))]
    {
        let _ = (id, pointer_type);
        let _ = window.start_dragging();
    }
}

/// The pointer was released: stop following and start gliding.
#[tauri::command]
pub fn end_drag() {
    HELD.store(false, Ordering::SeqCst);
}

/// A new press on the tile: stop any glide in progress (catching it).
#[tauri::command]
pub fn stop_glide() {
    GENERATION.fetch_add(1, Ordering::SeqCst);
}

#[cfg(windows)]
mod imp {
    use super::*;
    use std::collections::VecDeque;
    use std::time::Instant;
    use tauri::PhysicalPosition;
    use windows::Win32::Foundation::POINT;
    use windows::Win32::Graphics::Dwm::DwmFlush;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_RBUTTON};
    use windows::Win32::UI::WindowsAndMessaging::{GetCursorPos, GetSystemMetrics, SM_SWAPBUTTON};

    type Vec2 = (f64, f64);

    pub fn run(window: WebviewWindow, id: u64, poll_mouse: bool) {
        let is_current = || GENERATION.load(Ordering::SeqCst) == id;
        let (Ok(start), Some(cursor)) = (window.outer_position(), cursor_pos()) else {
            return;
        };
        let offset = (cursor.0 - start.x as f64, cursor.1 - start.y as f64);
        let mut pos = (start.x as f64, start.y as f64);

        // Follow the cursor while held, keeping recent samples for velocity.
        let mut samples: VecDeque<(Instant, Vec2)> = VecDeque::new();
        while HELD.load(Ordering::SeqCst) && (!poll_mouse || primary_button_down()) {
            if !is_current() {
                return;
            }
            if let Some(c) = cursor_pos() {
                pos = (c.0 - offset.0, c.1 - offset.1);
                move_to(&window, pos);
                let now = Instant::now();
                samples.push_back((now, pos));
                while samples.len() > 2 && now - samples[0].0 > VELOCITY_WINDOW {
                    samples.pop_front();
                }
            }
            wait_frame();
        }

        let mut velocity = release_velocity(&samples);
        let (min, max) = glide_bounds(&window, pos);
        let mut last = Instant::now();

        // Glide, decaying exponentially, until it slows down or a new press stops it.
        while velocity.0.hypot(velocity.1) > STOP_SPEED {
            wait_frame();
            if !is_current() {
                return;
            }
            let now = Instant::now();
            let dt = (now - last).as_secs_f64().min(0.05);
            last = now;

            pos.0 += velocity.0 * dt;
            pos.1 += velocity.1 * dt;
            let decay = (-dt / GLIDE_TIME_CONSTANT).exp();
            velocity = (velocity.0 * decay, velocity.1 * decay);

            // Stop dead on whichever axis hits the screen edge.
            if pos.0 < min.0 || pos.0 > max.0 {
                pos.0 = pos.0.clamp(min.0, max.0);
                velocity.0 = 0.0;
            }
            if pos.1 < min.1 || pos.1 > max.1 {
                pos.1 = pos.1.clamp(min.1, max.1);
                velocity.1 = 0.0;
            }
            move_to(&window, pos);
        }
    }

    fn release_velocity(samples: &VecDeque<(Instant, Vec2)>) -> Vec2 {
        let (Some(&(t0, p0)), Some(&(t1, p1))) = (samples.front(), samples.back()) else {
            return (0.0, 0.0);
        };
        let dt = (t1 - t0).as_secs_f64();
        if dt <= 0.0 {
            return (0.0, 0.0);
        }
        let v = ((p1.0 - p0.0) / dt, (p1.1 - p0.1) / dt);
        let speed = v.0.hypot(v.1);
        if speed > MAX_SPEED {
            let scale = MAX_SPEED / speed;
            (v.0 * scale, v.1 * scale)
        } else {
            v
        }
    }

    /// Allowed top-left positions: inside the current monitor's work area. Widened to
    /// include `pos` so a window already partly off-screen doesn't jump on release.
    fn glide_bounds(window: &WebviewWindow, pos: Vec2) -> (Vec2, Vec2) {
        let unbounded = ((f64::MIN, f64::MIN), (f64::MAX, f64::MAX));
        let (Ok(Some(monitor)), Ok(size)) = (window.current_monitor(), window.outer_size())
        else {
            return unbounded;
        };
        let area = monitor.work_area();
        let min = (area.position.x as f64, area.position.y as f64);
        let max = (
            min.0 + area.size.width as f64 - size.width as f64,
            min.1 + area.size.height as f64 - size.height as f64,
        );
        (
            (min.0.min(pos.0), min.1.min(pos.1)),
            (max.0.max(pos.0), max.1.max(pos.1)),
        )
    }

    fn move_to(window: &WebviewWindow, pos: Vec2) {
        let _ = window.set_position(PhysicalPosition::new(pos.0.round() as i32, pos.1.round() as i32));
    }

    fn cursor_pos() -> Option<Vec2> {
        let mut p = POINT::default();
        unsafe { GetCursorPos(&mut p) }.ok()?;
        Some((p.x as f64, p.y as f64))
    }

    /// The user's primary button, which is the physical right one if buttons are swapped.
    fn primary_button_down() -> bool {
        let swapped = unsafe { GetSystemMetrics(SM_SWAPBUTTON) } != 0;
        let key = if swapped { VK_RBUTTON } else { VK_LBUTTON };
        (unsafe { GetAsyncKeyState(key.0 as i32) } as u16 & 0x8000) != 0
    }

    /// Block until the next compositor frame, so movement matches the display's refresh rate.
    fn wait_frame() {
        if unsafe { DwmFlush() }.is_err() {
            std::thread::sleep(std::time::Duration::from_millis(8));
        }
    }
}
