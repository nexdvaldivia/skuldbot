// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod protection;
mod runner;
mod secrets;
mod tray;

use tauri::{Manager, RunEvent};
use tauri_plugin_autostart::MacosLauncher;

fn main() {
    // Run protection checks in release mode
    #[cfg(not(debug_assertions))]
    {
        if let Err(e) = protection::run_protection_checks() {
            eprintln!("Security check failed: {}", e);
            std::process::exit(1);
        }
    }

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // When user tries to open another instance, show the existing window
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            // Initialize tray
            tray::create_tray(app)?;

            // Initialize runner state
            let state = runner::RunnerState::new();
            app.manage(state);

            // Load config
            let config = config::load_config();
            app.manage(config);

            // Check if started minimized
            let args: Vec<String> = std::env::args().collect();
            if !args.contains(&"--minimized".to_string()) {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Config commands
            config::get_config,
            config::save_config,
            config::test_connection,
            // Runner commands
            runner::get_status,
            runner::start_runner,
            runner::stop_runner,
            runner::restart_runner,
            runner::register_runner,
            // System commands
            runner::get_system_info,
            runner::get_logs,
            // Autostart
            runner::enable_autostart,
            runner::disable_autostart,
            runner::is_autostart_enabled,
            // Protection commands
            protection::validate_license,
            protection::check_license_status,
            protection::get_machine_fingerprint,
            // Secrets commands
            secrets::list_secrets,
            secrets::set_secret,
            secrets::get_secret,
            secrets::delete_secret,
            secrets::has_secret,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        match event {
            RunEvent::ExitRequested { api, .. } => {
                // Prevent exit, minimize to tray instead
                api.prevent_exit();
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            RunEvent::Exit => {
                // Cleanup: stop runner service if running
                if let Some(state) = app_handle.try_state::<runner::RunnerState>() {
                    let _ = state.stop();
                }
            }
            _ => {}
        }
    });
}
