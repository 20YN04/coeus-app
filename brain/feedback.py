"""Antwoord-feedback: duim omhoog/omlaag + reden op /ask-antwoorden.

Append-only JSONL in de data-dir, naast chroma (settings.data_dir). Geen
database, geen LLM — puur lokale opslag zodat Ynarchive (en later de klant
zelf) de kwaliteit van antwoorden kan opvolgen. Twee garanties:
  - een write-fout (disk vol / geen rechten) faalt zichtbaar naar de caller
    (main.py zet dat om in een 500) — feedback stilletjes verliezen is erger
    dan een foutmelding.
  - een corrupte regel in het bestand (bv. na een crash mid-write) mag GET
    nooit breken — die regel wordt overgeslagen, de rest blijft leesbaar.
"""
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger("coeus.feedback")

FEEDBACK_FILENAME = "feedback.jsonl"


def _feedback_path(data_dir: str) -> Path:
    return Path(data_dir) / FEEDBACK_FILENAME


def append_feedback(data_dir: str, entry: dict) -> dict:
    """Voeg één feedback-record toe. Vult id + timestamp aan en schrijft één
    JSON-regel. Laat OSError doorlopen naar de caller — dat is de enige
    onherstelbare fout hier.
    """
    record = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **entry,
    }
    path = _feedback_path(data_dir)
    os.makedirs(path.parent, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
    return record


def read_feedback(data_dir: str, limit: int = 100) -> list[dict]:
    """Lees feedback terug, nieuwste eerst. Faalt nooit hard: een ontbrekend
    bestand levert een lege lijst, een corrupte regel wordt overgeslagen
    zonder de rest van het bestand te blokkeren.
    """
    path = _feedback_path(data_dir)
    if not path.exists():
        return []

    try:
        with open(path, "r", encoding="utf-8") as f:
            lines = f.readlines()
    except OSError as e:
        logger.warning("Feedback-bestand %s onleesbaar: %s", path, e)
        return []

    records = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            logger.warning("Corrupte feedback-regel overgeslagen in %s", path)
            continue

    records.reverse()
    return records[:limit]
