mod audio;
mod audio_trim;
mod auth;
mod chat;
mod commands;
mod folders;
mod hotkeys;
mod logging;
mod logs;
mod notes;
mod profiles;
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
            commands::recording::start_audio_monitor,
            commands::recording::stop_audio_monitor,
            commands::window::exit_app,
            commands::window::close_mini_window,
            commands::window::save_mini_window_geometry,
            commands::window::recenter_mini_window,
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
            commands::settings::set_post_process_enabled,
            commands::model::download_local_model,
            commands::model::check_local_model_exists,
            commands::model::any_local_model_exists,
            commands::model::delete_local_model,
            commands::system::get_system_info,
            commands::files::delete_recording_files,
            commands::ai::ai_process_text,
            commands::ai::post_process_text,
            notes::list_notes,
            notes::read_note,
            notes::create_note,
            notes::update_note,
            notes::delete_note,
            notes::search_notes,
            notes::get_backlinks,
            notes::toggle_note_favorite,
            notes::move_note_to_folder,
            notes::reorder_notes_in_folder,
            folders::list_folders,
            folders::create_folder,
            folders::rename_folder,
            folders::delete_folder,
            folders::reorder_folders,
            transcriptions::list_transcriptions,
            transcriptions::save_transcription,
            transcriptions::delete_transcription,
            transcriptions::clear_transcriptions,
            transcriptions::update_transcription,
            logs::list_logs,
            logs::save_log,
            logs::clear_logs,
            tray::update_tray_labels,
            commands::profiles::list_profiles,
            commands::profiles::get_active_profile,
            commands::profiles::get_active_profile_settings_path,
            commands::profiles::get_active_profile_notes_tabs_path,
            commands::profiles::get_active_profile_notes_sidebar_path,
            commands::profiles::create_profile,
            commands::profiles::rename_profile,
            commands::profiles::delete_profile,
            commands::profiles::switch_profile,
            commands::reset::reset_app_data,
            auth::store_refresh_token,
            auth::get_refresh_token,
            auth::clear_refresh_token,
            auth::get_or_create_device_id,
            auth::generate_oauth_state,
        ])
        .setup(move |app| {
            // Enable logging to frontend
            log_layer.set_app_handle(app.handle().clone());

            tracing::info!(
                "Voice Tool v{} started",
                app.package_info().version
            );

            // Profile system: migrate legacy data then init active profile
            if let Err(e) = profiles::migrate_legacy_to_default(app.handle()) {
                tracing::warn!("Profiles migration failed: {}", e);
            }
            if let Err(e) = profiles::init_active_profile(app.handle()) {
                tracing::error!("Failed to initialize active profile: {}", e);
            }

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
