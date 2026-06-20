"""First-run seeding for the Coeus brein.

A fresh install starts with an empty ChromaDB store. To avoid shipping a blank
knowledge base, we seed it once from a JSON file the first time the store is empty.

Seed source priority:
  1. env COEUS_SEED_FILE — absolute path, set per-client by the Tauri shell.
  2. the bundled default seed/default.json shipped with the app.

Resolution works in dev (file relative to repo root) AND in a PyInstaller frozen
build (file under sys._MEIPASS).

Seeding is resilient: a missing or malformed seed file must NEVER crash startup —
the app distributed to clients always has to boot, even with a bad seed.
"""
import json
import logging
import os
import sys
from pathlib import Path

logger = logging.getLogger("coeus.seed")


def _default_seed_path() -> Path:
    """Locate the bundled default seed JSON, in both dev and frozen builds."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS) / "seed" / "default.json"
    # Repo root = parent of this module's package directory (brain/).
    return Path(__file__).resolve().parent.parent / "seed" / "default.json"


def _resolve_seed_path() -> Path | None:
    """Resolve which seed file to use, env override first, then bundled default."""
    env_path = os.environ.get("COEUS_SEED_FILE", "").strip()
    if env_path:
        return Path(env_path)
    default = _default_seed_path()
    return default if default.exists() else None


def seed_if_empty(memory) -> int:
    """Seed the store from JSON if it's currently empty. Returns the number of
    items seeded (0 if the store already had data or seeding was skipped/failed).

    Never raises — any failure is logged and swallowed so startup continues.
    """
    try:
        if memory.get_all():
            logger.info("Knowledge store not empty — skipping seed.")
            return 0
    except Exception as e:  # store unreadable — don't block boot
        logger.warning("Could not check store emptiness, skipping seed: %s", e)
        return 0

    seed_path = _resolve_seed_path()
    if seed_path is None:
        logger.info("No seed file found — starting with an empty store.")
        return 0

    # COEUS_SEED_FILE is shell-set to a trusted bundled resource, but it's still
    # a plain env var — cap the size so a stray/huge path can't hang or OOM boot.
    try:
        if seed_path.stat().st_size > 16 * 1024 * 1024:
            logger.warning("Seed file %s too large (>16MB), skipping seed.", seed_path)
            return 0
    except OSError as e:
        logger.warning("Seed file %s not statable, skipping seed: %s", seed_path, e)
        return 0

    try:
        with open(seed_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        logger.warning("Seed file %s unreadable, skipping seed: %s", seed_path, e)
        return 0

    if not isinstance(data, list):
        logger.warning("Seed file %s is not a JSON array, skipping seed.", seed_path)
        return 0

    seeded = 0
    skipped = 0
    for entry in data:
        try:
            memory.add(
                title=entry["title"],
                category=entry["category"],
                content=entry["content"],
                source=entry.get("source", "seed"),
                source_detail=entry.get("source_detail") or "",
            )
            seeded += 1
        except (KeyError, TypeError) as e:
            skipped += 1
            logger.warning("Skipping malformed seed entry: %s", e)

    logger.info(
        "Seeded %d item(s) from %s (%d skipped).", seeded, seed_path, skipped
    )
    return seeded
