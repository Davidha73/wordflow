use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::process::Command;
use font_kit::source::SystemSource;
use serde::Deserialize;
use tauri::Manager;

mod grammar;
mod spellcheck;

#[derive(Deserialize)]
struct WindowSettings {
    width: Option<u32>,
    height: Option<u32>,
    x: Option<i32>,
    y: Option<i32>,
    maximized: Option<bool>,
}

#[derive(Deserialize)]
struct AppSettings {
    window: Option<WindowSettings>,
}

fn restore_window_from_settings(app: &tauri::App, window: &tauri::WebviewWindow) -> bool {
    let Ok(config_dir) = app.path().app_config_dir() else {
        return false;
    };
    let Ok(raw) = fs::read_to_string(config_dir.join("settings.json")) else {
        return false;
    };
    let Ok(settings) = serde_json::from_str::<AppSettings>(&raw) else {
        return false;
    };
    let Some(win) = settings.window else {
        return false;
    };

    if let (Some(w), Some(h)) = (win.width, win.height) {
        if w >= 400 && h >= 300 {
            let _ = window.set_size(tauri::PhysicalSize::new(w, h));
        }
    }
    let mut positioned = false;
    if let (Some(x), Some(y)) = (win.x, win.y) {
        if x > -10000 && y > -10000 {
            let on_screen = window
                .available_monitors()
                .map(|monitors| {
                    monitors.into_iter().any(|m| {
                        let pos = m.position();
                        let size = m.size();
                        x >= pos.x - 100
                            && y >= pos.y - 100
                            && x < pos.x + size.width as i32
                            && y < pos.y + size.height as i32
                    })
                })
                .unwrap_or(true);
            if on_screen {
                let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
                positioned = true;
            }
        }
    }
    if !positioned {
        let _ = window.center();
    }
    win.maximized.unwrap_or(false)
}

#[tauri::command]
fn get_system_fonts() -> Result<Vec<String>, String> {
    let families = SystemSource::new()
        .all_families()
        .map_err(|err| format!("Failed to enumerate system fonts: {err}"))?;

    let mut seen = HashSet::new();
    let mut fonts: Vec<String> = families
        .into_iter()
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty() && !name.starts_with('@') && !name.starts_with('.'))
        .filter(|name| seen.insert(name.clone()))
        .collect();

    fonts.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()).then_with(|| a.cmp(b)));
    Ok(fonts)
}

#[tauri::command]
fn show_in_explorer(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if !target.exists() {
        return Err("File no longer exists on disk.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(format!("/select,{}", path))
            .spawn()
            .map_err(|err| format!("Failed to open Explorer: {err}"))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|err| format!("Failed to open Finder: {err}"))?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let parent = target.parent().unwrap_or(target);
        Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|err| format!("Failed to open file manager: {err}"))?;
    }

    Ok(())
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    let lower = trimmed.to_ascii_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("mailto:")) {
        return Err("Unsupported URL scheme. Only http, https, and mailto links are allowed.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", trimmed])
            .spawn()
            .map_err(|err| format!("Failed to open URL: {err}"))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(trimmed)
            .spawn()
            .map_err(|err| format!("Failed to open URL: {err}"))?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(trimmed)
            .spawn()
            .map_err(|err| format!("Failed to open URL: {err}"))?;
    }

    Ok(())
}

#[tauri::command]
fn print_document(window: tauri::WebviewWindow) -> Result<(), String> {
    window
        .print()
        .map_err(|err| format!("Failed to open print dialog: {err}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let blank_icon = tauri::image::Image::new_owned(vec![0, 0, 0, 0], 1, 1);
                let _ = window.set_icon(blank_icon);
                if window.is_minimized().unwrap_or(false) {
                    let _ = window.unminimize();
                }
                let should_maximize = restore_window_from_settings(app, &window);
                let _ = window.show();
                if should_maximize {
                    let _ = window.maximize();
                }
                let _ = window.set_focus();
            }
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_system_fonts,
            show_in_explorer,
            open_external_url,
            print_document,
            spellcheck::check_word_spelling,
            spellcheck::add_word_to_dictionary,
            spellcheck::get_custom_dictionary,
            spellcheck::remove_word_from_dictionary,
            spellcheck::clear_custom_dictionary,
            grammar::check_grammar
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
