use std::sync::Arc;

use serde_json::{Value, json};
use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, Position, Runtime, Size,
    WebviewWindow, WindowEvent,
};
use tauri_plugin_store::StoreBuilder;

pub(crate) fn parse_geometry(value: &str) -> Option<(u32, u32, i32, i32)> {
    let mut parts = value.split('+');
    let size_part = parts.next()?;
    let mut size_split = size_part.split('x');
    let width = size_split.next()?.parse::<u32>().ok()?;
    let height = size_split.next()?.parse::<u32>().ok()?;
    let x = parts.next()?.parse::<i32>().ok()?;
    let y = parts.next()?.parse::<i32>().ok()?;
    Some((width, height, x, y))
}

pub(crate) fn format_geometry(size: PhysicalSize<u32>, position: PhysicalPosition<i32>) -> String {
    format!(
        "{}x{}+{}+{}",
        size.width, size.height, position.x, position.y
    )
}

pub(crate) fn update_window_settings<R: Runtime>(
    store: &Arc<tauri_plugin_store::Store<R>>,
    geometry: Option<String>,
    state: Option<String>,
) {
    let mut data = store.get("settings").unwrap_or_else(|| json!({}));
    if !data.is_object() {
        data = json!({});
    }

    {
        let root = data
            .as_object_mut()
            .expect("settings root should be an object");
        let settings_value = root.entry("settings").or_insert_with(|| json!({}));

        if !settings_value.is_object() {
            *settings_value = json!({});
        }

        if let Some(settings_obj) = settings_value.as_object_mut() {
            if let Some(geom) = geometry {
                settings_obj.insert("main_window_geometry".into(), json!(geom));
            }
            if let Some(state_str) = state {
                settings_obj.insert("main_window_state".into(), json!(state_str));
            }
        }
    }

    store.set("settings", data);
}

pub(crate) fn capture_window_state<R: Runtime>(
    window: &WebviewWindow<R>,
    store: &Arc<tauri_plugin_store::Store<R>>,
) {
    let is_minimized = window.is_minimized().unwrap_or(false);
    let is_maximized = window.is_maximized().unwrap_or(false);

    let state = if is_minimized {
        "minimized".to_string()
    } else if is_maximized {
        "maximized".to_string()
    } else {
        "normal".to_string()
    };

    let geometry = if state == "normal" {
        match (window.outer_size(), window.outer_position()) {
            (Ok(size), Ok(position)) => Some(format_geometry(size, position)),
            _ => None,
        }
    } else {
        None
    };

    update_window_settings(store, geometry, Some(state));
}

pub(crate) fn restore_window_state<R: Runtime>(
    window: &WebviewWindow<R>,
    store: &Arc<tauri_plugin_store::Store<R>>,
) {
    let Some(settings_value) = store.get("settings") else {
        return;
    };

    let Some(settings_obj) = settings_value.get("settings").and_then(Value::as_object) else {
        return;
    };

    if let Some(geometry_str) = settings_obj
        .get("main_window_geometry")
        .and_then(Value::as_str)
    {
        if let Some((width, height, x, y)) = parse_geometry(geometry_str) {
            if let Err(err) = window.set_size(Size::Physical(PhysicalSize { width, height })) {
                eprintln!("[window-state] Failed to apply window size: {}", err);
            }
            if let Err(err) = window.set_position(Position::Physical(PhysicalPosition { x, y })) {
                eprintln!("[window-state] Failed to apply window position: {}", err);
            }
        }
    }

    if let Some(state_str) = settings_obj
        .get("main_window_state")
        .and_then(Value::as_str)
    {
        match state_str {
            "maximized" => {
                if let Err(err) = window.maximize() {
                    eprintln!("[window-state] Failed to maximize window: {}", err);
                }
            }
            "minimized" => {
                if let Err(err) = window.minimize() {
                    eprintln!("[window-state] Failed to minimize window: {}", err);
                }
            }
            _ => {
                let _ = window.unmaximize();
                let _ = window.unminimize();
            }
        }
    }
}

