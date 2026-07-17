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
| `NEXT_PUBLIC_TENANT_ACCENT` | Primary colour, e.g. `#C2410C`. Re-tints only the *interactive accent* family (`--c-accent`, `--c-accent-rgb`, `--c-paper-muted`) — links, active nav, primary buttons, focus/selection. Body text ink (`--c-ink`/`--c-ink-muted`) and the field background never change: reading text stays neutral, brand colour is interaction-only (2026-07 ergonomics restyle). Omit / leave `#1F1FD1` for the default Coeus blue. |
| `NEXT_PUBLIC_BREIN_URL` | Leave at `http://127.0.0.1:8765` — the local sidecar. |

## 2. Brein sidecar (one per OS)

The brein lives at the **repo root** (one level up from `desktop/`). Build it and
drop the output at `desktop/src-tauri/binaries/coeus-brein/` (a folder;
`.gitignore`d — never committed).

macOS / Linux (run from `desktop/`):

```bash
(cd .. && ./build_sidecar.sh)                  # → <repo-root>/dist/coeus-brein/
cp -R ../dist/coeus-brein src-tauri/binaries/coeus-brein
```

Windows is built on a Windows runner (see the repo-root
`.github/workflows/desktop-release.yml`, which builds `build_sidecar.py`).

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

## Auto-update

The installed app self-updates (Tauri v2 updater). It checks
`https://github.com/20YN04/coeus-app/releases/latest/download/latest.json`; the
**Controleer op updates** button in Instellingen runs check → download → install →
relaunch. The button is hidden in the plain web/SSG build (it has no meaning
there) and only renders inside the Tauri webview.

To cut a self-updating release the CI needs two secrets (see `SECURITY.md` →
Auto-update): `TAURI_SIGNING_PRIVATE_KEY` and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. The matching public key is already embedded
in `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`); the private key lives
in `src-tauri/.tauri/` and is `.gitignore`d.

> **Per-client note:** all white-label builds currently share one updater keypair
> and one `endpoints` URL, so every client install updates from the same
> `20YN04/coeus-app` releases. If a client needs an isolated update channel, give
> that build its own keypair + endpoint before shipping.

## Env-var contract (shell → brein)

| Var | Set by | Meaning |
|---|---|---|
| `COEUS_DATA_DIR` | shell | writable ChromaDB dir (`app_data_dir`) |
| `COEUS_PORT` | shell | loopback port (8765) |
| `COEUS_CORS_ORIGINS` | shell | webview origins allowed through CORS |
| `COEUS_SEED_FILE` | shell (if client seed bundled) | per-client seed path |
| `COEUS_BREIN_BIN` | dev only | path to a locally-built sidecar for `tauri dev` |

## Industrie-sjablonen (seed-kennisbanken)

Een nieuwe klant start nooit leeg: naast de default garage-seed liggen er
industrie-sjablonen klaar in `seed/`. Kies bij een per-client build het sjabloon
dat het dichtst bij de sector van de klant ligt en vertrek daarvan.

| Sjabloon | Bestand | Fictieve zaak | Sectoren |
|---|---|---|---|
| Garage (default) | `seed/default.json` | Garage Vermeulen, Hasselt | garages, carrosserie, banden |
| Horeca | `seed/horeca.json` | Brasserie De Linde, Hasselt | restaurants, brasseries, eetcafés |
| Kapper | `seed/kapper.json` | Salon Elise, Genk | kapsalons, schoonheidssalons |

Recept per sjabloon (zelfde mechanisme als een client-seed — `COEUS_SEED_FILE`
wint van de default):

- **Garage**: niets doen; zonder `COEUS_SEED_FILE` laadt de brein `seed/default.json`.
- **Horeca**: kopieer `seed/horeca.json` naar `desktop/src-tauri/seed/client-seed.json`
  (of zet `COEUS_SEED_FILE=<pad>/seed/horeca.json` bij een losse brein-run).
- **Kapper**: idem met `seed/kapper.json`.

De sjablonen zijn bewust fictief maar intern consistent (één naam, adres,
telefoonnummer en openingsuren per sjabloon; euro-bedragen alleen in
prijs-items). Voor een echte klant vervang je daarna de fictieve identiteit door
de echte gegevens, of laat je de klant de seed-items in de app zelf bijwerken.
Validatie: `tests/test_seeds.py` parseert en checkt alle `seed/*.json`.
