use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, Runtime,
};

pub fn create_tray<R: Runtime>(app: &tauri::App<R>) -> Result<(), Box<dyn std::error::Error>> {
    let show_item = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
    let status_item = MenuItem::with_id(app, "status", "Status: Stopped", false, None::<&str>)?;
    let separator1 = MenuItem::with_id(app, "sep1", "─────────", false, None::<&str>)?;
    let start_item = MenuItem::with_id(app, "start", "Start Service", true, None::<&str>)?;
    let stop_item = MenuItem::with_id(app, "stop", "Stop Service", true, None::<&str>)?;
    let restart_item = MenuItem::with_id(app, "restart", "Restart Service", true, None::<&str>)?;
    let separator2 = MenuItem::with_id(app, "sep2", "─────────", false, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &show_item,
            &status_item,
            &separator1,
            &start_item,
            &stop_item,
            &restart_item,
            &separator2,
            &quit_item,
        ],
    )?;

    // Load tray icon - use template icon for macOS menu bar
    // Template icons should be black on transparent, macOS handles light/dark mode
    let icon_bytes = include_bytes!("../icons/tray-template@2x.png");
    let icon = tauri::image::Image::from_bytes(icon_bytes)
        .unwrap_or_else(|_| tauri::image::Image::new(&[0, 0, 0, 255], 1, 1));

    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .icon_as_template(true) // macOS: treat as template image (adapts to light/dark mode)
        .menu(&menu)
        .tooltip("SkuldBot Runner")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "start" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.eval("window.__startRunner && window.__startRunner()");
                }
            }
            "stop" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.eval("window.__stopRunner && window.__stopRunner()");
                }
            }
            "restart" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.eval("window.__restartRunner && window.__restartRunner()");
                }
            }
            "quit" => {
                // Stop runner if running, then exit
                if let Some(state) = app.try_state::<crate::runner::RunnerState>() {
                    let _ = state.stop();
                }
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                // Show window on left click
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}
