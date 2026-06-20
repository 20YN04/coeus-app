# Security

## Reporting

Found a vulnerability? Mail yentl.nerinckx@icloud.com — do not open a public issue.

## CI security

- `security.yml` runs npm audit (`desktop/`) + `cargo audit` (`desktop/src-tauri/`) + `pip-audit` (the brein), gitleaks secret scanning, CodeQL (JS/TS + Python), and dependency review on PRs. Weekly schedule + on push/PR.
- `dependabot.yml` keeps npm, cargo, pip, and GitHub Actions patched. Actions can be pinned to commit SHAs and Dependabot will bump them.
- Workflows run least-privilege (`permissions: contents: read` by default; `contents: write` only on the release job) with `persist-credentials: false` and harden-runner egress auditing.

## Cutting a desktop release

The desktop app is **local-first**: each installer bundles the static kennisbank UI (`desktop/`) plus the PyInstaller brein sidecar (built at the repo root). No cloud URL is baked in — the app runs the brein locally on a loopback port.

1. (Per-client white-label, optional) set the repo variables `COEUS_TENANT_NAME`, `COEUS_TENANT_SLUG`, `COEUS_TENANT_ACCENT` (Settings → Secrets and variables → Actions → Variables). Unset → default Coeus branding. See `desktop/docs/per-client-build.md`.
2. Tag and push: `git tag v0.1.0 && git push origin v0.1.0`.
3. `desktop-release.yml` builds the brein sidecar per-OS, bundles it into the Tauri app, and creates a **draft** GitHub Release with the macOS (arm64) `.dmg` + Windows `.exe`/`.msi` attached. Review, then publish.

## Code signing (optional — builds are unsigned until configured)

### macOS notarisation

Add these repo secrets to sign + notarise the `.dmg` (otherwise Gatekeeper warns on first open):

- `APPLE_CERTIFICATE` — base64 of the Developer ID `.p12`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY` — e.g. `Developer ID Application: Naam (TEAMID)`
- `APPLE_ID`, `APPLE_PASSWORD` (app-specific password), `APPLE_TEAM_ID`

Requires an Apple Developer account (€99/yr).

### Windows

Authenticode signing is configured in `desktop/src-tauri/tauri.conf.json` under `bundle.windows` (`certificateThumbprint` + `timestampUrl`), or via Azure Trusted Signing. Needs a code-signing certificate. Until configured, the `.exe`/`.msi` are unsigned (SmartScreen warns).
