# AGENTS.md — Coeus

Operating rules for any AI agent (or human) working in this repo.

## Git workflow (REQUIRED for any change)

- Branch per task. One branch = one discrete thing. Naming: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`, `refactor/<slug>`, `docs/<slug>`.
- Atomic commits in Conventional Commits format: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `init:`.
- Build/test the branch before committing.
- Merge into `main` (fast-forward is fine).

Hard rules:
- Never commit directly to `main`.
- Never `--no-verify` to skip hooks unless explicitly asked.
- Never force-push to `main` or any shared branch.
- Never work in a dirty tree across unrelated tasks — stash or split first.

## Testing before commit (REQUIRED)

This is a Python project. `tsc`/build does not apply; instead run the import tests before every commit:

```bash
# from the repo root, with the venv active
python -c "from brain.config import settings; print('Config OK')"
python -c "from brain.memory import Memory; print('Memory OK')"
python -c "from brain.learner import Learner; print('Learner OK')"
python -c "from main import app; print('FastAPI OK')"
```

- Do NOT call the OpenAI API in tests (it costs credits). Test imports and the `Memory` class only.
- Run all Python commands from the repo root with the venv active, so `from brain.memory import Memory` and `from main import app` resolve.
- Don't commit while a test fails — diagnose and fix first.

## Project layout

- Package `brain/` holds `config.py`, `models.py`, `memory.py`, `learner.py`, `__init__.py`.
- `main.py` lives at the repo root (it does `from brain.memory import Memory`, which only resolves with the repo root as cwd).
- `.env` (gitignored) and the `venv/` live at the repo root, so `config.py`'s `env_file=".env"` resolves.
- Python venv uses python3.12 (the spec's `X | None` annotations crash on 3.9).

## Style

- Python code comments in Dutch.
- Commit messages in English.
