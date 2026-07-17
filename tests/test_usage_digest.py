"""Tests voor de gedeelde usage-log (brain/usage.py) en het weekrapport
(brain/digest.py, GET /digest) — de basis voor de digest- en waarde-features.

De brain.digest-tests draaien tegen een geïsoleerde Memory + tmp data_dir
(zelfde patroon als test_hybrid_search.py: los van de sessie-brede `client`-
fixture) zodat item-tellingen en periode-filtering exact controleerbaar zijn.
De HTTP-tests draaien tegen de gedeelde `client` en verifiëren enkel de
gedragingen die niet aan een schone kennisbank hangen (usage-logging per
route, de vorm van GET /digest).
"""
import json
from datetime import datetime, timedelta

import main
import brain.memory as memory_module
from brain.config import settings
from brain.digest import THIN_CATEGORY_THRESHOLD, build_digest
from brain.feedback import FEEDBACK_FILENAME, append_feedback
from brain.learner import Learner
from brain.memory import Memory
from brain.usage import USAGE_FILENAME, append_usage, read_usage


def _fresh_memory(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "chroma_db_path", str(tmp_path / "chroma"))
    monkeypatch.setattr(memory_module, "_embed", lambda texts: [[0.1, 0.2, 0.3, 0.4] for _ in texts])
    return Memory()


def _backdate(memory, item_id, days_ago):
    # Memory.add stempelt altijd "nu" — om periode-filtering te testen zetten
    # we created_at rechtstreeks terug in de chroma-metadata (white-box, enkel
    # om buiten-de-periode-gedrag te simuleren).
    existing = memory.get(item_id)
    old = (datetime.now() - timedelta(days=days_ago)).isoformat()
    memory.collection.update(
        ids=[item_id],
        metadatas=[{
            "title": existing.title,
            "category": existing.category,
            "source": existing.source,
            "source_detail": existing.source_detail or "",
            "created_at": old,
        }],
    )


