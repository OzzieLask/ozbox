//! Frame pacing shared by the window animations (drag glide, morph).

/// Block until the next compositor frame, so movement matches the display's refresh rate.
#[cfg(windows)]
pub fn wait_frame() {
    use windows::Win32::Graphics::Dwm::DwmFlush;

    if unsafe { DwmFlush() }.is_err() {
        std::thread::sleep(std::time::Duration::from_millis(8));
    }
}

#[cfg(not(windows))]
pub fn wait_frame() {
    std::thread::sleep(std::time::Duration::from_millis(8));
}