pub(crate) fn position_mini_window<R: Runtime>(app_handle: &AppHandle<R>, window: &WebviewWindow<R>) {
    const MARGIN_BOTTOM: i32 = 32;

    let window_size = window
        .outer_size()
        .ok()
        .unwrap_or_else(|| PhysicalSize::new(320, 76));

    let target_monitor = app_handle
        .get_webview_window("main")
        .and_then(|main| main.current_monitor().ok().flatten())
        .or_else(|| window.current_monitor().ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten());

    let Some(monitor) = target_monitor else {
        return;
    };

    let monitor_size = monitor.size();
    let monitor_position = monitor.position();

    let window_width = window_size.width as i32;
    let window_height = window_size.height as i32;

    let centered_x = monitor_position.x + ((monitor_size.width as i32 - window_width) / 2);
    let bottom_y = monitor_position.y + monitor_size.height as i32 - window_height - MARGIN_BOTTOM;

    let new_position = PhysicalPosition {
        x: centered_x,
        y: bottom_y.max(monitor_position.y),
    };

    let _ = window.set_position(Position::Physical(new_position));
}

pub(crate) fn show_mini_window<R: Runtime>(app_handle: &AppHandle<R>) {
    if let Some(mini_window) = app_handle.get_webview_window("mini") {
        position_mini_window(app_handle, &mini_window);

        #[cfg(windows)]
        {
            if let Ok(hwnd) = mini_window.hwnd() {
                const SW_SHOWNOACTIVATE: i32 = 4;
                unsafe {
                    windows_sys::Win32::UI::WindowsAndMessaging::ShowWindow(
                        hwnd.0,
                        SW_SHOWNOACTIVATE,
                    );
                }
                return;
            }
        }

        let _ = mini_window.show();
    }
}

pub(crate) fn hide_mini_window<R: Runtime>(app_handle: &AppHandle<R>) {
    if let Some(mini_window) = app_handle.get_webview_window("mini") {
        #[cfg(windows)]
        {
            if let Ok(hwnd) = mini_window.hwnd() {
                const SW_HIDE: i32 = 0;
                unsafe {
                    windows_sys::Win32::UI::WindowsAndMessaging::ShowWindow(
                        hwnd.0,
                        SW_HIDE,
                    );
                }
                return;
            }
        }
        let _ = mini_window.hide();
    }
}

/// Create the mini visualizer window at startup (hidden by default)
pub(crate) fn create_mini_window(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::WebviewUrl;
    use tauri::WebviewWindowBuilder;

    let mini = WebviewWindowBuilder::new(app, "mini", WebviewUrl::App("mini.html".into()))
        .title("Voice Tool - Mini")
        .inner_size(233.0, 42.0)
        .resizable(true)
        .decorations(false)
        .always_on_top(true)
        .transparent(true)
        .visible(false)
        .focusable(false)
        .build()?;

    position_mini_window(app, &mini);

    Ok(())
}

/// Setup main window: restore state, register event handlers, handle --minimized flag
pub(crate) fn setup_main_window(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    let has_minimized_flag = args
        .iter()
        .any(|arg| arg == "--minimized" || arg == "--hidden");

    let settings_path = crate::profiles::settings_store_path(&app.handle());
    let window_store = StoreBuilder::new(app, settings_path).build()?;

    let should_start_minimized = if has_minimized_flag {
        let start_minimized = window_store
            .get("settings")
            .and_then(|settings_root| {
                settings_root.get("settings").and_then(|settings_obj| {
                    settings_obj
                        .get("start_minimized_on_boot")
                        .and_then(|v| v.as_bool())
                })
            })
            .unwrap_or(true);
        start_minimized
    } else {
        false
    };

    if let Some(window) = app.get_webview_window("main") {
        restore_window_state(&window, &window_store);

        if !should_start_minimized {
            let _ = window.show();
        }

        let events_store = window_store.clone();
        let events_window = window.clone();
        window.on_window_event(move |event| {
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    capture_window_state(&events_window, &events_store);
                    if let Err(err) = events_store.save() {
                        eprintln!("[window-state] Failed to save settings: {}", err);
                    }
                    api.prevent_close();
                    let _ = events_window.hide();
                }
                WindowEvent::Resized(_)
                | WindowEvent::Moved(_)
                | WindowEvent::ScaleFactorChanged { .. } => {
                    capture_window_state(&events_window, &events_store);
                }
                _ => {}
            }
        });
    }

    Ok(())
}
