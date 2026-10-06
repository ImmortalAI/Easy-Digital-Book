mod error;
mod fs_scope;
#[cfg(target_os = "macos")]
mod menu;
mod open_paths;
mod spell;

use std::path::Path;

use log::LevelFilter;
use open_paths::{OpenPathQueue, OPEN_PATHS_EVENT};
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_log::{Target, TargetKind};

fn handle_open_paths<R: Runtime>(app: &AppHandle<R>, paths: impl IntoIterator<Item = String>) {
    use tauri_plugin_fs::FsExt;

    let mut accepted = Vec::new();
    for path in paths {
        let path_ref = Path::new(&path);
        if path_ref
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("edb"))
            && fs_scope::admit_file(&app.fs_scope(), path_ref).is_ok()
        {
            accepted.push(path);
        }
    }
    if accepted.is_empty() {
        return;
    }

    let queue = app.state::<OpenPathQueue>();
    for path in &accepted {
        queue.push(path.clone());
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    // Payload is deliberately unit: listeners drain the queue through the
    // command, avoiding a subscribe/drain race or duplicate delivery.
    let _ = app.emit(OPEN_PATHS_EVENT, ());
}

fn handle_open_args<R: Runtime>(app: &AppHandle<R>, args: Vec<String>, _cwd: String) {
    handle_open_paths(app, args.into_iter().skip(1));
}

#[tauri::command]
fn take_pending_open_paths(state: State<'_, OpenPathQueue>) -> Vec<String> {
    state.take()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let startup_args: Vec<String> = std::env::args().skip(1).collect();
    #[cfg(debug_assertions)]
    let log_level = LevelFilter::Debug;
    #[cfg(not(debug_assertions))]
    let log_level = LevelFilter::Info;

    let builder = tauri::Builder::default();
    #[cfg(target_os = "macos")]
    let builder = builder.menu(menu::app_menu);

    builder
        .manage(OpenPathQueue::default())
        .plugin(tauri_plugin_single_instance::init(handle_open_args))
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::LogDir {
                        file_name: Some("easy-digital-book".into()),
                    }),
                    #[cfg(debug_assertions)]
                    Target::new(TargetKind::Stdout),
                ])
                .level(log_level)
                .max_file_size(5_000_000)
                .build(),
        )
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            app.manage(std::sync::Arc::new(spell::bundled_service(app.handle())));
            handle_open_paths(app.handle(), startup_args.clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            take_pending_open_paths,
            fs_scope::write_file_atomic_command,
            spell::spell_check_command,
            spell::spell_suggest_command
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // The body below is macOS-only. Without this the closure's
            // parameters are unused everywhere else, and CI builds the crate
            // with `-D warnings` on Linux and Windows too.
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                let paths = urls
                    .into_iter()
                    .filter_map(|url| url.to_file_path().ok())
                    .map(|path| path.to_string_lossy().into_owned());
                handle_open_paths(app, paths);
            }
        });
}
