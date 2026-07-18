use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

/// Holds the brein sidecar child process so we can kill it when the app quits.
struct BreinProcess(Mutex<Option<Child>>);

/// How many local backups to keep. Older `coeus-backup-*` dirs are pruned.
const BACKUP_KEEP: usize = 10;

/// One stored backup, surfaced to the settings UI.
#[derive(Serialize)]
struct BackupInfo {
    name: String,
    created_ms: u64,
    size_bytes: u64,
}

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

/// UTC timestamp `YYYYMMDD-HHMMSS` derived from the Unix epoch, no extra deps.
fn utc_stamp() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    // Days since epoch → civil date (Howard Hinnant's algorithm).
    let days = (secs / 86_400) as i64;
    let secs_of_day = secs % 86_400;
    let (hh, mm, ss) = (secs_of_day / 3600, (secs_of_day % 3600) / 60, secs_of_day % 60);

    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as i64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };

    format!("{y:04}{m:02}{d:02}-{hh:02}{mm:02}{ss:02}")
}

/// Recursively copy `src` into `dst`. Best-effort: a file that's momentarily
/// locked (the brein/ChromaDB sqlite may be writing) is retried once, then
/// skipped — copying the rest never fails the whole backup.
fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                eprintln!("[coeus] backup: skip unreadable entry in {src:?}: {e}");
                continue;
            }
        };
        let path = entry.path();
        let target = dst.join(entry.file_name());
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if is_dir {
            if let Err(e) = copy_dir_recursive(&path, &target) {
                eprintln!("[coeus] backup: skip subdir {path:?}: {e}");
            }
        } else if let Err(e) = std::fs::copy(&path, &target) {
            // Retry once for a transient lock, then skip and continue.
            std::thread::sleep(std::time::Duration::from_millis(150));
            if let Err(e2) = std::fs::copy(&path, &target) {
                eprintln!("[coeus] backup: skip locked/failed file {path:?}: {e} / {e2}");
            }
        }
    }
    Ok(())
}

/// Total byte size of a directory tree (best-effort; unreadable entries count 0).
fn dir_size(path: &Path) -> u64 {
    let mut total = 0;
    let Ok(read) = std::fs::read_dir(path) else {
        return 0;
    };
    for entry in read.flatten() {
        let p = entry.path();
        match entry.file_type() {
            Ok(t) if t.is_dir() => total += dir_size(&p),
            Ok(_) => total += entry.metadata().map(|m| m.len()).unwrap_or(0),
            Err(_) => {}
        }
    }
    total
}

/// Delete `coeus-backup-*` dirs beyond the newest `BACKUP_KEEP`, by name (the
/// timestamp suffix sorts chronologically).
fn prune_backups(backups_dir: &Path) {
    let mut dirs: Vec<PathBuf> = match std::fs::read_dir(backups_dir) {
        Ok(read) => read
            .flatten()
            .map(|e| e.path())
            .filter(|p| {
                p.is_dir()
                    && p.file_name()
                        .and_then(|n| n.to_str())
                        .map(|n| n.starts_with("coeus-backup-"))
                        .unwrap_or(false)
            })
            .collect(),
        Err(_) => return,
    };
    if dirs.len() <= BACKUP_KEEP {
        return;
    }
    dirs.sort(); // lexical == chronological given the timestamp suffix
    let remove = dirs.len() - BACKUP_KEEP;
    for old in dirs.into_iter().take(remove) {
        if let Err(e) = std::fs::remove_dir_all(&old) {
            eprintln!("[coeus] backup: could not prune {old:?}: {e}");
        }
    }
}

/// Resolve `<app_data_dir>/chroma` and `<app_data_dir>/backups`.
fn backup_paths(app: &tauri::AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("kon app-datamap niet bepalen: {e}"))?;
    Ok((data_dir.join("chroma"), data_dir.join("backups")))
}

/// Make one backup of the ChromaDB store; returns the new backup path. Returns
/// an error string only when there is nothing to back up or the copy can't even
/// be started — individual locked files are skipped inside the copy.
fn do_backup(chroma: &Path, backups_dir: &Path) -> Result<PathBuf, String> {
    if !chroma.exists() {
        return Err("er is nog geen kennisbank om te back-uppen".into());
    }
    let empty = std::fs::read_dir(chroma)
        .map(|mut it| it.next().is_none())
        .unwrap_or(true);
    if empty {
        return Err("de kennisbank is leeg — geen back-up gemaakt".into());
    }

    let dest = backups_dir.join(format!("coeus-backup-{}", utc_stamp()));
    copy_dir_recursive(chroma, &dest).map_err(|e| format!("back-up mislukt: {e}"))?;
    prune_backups(backups_dir);
    Ok(dest)
}

#[tauri::command]
fn backup_now(app: tauri::AppHandle) -> Result<String, String> {
    let (chroma, backups_dir) = backup_paths(&app)?;
    let dest = do_backup(&chroma, &backups_dir)?;
    Ok(dest.to_string_lossy().into_owned())
}

#[tauri::command]
fn list_backups(app: tauri::AppHandle) -> Result<Vec<BackupInfo>, String> {
    let (_chroma, backups_dir) = backup_paths(&app)?;
    if !backups_dir.exists() {
        return Ok(Vec::new());
    }

    let mut out: Vec<BackupInfo> = std::fs::read_dir(&backups_dir)
        .map_err(|e| format!("kon back-up-map niet lezen: {e}"))?
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            if !path.is_dir() || !name.starts_with("coeus-backup-") {
                return None;
            }
            let created_ms = entry
                .metadata()
                .and_then(|m| m.created().or_else(|_| m.modified()))
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            Some(BackupInfo {
                name,
                created_ms,
                size_bytes: dir_size(&path),
            })
        })
        .collect();

    // Newest first — name suffix sorts chronologically, so reverse-lexical.
    out.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(out)
}

#[tauri::command]
fn open_backups_dir(app: tauri::AppHandle) -> Result<(), String> {
    let (_chroma, backups_dir) = backup_paths(&app)?;
    std::fs::create_dir_all(&backups_dir)
        .map_err(|e| format!("kon back-up-map niet aanmaken: {e}"))?;

    #[cfg(target_os = "macos")]
    let mut cmd = Command::new("open");
    #[cfg(target_os = "windows")]
    let mut cmd = Command::new("explorer");
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut cmd = Command::new("xdg-open");

    cmd.arg(&backups_dir);
    cmd.spawn()
        .map_err(|e| format!("kon de map niet openen: {e}"))?;
    Ok(())
}

/// Fire-and-forget startup backup on its own thread so the window never waits.
fn schedule_startup_backup(app: &tauri::App) {
    let handle = app.handle().clone();
    std::thread::spawn(move || {
        let Ok((chroma, backups_dir)) = backup_paths(&handle) else {
            return;
        };
        match do_backup(&chroma, &backups_dir) {
            Ok(dest) => println!("[coeus] startup backup written to {dest:?}"),
            Err(e) => eprintln!("[coeus] startup backup skipped: {e}"),
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(BreinProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            backup_now,
            list_backups,
            open_backups_dir
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            spawn_brein(app);

            // Snapshot the knowledge base on launch, off-thread so it never
            // delays the window. Best-effort: logs and continues on any error.
            schedule_startup_backup(app);

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
