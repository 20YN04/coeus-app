# Coeus — desktop app

The desktop layer of [Coeus](../README.md): a **Tauri 2 (Rust) shell** that bundles
and launches the Python **brein** sidecar, and serves a **static Next.js 16 SPA** over
Tauri's asset protocol. No server, no auth — the UI fetches the local brein on
`127.0.0.1:8765` directly from the webview.

## Layout

| Path | What |
|---|---|
| `app/` | Next.js App Router UI, static export. `(app)/` holds the screens (Home/ask, Kennisbank, Overzicht, Importeren, Graph, Instellingen…); `components/`, `globals.css`, `layout.tsx`. |
| `lib/brein.ts` | Typed client for the brein API (`ask`, `search`, `ingest*`, `getGraph`, key config…). |
| `config/tenant.ts` | Per-client (white-label) name / accent / seed, baked at build time. |
| `src-tauri/` | The Rust shell: spawns + supervises the brein sidecar, signed auto-updates, strict CSP, kills the child on exit. |

## Develop the UI

Run a brein on `:8765` (see the [root README](../README.md)), then:

```bash
npm install
npm run dev        # http://localhost:3000
npm run scan       # browser-verify the routes (Playwright) before committing UI
```

## Build the full desktop app

```bash
python ../build_sidecar.py     # build + bundle the offline brein sidecar
npm run desktop:build          # → src-tauri/target/release/bundle/
```

The UI is exported as a static SPA (`output: 'export'`), bundled with the sidecar; the
Tauri shell launches the brein on startup and shuts it down on exit.

## Notes

- The same bundle is also a plain static web export. Tauri-only features (auto-update,
  local backup, the AI-key file) are guarded at runtime via a `__TAURI_INTERNALS__`
  check, so the web build degrades gracefully instead of crashing.
- White-label / per-client builds (custom name, colour, seed data, signed release):
  see [`docs/per-client-build.md`](docs/per-client-build.md).
