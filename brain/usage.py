"""Gebruiks-log voor het weekrapport: append-only `<data_dir>/usage.jsonl`.

Zelfde patroon als brain/feedback.py — corrupt-regel-proof lezen, een write-
fout faalt zichtbaar naar de caller. Drie event-types: "ask", "ingest",
"search". Compact en privacy-bewust: bij "search" loggen we NOOIT de
zoekterm, enkel dat er gezocht is. Bij "ask" loggen we de vraag wél — dat is
net de goudmijn voor het weekrapport ("waar vroeg men naar zonder
antwoord"), samen met `answered` (of het brein een echt antwoord gaf, of de
letterlijke "weet ik niet"-fallback — zie Learner.is_fallback).
"""
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger("coeus.usage")

USAGE_FILENAME = "usage.jsonl"


def _usage_path(data_dir: str) -> Path:
    return Path(data_dir) / USAGE_FILENAME


def append_usage(data_dir: str, event_type: str, meta: dict | None = None) -> dict:
    """Voeg één usage-event toe. Laat OSError doorlopen naar de caller — main.py
    omringt elke aanroep met een try/except zodat een logging-fout nooit een
    request laat falen (zie main._log_usage).
    """
    record = {
        "type": event_type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "meta": meta or {},
    }
    path = _usage_path(data_dir)
    os.makedirs(path.parent, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
    return record


def read_usage(data_dir: str, limit: int | None = None) -> list[dict]:
    """Lees usage-events terug, nieuwste eerst. Faalt nooit hard: een
    ontbrekend bestand levert een lege lijst, een corrupte regel wordt
    overgeslagen zonder de rest van het bestand te blokkeren — het
    weekrapport (brain/digest.py) mag hier nooit op stuklopen.
    """
    path = _usage_path(data_dir)
    if not path.exists():
        return []

    try:
        with open(path, "r", encoding="utf-8") as f:
            lines = f.readlines()
    except OSError as e:
        logger.warning("Usage-bestand %s onleesbaar: %s", path, e)
        return []

    records = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            logger.warning("Corrupte usage-regel overgeslagen in %s", path)
            continue

    records.reverse()
    return records if limit is None else records[:limit]
