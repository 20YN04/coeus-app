"""Lokale-map-connector: een KMO koppelt één map op deze machine en Coeus
leert alle documenten erin, met her-scan om nieuwe/gewijzigde bestanden bij
te leren. Geen Google-OAuth — de "gedeelde map"-variant: het brein draait als
Tauri-sidecar op dezelfde machine als de app, dus lezen we rechtstreeks van
schijf, zonder externe koppeling.

v1 ondersteunt één gekoppelde map. Koppeling + manifest (welk bestand is al
gescand, met welke mtime/size) staan in <data_dir>/connector.json.
"""
import json
import logging
import os
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional

from .config import settings
from .files import ALLOWED_SUFFIXES, MAX_UPLOAD_BYTES, extract_text
from .ingest import chunk_text, derive_title
from .memory import Memory

logger = logging.getLogger("coeus.connector")

CONNECTOR_FILENAME = "connector.json"
# Alle map-connector-items krijgen dezelfde categorie, net zoals /ingest/text
# en /ingest/url hun items onder "import" zetten.
CONNECTOR_CATEGORY = "connector"
SOURCE = "connector"

# Verborgen mappen (.git, .cache, ...) en dependency-/build-mappen slaan we
# altijd over: geen kennis, en node_modules-achtige mappen kunnen tienduizenden
# bestanden bevatten die een scan onnodig traag maken.
_IGNORED_DIR_NAMES = {
    "node_modules", "__pycache__", "venv", ".venv", "env",
    "dist", "build", "target", ".next", ".git", ".svn", ".hg",
}

_EMPTY_COUNTS = {
    "nieuw": 0, "gewijzigd": 0, "verwijderd": 0,
    "items_toegevoegd": 0, "items_verwijderd": 0,
}


class ConnectorError(Exception):
    """Ongeldige/onbereikbare map — main.py vertaalt dit naar een 422."""


def _connector_path() -> str:
    return os.path.join(settings.data_dir, CONNECTOR_FILENAME)


def _load_state() -> Optional[dict]:
    try:
        with open(_connector_path(), "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def _save_state(state: dict) -> None:
    path = _connector_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f)


def _validate_folder(path: str) -> Path:
    # Alleen absolute paden — een relatief pad zou afhangen van de (onvoorspelbare)
    # cwd van de sidecar-worker.
    if not path or not os.path.isabs(path):
        raise ConnectorError("Geef een absoluut pad naar de map op")
    try:
        resolved = Path(path).resolve(strict=True)
    except OSError:
        raise ConnectorError("Deze map bestaat niet")
    if not resolved.is_dir():
        raise ConnectorError("Dit pad is geen map")
    if not os.access(resolved, os.R_OK):
        raise ConnectorError("Deze map is niet leesbaar")
    return resolved


def _iter_files(root: Path):
    # os.walk volgt symlinked directories standaard niet (followlinks=False) —
    # dat is al de eerste symlink-escape-guard. Losse symlinked bestanden
    # binnen root vangen we hieronder expliciet met een resolve + prefix-check.
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        dirnames[:] = sorted(
            d for d in dirnames
            if not d.startswith(".") and d not in _IGNORED_DIR_NAMES
        )
        for fn in sorted(filenames):
            if fn.startswith("."):
                continue
            if not fn.lower().endswith(ALLOWED_SUFFIXES):
                continue
            candidate = Path(dirpath) / fn
            try:
                real = candidate.resolve(strict=True)
            except OSError:
                continue  # kapotte symlink o.i.d. — overslaan
            if not real.is_relative_to(root):
                continue  # symlink wijst buiten de gekoppelde map — nooit volgen
            yield candidate, real


def _relpath(root: Path, path: Path) -> str:
    return path.relative_to(root).as_posix()


def _ingest_path(memory: Memory, abspath: Path, relpath: str) -> int:
    try:
        data = abspath.read_bytes()
    except OSError:
        return 0
    text = extract_text(abspath.name, data)
    if not text or not text.strip():
        return 0
    added = 0
    for chunk in chunk_text(text):
        memory.add(
            title=derive_title(chunk),
            category=CONNECTOR_CATEGORY,
            content=chunk,
            source=SOURCE,
            source_detail=relpath,
        )
        added += 1
    return added


