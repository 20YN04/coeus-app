"""Weekrapport-aggregatie: telt kennisbank-groei, vragen en feedback op over
een periode — volledig key-vrij (geen LLM, zie main.py voor de optionele
LLM-samenvatting erbovenop). Leest drie bronnen: chroma-metadata via Memory
(created_at/category), usage.jsonl (ask/search/ingest-events) en
feedback.jsonl (duim omlaag + reden). Faalt nooit hard: read_usage/
read_feedback zijn beide al corrupt-regel-proof, en een lege kennisbank
levert gewoon nette nullen op, geen crash.
"""
from collections import Counter
from datetime import datetime, timedelta

from .feedback import read_feedback
from .usage import read_usage

# Een categorie met minder items dan dit geldt als "dun" — nog te weinig
# kennis om op te vertrouwen. Losstaande, licht-empirische default (zelfde
# orde van grootte als CLEANUP_DEFAULT_THRESHOLD in main.py, geen afgeleide
# waarde).
THIN_CATEGORY_THRESHOLD = 3

# Het weekrapport moet ALLE negatieve feedback in de periode zien, niet enkel
# de jongste 100 over de hele geschiedenis (feedback.py's admin-default).
_FEEDBACK_READ_LIMIT = 5000


def _parse_naive(value) -> datetime | None:
    """Best-effort ISO-timestamp parsen tot een naive datetime, zodat items uit
    verschillende bronnen (chroma: naive lokale tijd via datetime.now(),
    usage/feedback: aware UTC via datetime.now(timezone.utc)) chronologisch
    vergelijkbaar zijn. Voor een periode-filter op dag-granulariteit is dat
    aanvaardbaar precisieverlies — geen van beide bronnen hoeft hier tot op de
    seconde te kloppen. Onparseerbaar/ontbrekend → None (caller beslist de
    fallback; nooit een crash).
    """
    if not value:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        try:
            dt = datetime.fromisoformat(str(value))
        except ValueError:
            return None
    return dt.replace(tzinfo=None) if dt.tzinfo else dt


def _normalize_question(text: str) -> str:
    return " ".join((text or "").strip().lower().split())


def build_digest(memory, data_dir: str, days: int = 7) -> dict:
    now = datetime.now()
    cutoff = now - timedelta(days=days)

    # --- kennisbank-groei: chroma-metadata (created_at, category) ---
    items = memory.get_all()
    nieuw_items = [i for i in items if i.created_at >= cutoff]

    per_categorie = Counter(i.category for i in nieuw_items)
    per_categorie_out = [
        {"categorie": cat, "nieuw": n}
        for cat, n in sorted(per_categorie.items(), key=lambda kv: kv[1], reverse=True)
    ]

    # --- usage.jsonl: ingest-herkomst, vragen, onbeantwoorde vragen ---
    usage = read_usage(data_dir)
    usage_period = [
        u for u in usage
        if (_parse_naive(u.get("timestamp")) or cutoff) >= cutoff
    ]

    per_bron = Counter()
    for u in usage_period:
        if u.get("type") != "ingest":
            continue
        meta = u.get("meta") or {}
        bron = meta.get("bron") or "onbekend"
        try:
            toegevoegd = int(meta.get("toegevoegd") or 0)
        except (TypeError, ValueError):
            toegevoegd = 0
        per_bron[bron] += toegevoegd
    per_bron_out = [
        {"bron": bron, "nieuw": n}
        for bron, n in sorted(per_bron.items(), key=lambda kv: kv[1], reverse=True)
        if n > 0
    ]

    ask_events = [u for u in usage_period if u.get("type") == "ask"]
    vragen_gesteld = len(ask_events)

    onbeantwoord: dict[str, dict] = {}
    for u in ask_events:
        meta = u.get("meta") or {}
        if meta.get("answered", True):
            continue
        vraag = (meta.get("vraag") or "").strip()
        if not vraag:
            continue
        key = _normalize_question(vraag)
        entry = onbeantwoord.setdefault(key, {"vraag": vraag, "count": 0})
        entry["count"] += 1
    vragen_onbeantwoord = sorted(
        onbeantwoord.values(), key=lambda e: e["count"], reverse=True
    )

    # --- feedback.jsonl: negatieve feedback binnen de periode ---
    feedback = read_feedback(data_dir, limit=_FEEDBACK_READ_LIMIT)
    feedback_negatief = [
        {"vraag": f.get("question", ""), "reason": f.get("reason")}
        for f in feedback
        if f.get("rating") == "down"
        and (_parse_naive(f.get("timestamp")) or cutoff) >= cutoff
    ]

    # --- zwakke categorieën: all-time stand, niet periode-gebonden ---
    categories = memory.get_categories()
    zwakke_categorieen = sorted(
        (
            {"categorie": c["name"], "items": c["count"]}
            for c in categories
            if c.get("count", 0) < THIN_CATEGORY_THRESHOLD
        ),
        key=lambda c: c["items"],
    )

    return {
        "periode": {
            "dagen": days,
            "van": cutoff.isoformat(),
            "tot": now.isoformat(),
        },
        "items_nieuw": len(nieuw_items),
        "per_categorie": per_categorie_out,
        "per_bron": per_bron_out,
        "vragen_gesteld": vragen_gesteld,
        "vragen_onbeantwoord": vragen_onbeantwoord,
        "feedback_negatief": feedback_negatief,
        "zwakke_categorieen": zwakke_categorieen,
        # Ingevuld door main.py met Learner.summarize_digest() als er een
        # LLM-sleutel is; blijft null zonder sleutel — build_digest zelf is
        # en blijft key-vrij zodat dit los, deterministisch testbaar is.
        "samenvatting": None,
    }
