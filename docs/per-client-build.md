# Per-client (white-label) desktop build

Coeus ships as one installable desktop app per client. The app is a Tauri shell
that bundles:

1. the **static kennisbank UI** (`next build` → `out/`, embedded in the binary), and
2. the **brein sidecar** (PyInstaller binary from `coeus-app`), launched on
   `127.0.0.1:8765` and pointed at a writable per-user data dir.

Everything that distinguishes one client from another is baked at **build time**.

## 1. Branding + theme (baked into the static export)

Set these in `.env.local` before building (they are `NEXT_PUBLIC_*`, so they are
inlined into `out/`):

| Var | What |
|---|---|
| `NEXT_PUBLIC_TENANT_NAME` | Company name (titlebar, sidebar, metadata) |
| `NEXT_PUBLIC_TENANT_SLUG` | Short slug |
| `NEXT_PUBLIC_TENANT_LOGO` | Optional logo path under `public/` |
| `NEXT_PUBLIC_TENANT_ACCENT` | Primary colour, e.g. `#C2410C`. Re-tints the whole indigo token family (`--c-field`, `--c-field-deep`, `--c-paper-ink`, `--c-paper-muted`) via `color-mix`. Omit / leave `#3A1DD8` for the default Coeus indigo. |
| `NEXT_PUBLIC_BREIN_URL` | Leave at `http://127.0.0.1:8765` — the local sidecar. |

## 2. Brein sidecar (one per OS)

The sidecar is built from `../coeus-app` and dropped at
`src-tauri/binaries/coeus-brein/` (a folder; `.gitignore`d — never committed).

macOS / Linux:

```bash
cd ../coeus-app && ./build_sidecar.sh          # → coeus-app/dist/coeus-brein/
cp -R ../coeus-app/dist/coeus-brein src-tauri/binaries/coeus-brein
```

Windows is built on a Windows runner (see `.github/workflows/desktop-release.yml`).

The brein bundles the `all-MiniLM` ONNX model, so semantic search/graph/CRUD run
**fully offline**. `/learn` and `/ask` need an LLM key and are online-optional.

## 3. Seed data (first run)

On first launch the brein seeds an empty data dir so the app isn't blank.

- **Default**: the brein ships `seed/default.json` (the "Garage Vermeulen" demo).
- **Per client**: drop `src-tauri/seed/client-seed.json` (a JSON array of
  `{title, category, content, source, source_detail}`). The shell sets
  `COEUS_SEED_FILE` to it, overriding the default. It is `.gitignore`d.

Seeding only fires when the data dir is empty — existing installs are never
reseeded. Data lives in the OS app-data dir
(`~/Library/Application Support/app.coeus.kennisbank/chroma` on macOS).

## 4. Build

```bash
npm run desktop:build      # runs `next build` then `tauri build`
```

Output: `src-tauri/target/release/bundle/` → `.dmg` (macOS) / `.msi`+`.exe`
(Windows). The first launch boots the sidecar (~6–20s cold start); the UI shows
a loading state until the brein answers (`waitForBrein`).

## Env-var contract (shell → brein)

| Var | Set by | Meaning |
|---|---|---|
| `COEUS_DATA_DIR` | shell | writable ChromaDB dir (`app_data_dir`) |
| `COEUS_PORT` | shell | loopback port (8765) |
| `COEUS_CORS_ORIGINS` | shell | webview origins allowed through CORS |
| `COEUS_SEED_FILE` | shell (if client seed bundled) | per-client seed path |
| `COEUS_BREIN_BIN` | dev only | path to a locally-built sidecar for `tauri dev` |