def scan_folder(memory: Memory) -> dict:
    """Scan de gekoppelde map: nieuw/gewijzigd/verwijderd bestanden bijleren.

    Vergelijkt mtime+size tegen het manifest in connector.json. Nieuw of
    gewijzigd → tekst (her)extraheren en (her)ingesten; bij een gewijzigd
    bestand worden eerst de oude items van dat pad verwijderd (gezocht op
    source_detail = relatief pad). Een bestand dat uit de map verdween ruimt
    zijn items op. Geen koppeling → no-op met lege tellers.
    """
    state = _load_state()
    if not state or not state.get("path"):
        return dict(_EMPTY_COUNTS)

    try:
        root = _validate_folder(state["path"])
    except ConnectorError:
        # De map is intussen verdwenen/onleesbaar — niets doen, niet crashen.
        # Volgende rescan (handmatig of bij de volgende opstart) probeert opnieuw.
        logger.warning("Gekoppelde map niet bereikbaar bij scan: %s", state["path"])
        return dict(_EMPTY_COUNTS)

    manifest: dict = state.get("manifest") or {}
    found: dict[str, tuple[float, int]] = {}
    for candidate, real in _iter_files(root):
        try:
            st = candidate.stat()
        except OSError:
            continue
        if st.st_size > MAX_UPLOAD_BYTES:
            continue  # zelfde 10MB-guard als /ingest/file
        found[_relpath(root, real)] = (st.st_mtime, st.st_size)

    counts = dict(_EMPTY_COUNTS)
    new_manifest: dict = {}

    for relpath, (mtime, size) in found.items():
        prev = manifest.get(relpath)
        if prev is not None and prev.get("mtime") == mtime and prev.get("size") == size:
            new_manifest[relpath] = prev
            continue  # ongewijzigd

        if prev is not None:
            # Gewijzigd: eerst de oude items van dit pad weg, dan her-ingesten.
            old_items = memory.get_by_source_detail(relpath)
            for item in old_items:
                memory.delete(item.id)
            counts["items_verwijderd"] += len(old_items)
            counts["gewijzigd"] += 1
        else:
            counts["nieuw"] += 1

        counts["items_toegevoegd"] += _ingest_path(memory, root / relpath, relpath)
        new_manifest[relpath] = {"mtime": mtime, "size": size}

    for relpath in set(manifest) - set(found):
        old_items = memory.get_by_source_detail(relpath)
        for item in old_items:
            memory.delete(item.id)
        counts["items_verwijderd"] += len(old_items)
        counts["verwijderd"] += 1

    state["manifest"] = new_manifest
    state["last_scan"] = datetime.now().isoformat()
    _save_state(state)
    return counts


def connect_folder(memory: Memory, path: str) -> dict:
    """Koppel een map en draai meteen de eerste scan. Raises ConnectorError."""
    root = _validate_folder(path)
    existing = _load_state() or {}
    # Zelfde map opnieuw koppelen (bv. per ongeluk nogmaals op "Koppel") is
    # idempotent — het manifest blijft staan, een volgende scan gedraagt zich
    # als een gewone rescan. Een ANDERE map koppelen start met een leeg
    # manifest voor die map (bestaande connector-items van de vorige map
    # blijven gewoon staan; v1 doet geen automatische opruiming bij wisselen).
    manifest = existing.get("manifest") if existing.get("path") == str(root) else {}
    _save_state({"path": str(root), "manifest": manifest or {}, "last_scan": None})
    scan_counts = scan_folder(memory)
    status = get_status(memory)
    # Extra veld t.o.v. GET /connector/folder: hoeveel items déze scan toevoegde
    # (i.p.v. het all-time totaal in "items") — main.py gebruikt dit om het
    # ingest-usage-event voor het weekrapport te loggen.
    status["items_toegevoegd"] = scan_counts["items_toegevoegd"]
    return status


def get_status(memory: Memory) -> dict:
    state = _load_state()
    if not state or not state.get("path"):
        return {"path": None}
    manifest = state.get("manifest") or {}
    return {
        "path": state["path"],
        "laatste_scan": state.get("last_scan"),
        "bestanden_bekend": len(manifest),
        "items": memory.count_by_source(SOURCE),
    }


def disconnect(memory: Memory, verwijder_items: bool = False) -> dict:
    removed = memory.delete_by_source(SOURCE) if verwijder_items else 0
    try:
        os.remove(_connector_path())
    except FileNotFoundError:
        pass
    return {"ok": True, "items_verwijderd": removed}


def auto_rescan_in_background(memory: Memory) -> None:
    """Fire-and-forget scan bij het opstarten van het brein (na de seed).

    Draait in een achtergrond-thread zodat een grote/tragere map de boot nooit
    blokkeert. Fouten worden gelogd, nooit doorgegeven — een mislukte
    auto-rescan mag de app niet laten crashen.
    """
    state = _load_state()
    if not state or not state.get("path"):
        return

    def _run():
        try:
            scan_folder(memory)
        except Exception:
            logger.exception("Auto-rescan van de gekoppelde map bij opstart is mislukt")

    threading.Thread(target=_run, daemon=True, name="coeus-connector-rescan").start()
