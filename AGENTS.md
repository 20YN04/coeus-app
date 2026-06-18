<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Git workflow

- Branch per task. Naming: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`, `refactor/<slug>`, `docs/<slug>`.
- Atomic commits, Conventional Commits format (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- Push to origin. Merge into `main`. Delete the branch locally and on origin after merge.
- Never commit directly to `main`. Never `--no-verify`. Never force-push to `main`.

# Browser verification (REQUIRED)

Type checks and `next build` only prove the code compiles. Real bugs live in the browser.

## When to scan

After ANY change that touches:
- `app/**/*.{tsx,css}` or `globals.css`
- `app/components/*`
- new client components, routing, or auth code

## How

1. Start the dev server: `npm run dev`
2. Run `npm run scan` — defaults to routes hard-coded in `scripts/scan-pages.mjs`.
3. Read `.next/dev/logs/next-development.log` if it exists — `circular|uncaught|TypeError` = regression.
4. Exit code 0 = clean. Non-zero = real issue. Do not commit while non-zero.

Optionally pass routes: `npm run scan /login /dashboard /kennisbank`

## Anti-patterns

- Do NOT claim "build passes, ship it." Build only catches types.
- Do NOT skip the scroll loop — some errors only fire after the page has been running a few seconds.
- Do NOT raise the navigation timeout to make it pass — diagnose.