def _append_feedback_raw(data_dir, record):
    # Rechtstreeks een regel schrijven i.p.v. via append_feedback — die zet
    # altijd de huidige tijd, wat backdaten (buiten-periode-tests) onmogelijk
    # maakt.
    path_dir = __import__("pathlib").Path(data_dir)
    path_dir.mkdir(parents=True, exist_ok=True)
    with open(path_dir / FEEDBACK_FILENAME, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


# --- brain/usage.py -----------------------------------------------------

def test_usage_roundtrip(tmp_path):
    data_dir = str(tmp_path)
    append_usage(data_dir, "search")
    append_usage(data_dir, "ask", {"vraag": "Wat zijn de openingsuren?", "answered": True})

    events = read_usage(data_dir)
    assert len(events) == 2
    # Nieuwste eerst.
    assert events[0]["type"] == "ask"
    assert events[0]["meta"] == {"vraag": "Wat zijn de openingsuren?", "answered": True}
    assert "timestamp" in events[0]
    assert events[1]["type"] == "search"
    assert events[1]["meta"] == {}


def test_usage_survives_corrupt_line(tmp_path):
    data_dir = str(tmp_path)
    append_usage(data_dir, "ingest", {"bron": "text", "toegevoegd": 3})

    path = tmp_path / USAGE_FILENAME
    with open(path, "a", encoding="utf-8") as f:
        f.write("dit is geen geldige json\n")

    events = read_usage(data_dir)
    assert len(events) == 1
    assert events[0]["meta"]["bron"] == "text"


def test_usage_missing_file_returns_empty_list(tmp_path):
    assert read_usage(str(tmp_path / "nooit-geschreven")) == []


# --- brain/digest.py — key-vrije aggregatie ------------------------------

def test_digest_empty_knowledge_base_returns_clean_nulls(monkeypatch, tmp_path):
    memory = _fresh_memory(monkeypatch, tmp_path / "mem")
    result = build_digest(memory, str(tmp_path / "data"), days=7)

    assert result["items_nieuw"] == 0
    assert result["per_categorie"] == []
    assert result["per_bron"] == []
    assert result["vragen_gesteld"] == 0
    assert result["vragen_onbeantwoord"] == []
    assert result["feedback_negatief"] == []
    assert result["zwakke_categorieen"] == []
    assert result["samenvatting"] is None
    assert result["periode"]["dagen"] == 7


def test_digest_counts_new_items_per_categorie(monkeypatch, tmp_path):
    memory = _fresh_memory(monkeypatch, tmp_path / "mem")
    memory.add("Item A", "diensten", "Eerste stuk kennis over onze diensten.")
    memory.add("Item B", "diensten", "Tweede stuk kennis over onze diensten.")
    memory.add("Item C", "prijs", "Een stuk kennis over prijzen.")

    result = build_digest(memory, str(tmp_path / "data"), days=7)

    assert result["items_nieuw"] == 3
    assert result["per_categorie"] == [
        {"categorie": "diensten", "nieuw": 2},
        {"categorie": "prijs", "nieuw": 1},
    ]


def test_digest_excludes_items_outside_period(monkeypatch, tmp_path):
    memory = _fresh_memory(monkeypatch, tmp_path / "mem")
    recent = memory.add("Recent item", "diensten", "Dit item is deze week toegevoegd.")
    old = memory.add("Oud item", "diensten", "Dit item is lang geleden toegevoegd.")
    _backdate(memory, old.id, days_ago=30)

    result = build_digest(memory, str(tmp_path / "data"), days=7)

    assert result["items_nieuw"] == 1
    assert result["per_categorie"] == [{"categorie": "diensten", "nieuw": 1}]


def test_digest_per_bron_sums_ingest_events(monkeypatch, tmp_path):
    memory = _fresh_memory(monkeypatch, tmp_path / "mem")
    data_dir = str(tmp_path / "data")
    append_usage(data_dir, "ingest", {"bron": "crawl", "toegevoegd": 5})
    append_usage(data_dir, "ingest", {"bron": "crawl", "toegevoegd": 2})
    append_usage(data_dir, "ingest", {"bron": "url", "toegevoegd": 1})
    append_usage(data_dir, "search")  # moet genegeerd worden

    result = build_digest(memory, data_dir, days=7)

    assert result["per_bron"] == [
        {"bron": "crawl", "nieuw": 7},
        {"bron": "url", "nieuw": 1},
    ]


def test_digest_dedupes_unanswered_questions(monkeypatch, tmp_path):
    memory = _fresh_memory(monkeypatch, tmp_path / "mem")
    data_dir = str(tmp_path / "data")
    append_usage(data_dir, "ask", {"vraag": "Wat kost een seizoenswissel?", "answered": False})
    append_usage(data_dir, "ask", {"vraag": "wat kost een seizoenswissel?  ", "answered": False})
    append_usage(data_dir, "ask", {"vraag": "Wat kost een seizoenswissel?", "answered": False})
    append_usage(data_dir, "ask", {"vraag": "Wat zijn de openingsuren?", "answered": True})

    result = build_digest(memory, data_dir, days=7)

    assert result["vragen_gesteld"] == 4
    assert result["vragen_onbeantwoord"] == [
        {"vraag": "Wat kost een seizoenswissel?", "count": 3},
    ]


def test_digest_ignores_usage_outside_period(monkeypatch, tmp_path):
    memory = _fresh_memory(monkeypatch, tmp_path / "mem")
    data_dir = str(tmp_path / "data")
    append_usage(data_dir, "ask", {"vraag": "Recente vraag", "answered": False})

    old_record = {
        "type": "ask",
        "timestamp": (datetime.now() - timedelta(days=30)).isoformat(),
        "meta": {"vraag": "Oude vraag", "answered": False},
    }
    with open(tmp_path / "data" / USAGE_FILENAME, "a", encoding="utf-8") as f:
        f.write(json.dumps(old_record, ensure_ascii=False) + "\n")

    result = build_digest(memory, data_dir, days=7)

    assert result["vragen_gesteld"] == 1
    assert result["vragen_onbeantwoord"] == [{"vraag": "Recente vraag", "count": 1}]


def test_digest_corrupt_usage_file_does_not_break(monkeypatch, tmp_path):
    memory = _fresh_memory(monkeypatch, tmp_path / "mem")
    data_dir = str(tmp_path / "data")
    append_usage(data_dir, "ask", {"vraag": "Overlevende vraag", "answered": False})

    with open(tmp_path / "data" / USAGE_FILENAME, "a", encoding="utf-8") as f:
        f.write("{ dit is kapotte json\n")

    result = build_digest(memory, data_dir, days=7)

    assert result["vragen_gesteld"] == 1
    assert result["vragen_onbeantwoord"] == [{"vraag": "Overlevende vraag", "count": 1}]


def test_digest_corrupt_feedback_file_does_not_break(monkeypatch, tmp_path):
    memory = _fresh_memory(monkeypatch, tmp_path / "mem")
    data_dir = str(tmp_path / "data")
    append_feedback(data_dir, {
        "question": "Wat is jullie annuleringsbeleid?",
        "answer_excerpt": "Kosteloos annuleren tot 24u vooraf.",
        "rating": "down",
        "reason": "onvolledig",
    })
    with open(tmp_path / "data" / FEEDBACK_FILENAME, "a", encoding="utf-8") as f:
        f.write("kapotte feedback-regel\n")

    result = build_digest(memory, data_dir, days=7)

    assert result["feedback_negatief"] == [
        {"vraag": "Wat is jullie annuleringsbeleid?", "reason": "onvolledig"},
    ]


def test_digest_feedback_negatief_excludes_up_and_old(monkeypatch, tmp_path):
    memory = _fresh_memory(monkeypatch, tmp_path / "mem")
    data_dir = str(tmp_path / "data")
    append_feedback(data_dir, {
        "question": "Recente negatieve vraag",
        "answer_excerpt": "...",
        "rating": "down",
        "reason": "onjuist",
    })
    append_feedback(data_dir, {
        "question": "Positieve vraag",
        "answer_excerpt": "...",
        "rating": "up",
    })
    _append_feedback_raw(data_dir, {
        "id": "old-1",
        "timestamp": (datetime.now() - timedelta(days=30)).isoformat(),
        "question": "Oude negatieve vraag",
        "answer_excerpt": "...",
        "rating": "down",
        "reason": "verouderd",
    })

    result = build_digest(memory, data_dir, days=7)

    assert result["feedback_negatief"] == [
        {"vraag": "Recente negatieve vraag", "reason": "onjuist"},
    ]


def test_digest_zwakke_categorieen(monkeypatch, tmp_path):
    memory = _fresh_memory(monkeypatch, tmp_path / "mem")
    memory.add("Dun item", "dun", "Eén enkel stukje kennis in deze categorie.")
    for i in range(THIN_CATEGORY_THRESHOLD + 2):
        memory.add(f"Vol item {i}", "vol", f"Kennis-item nummer {i} in een volle categorie.")

    result = build_digest(memory, str(tmp_path / "data"), days=7)

    assert result["zwakke_categorieen"] == [{"categorie": "dun", "items": 1}]


# --- Learner.is_fallback --------------------------------------------------

def test_learner_is_fallback_matches_known_texts():
    learner = Learner()
    assert learner.is_fallback(Learner._ANSWER_FALLBACK["nl"])
    assert learner.is_fallback(Learner._ANSWER_FALLBACK["en"])
    assert learner.is_fallback(Learner._ANSWER_NO_CONTEXT["nl"])
    assert learner.is_fallback(Learner._ANSWER_NO_CONTEXT["en"])
    assert not learner.is_fallback("De garage is open van 8 tot 18 uur, maandag tot vrijdag.")
    assert not learner.is_fallback("")


# --- HTTP-laag: usage-logging per route + GET /digest ---------------------

def test_ask_logs_answered_true_for_real_answer(client, monkeypatch):
    monkeypatch.setattr(main.learner, "answer_question", lambda q, c, lang="nl": f"Antwoord op: {q}")
    marker = "Marker-beantwoorde-vraag-abc"
    r = client.post("/ask", json={"question": marker})
    assert r.status_code == 200

    events = read_usage(main.settings.data_dir)
    hit = next(e for e in events if e.get("meta", {}).get("vraag") == marker)
    assert hit["type"] == "ask"
    assert hit["meta"]["answered"] is True


def test_ask_logs_answered_false_for_fallback(client, monkeypatch):
    fallback_text = main.learner._ANSWER_FALLBACK["nl"]
    monkeypatch.setattr(main.learner, "answer_question", lambda q, c, lang="nl": fallback_text)
    marker = "Marker-onbeantwoorde-vraag-xyz"
    r = client.post("/ask", json={"question": marker})
    assert r.status_code == 200

    events = read_usage(main.settings.data_dir)
    hit = next(e for e in events if e.get("meta", {}).get("vraag") == marker)
    assert hit["meta"]["answered"] is False


def test_search_logs_usage_without_query_content(client):
    before = len(read_usage(main.settings.data_dir))
    secret_query = "geheime-zoekterm-mag-niet-lekken-42"
    client.get("/kennis/search", params={"q": secret_query})

    events = read_usage(main.settings.data_dir)
    assert len(events) == before + 1
    newest = events[0]
    assert newest["type"] == "search"
    assert newest["meta"] == {}
    assert secret_query not in json.dumps(newest)


def test_ingest_text_logs_usage_with_bron_and_count(client):
    r = client.post("/ingest/text", json={
        "text": "Marker-ingest-usage-test met genoeg lengte om als kennis-item te tellen hier.",
    })
    assert r.status_code == 200
    added = r.json()["toegevoegd"]

    events = read_usage(main.settings.data_dir)
    newest = events[0]
    assert newest["type"] == "ingest"
    assert newest["meta"] == {"bron": "text", "toegevoegd": added}


def test_digest_endpoint_shape(client):
    client.delete("/config/llm-key")  # zeker geen sleutel voor deze test
    r = client.get("/digest", params={"days": 7})
    assert r.status_code == 200
    body = r.json()

    assert set(body.keys()) == {
        "periode", "items_nieuw", "per_categorie", "per_bron",
        "vragen_gesteld", "vragen_onbeantwoord", "feedback_negatief",
        "zwakke_categorieen", "samenvatting",
    }
    assert body["periode"]["dagen"] == 7
    assert body["samenvatting"] is None
    assert isinstance(body["items_nieuw"], int)
    assert isinstance(body["vragen_onbeantwoord"], list)


def test_digest_default_days_is_seven(client):
    r = client.get("/digest")
    assert r.status_code == 200
    assert r.json()["periode"]["dagen"] == 7


def test_digest_reflects_recent_ask_and_ingest(client, monkeypatch):
    monkeypatch.setattr(main.learner, "answer_question", lambda q, c, lang="nl": main.learner._ANSWER_FALLBACK["nl"])
    marker = "Marker-digest-integratie-vraag-999"
    client.post("/ask", json={"question": marker})

    body = client.get("/digest", params={"days": 7}).json()
    hits = [q for q in body["vragen_onbeantwoord"] if q["vraag"] == marker]
    assert len(hits) == 1
    assert hits[0]["count"] >= 1
