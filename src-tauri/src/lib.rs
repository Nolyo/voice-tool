mod audio;
mod chat;
mod commands;
mod hotkeys;
mod logging;
mod logs;
mod notes;
mod state;
mod transcription;
mod transcription_local;
mod transcriptions;
mod tray;
mod updater;
mod window;

// Re-export for transcription_local compatibility
pub use state::{AppState, WhisperCache, WhisperState};

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging system
    let log_layer = logging::init_logging();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(state::create_app_state())
        .invoke_handler(tauri::generate_handler![
            commands::files::greet,
            commands::recording::get_audio_devices,
            commands::recording::start_recording,
            commands::recording::stop_recording,
            commands::recording::is_recording,
            commands::window::exit_app,
            commands::window::set_mini_window_mode,
            commands::window::close_mini_window,
            commands::files::log_separator,
            commands::files::open_app_data_dir,
            commands::settings::is_autostart_enabled,
            commands::settings::set_autostart,
            commands::settings::update_hotkeys,
            commands::transcription::transcribe_audio,
            commands::transcription::load_recording,
            commands::misc::paste_text_to_active_window,
            commands::misc::type_text_at_cursor,
            updater::check_for_updates,
            updater::download_and_install_update,
            updater::is_updater_available,
            commands::settings::get_update_channel,
            commands::settings::set_update_channel,
            commands::settings::set_translate_mode,
            commands::model::download_local_model,
            commands::model::check_local_model_exists,
            commands::model::delete_local_model,
            commands::files::delete_recording_files,
            commands::ai::ai_process_text,
            notes::list_notes,
            notes::read_note,
            notes::create_note,
            notes::update_note,
            notes::delete_note,
            notes::search_notes,
            notes::toggle_note_favorite,
            transcriptions::list_transcriptions,
            transcriptions::save_transcription,
            transcriptions::delete_transcription,
            transcriptions::clear_transcriptions,
            transcriptions::update_transcription,
            logs::list_logs,
            logs::save_log,
            logs::clear_logs
        ])
        .setup(move |app| {
            // Enable logging to frontend
            log_layer.set_app_handle(app.handle().clone());

            // Migrations
            if let Err(e) = transcriptions::cleanup_legacy_transcriptions(app.handle()) {
                tracing::warn!("Failed to cleanup legacy transcriptions: {}", e);
            }
            if let Err(e) = logs::cleanup_legacy_logs(app.handle()) {
                tracing::warn!("Failed to cleanup legacy logs: {}", e);
            }
            match notes::migrate_notes_from_store(app.handle()) {
                Ok(count) if count > 0 => {
                    tracing::info!("Notes migration completed: {} notes migrated", count);
                }
                Err(e) => {
                    tracing::warn!("Notes migration failed: {}", e);
                }
                _ => {}
            }

            // Window setup
            window::create_mini_window(&app.handle())?;
            window::setup_main_window(app)?;

            // Hotkeys
            hotkeys::setup_initial_hotkeys(app)?;

            // Whisper preload in background (if Local provider is configured)
            transcription_local::preload_if_configured(app);

            // System tray
            tray::setup_tray(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
