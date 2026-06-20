use tauri::{WebviewUrl, WebviewWindowBuilder};

/// Resolve the kennisbank URL this build points at.
/// Priority: runtime env (handy in dev) → compile-time env baked per client → localhost.
fn target_url() -> String {
    if let Ok(url) = std::env::var("COEUS_APP_URL") {
        if !url.is_empty() {
            return url;
        }
    }
    if let Some(url) = option_env!("COEUS_APP_URL") {
        if !url.is_empty() {
            return url.to_string();
        }
    }
    "http://localhost:3000".to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let url = target_url();
            let parsed: tauri::Url = url
                .parse()
                .map_err(|e| format!("invalid COEUS_APP_URL '{url}': {e}"))?;

            WebviewWindowBuilder::new(app.handle(), "main", WebviewUrl::External(parsed))
                .title("Coeus")
                .inner_size(1280.0, 800.0)
                .min_inner_size(960.0, 640.0)
                .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Coeus");
}
