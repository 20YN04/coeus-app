# Git workflow

- Branch per task. Naming: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`, `refactor/<slug>`, `docs/<slug>`.
- Atomic commits, Conventional Commits format (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- Push to origin. Merge into `main`. Delete the branch locally and on origin after merge.
- Never commit directly to `main`. Never `--no-verify`. Never force-push to `main`.

# Browser verification (REQUIRED)

After ANY UI change:
1. `npm run dev` (background)
2. `npm run scan` — pass routes to focus: `npm run scan /login /dashboard /kennisbank`
3. Exit 0 = clean. Non-zero = regression. Fix before commit.

Never claim "build passes, ship it." Build catches types, not browser bugs.
