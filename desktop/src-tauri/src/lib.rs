use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

/// Holds the brein sidecar child process so we can kill it when the app quits.
struct BreinProcess(Mutex<Option<Child>>);

/// Loopback port the brein listens on. The static frontend is built with the
/// matching NEXT_PUBLIC_BREIN_URL=http://127.0.0.1:8765.
const BREIN_PORT: &str = "8765";

/// Origins the bundled webview presents to the brein, so its CORS layer lets the
/// client-side fetches through. macOS/Linux use `tauri://localhost`; Windows uses
/// `http(s)://tauri.localhost`; `localhost:3000` covers `tauri dev`.
const BREIN_CORS_ORIGINS: &str =
    "tauri://localhost,http://tauri.localhost,https://tauri.localhost,http://localhost:3000";

/// Resolve the brein sidecar executable.
/// Prod: bundled under the app's resource dir at `binaries/coeus-brein/coeus-brein[.exe]`.
/// Dev (`tauri dev`, no bundled resource): fall back to `$COEUS_BREIN_BIN` if set.
/// Returns None when no binary is found — in dev you run the brein yourself.
fn resolve_sidecar(app: &tauri::App) -> Option<PathBuf> {
    let exe = if cfg!(windows) { "coeus-brein.exe" } else { "coeus-brein" };

    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("binaries/coeus-brein").join(exe);
        if bundled.exists() {
            return Some(bundled);
        }
    }

    if let Ok(dev_bin) = std::env::var("COEUS_BREIN_BIN") {
        let p = PathBuf::from(dev_bin);
        if p.exists() {
            return Some(p);
        }
    }

    None
}

/// Spawn the brein sidecar on the loopback port, pointed at a writable per-user
/// data dir (the installed .app bundle is read-only, so ChromaDB cannot live
/// inside it). Best-effort: in dev with no bundled binary we just skip and the
/// frontend's `waitForBrein` connects to a manually-run brein.
fn spawn_brein(app: &tauri::App) {
    let data_dir = match app.path().app_data_dir() {
        Ok(dir) => dir,
        Err(e) => {
            eprintln!("[coeus] could not resolve app_data_dir: {e}");
            return;
        }
    };
    if let Err(e) = std::fs::create_dir_all(&data_dir) {
        eprintln!("[coeus] could not create data dir {data_dir:?}: {e}");
        return;
    }

    let Some(bin) = resolve_sidecar(app) else {
        eprintln!("[coeus] no brein sidecar bundled — assuming a dev brein on :{BREIN_PORT}");
        return;
    };

    // PyInstaller output is executable, but a copied resource can lose the bit
    // on some toolchains — re-assert it on unix.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755));
    }

    let mut cmd = Command::new(&bin);
    cmd.env("COEUS_DATA_DIR", &data_dir)
        .env("COEUS_PORT", BREIN_PORT)
        .env("COEUS_CORS_ORIGINS", BREIN_CORS_ORIGINS);

    // Per-client seed: a white-label build can drop a `seed/client-seed.json`
    // resource. When present, point the brein at it (overrides the brein's own
    // bundled garage demo); absent → the default seed ships.
    if let Ok(resource_dir) = app.path().resource_dir() {
        let client_seed = resource_dir.join("seed/client-seed.json");
        if client_seed.exists() {
            cmd.env("COEUS_SEED_FILE", &client_seed);
        }
    }

    if let Some(parent) = bin.parent() {
        cmd.current_dir(parent);
    }

    match cmd.spawn() {
        Ok(child) => {
            println!("[coeus] brein sidecar started (pid {}) data={data_dir:?}", child.id());
            // Recover from a poisoned lock rather than panic — a panic here would
            // skip killing the child on exit (zombie uvicorn holding the port).
            let state = app.state::<BreinProcess>();
            let mut guard = state.0.lock().unwrap_or_else(|p| p.into_inner());
            guard.replace(child);
        }
        Err(e) => eprintln!("[coeus] failed to start brein sidecar {bin:?}: {e}"),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(BreinProcess(Mutex::new(None)))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            spawn_brein(app);

            // Load the bundled static export. In `tauri dev` this is served from
            // build.devUrl automatically; in a bundle it's the `out/` frontend.
            WebviewWindowBuilder::new(app.handle(), "main", WebviewUrl::App("index.html".into()))
                .title("Coeus")
                .inner_size(1280.0, 800.0)
                .min_inner_size(960.0, 640.0)
                .build()?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Coeus")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                // Don't leave a zombie uvicorn behind when the window closes.
                // Recover a poisoned lock so a kill still happens; reap the child.
                let child = app_handle
                    .state::<BreinProcess>()
                    .0
                    .lock()
                    .unwrap_or_else(|p| p.into_inner())
                    .take();
                if let Some(mut child) = child {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        });
}
