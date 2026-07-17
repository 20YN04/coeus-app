"""Tests voor hybride zoeken (semantisch + lexicaal) in brain.memory.Memory.search.

De fusie-tests (a, b) mocken _embed zodat de semantische afstand exact
controleerbaar is — dat isoleert de garantie "exacte term duwt betrouwbaar omhoog"
van de kwaliteit van het echte (multilinguale) embedding-model. Elk mockt een eigen
geïsoleerde chroma-map (los van de sessie-brede `client`-fixture uit conftest.py).
De overige tests (c, d) draaien via `client` met échte fastembed-embeddings, net als
test_api.py, en bevestigen dat het bestaande semantische gedrag intact blijft.
"""
import re

import brain.memory as memory_module
from brain.config import settings
from brain.memory import Memory, _content_tokens, _lexical_score, _tokenize


def _fresh_memory(monkeypatch, tmp_path, vectors: dict[str, list[float]]):
    monkeypatch.setattr(settings, "chroma_db_path", str(tmp_path / "chroma"))
    monkeypatch.setattr(memory_module, "_embed", lambda texts: [vectors[t] for t in texts])
    return Memory()


# --- (a) exacte merknaam die semantisch zwak matcht komt boven ---

def test_exact_brand_beats_stronger_semantic_competitor(monkeypatch, tmp_path):
    query = "Pirelli"
    competitor_text = ("Onze monteurs adviseren altijd een stevig profiel voor "
                        "extra grip in de winter.")
    target_text = "Notitie 447. Archiveren. Merk: Pirelli."

    vectors = {
        query: [1.0, 0.0, 0.0, 0.0],
        competitor_text: [1.0, 1.0, 0.0, 0.0],  # dist=1 -> een redelijke semantische match
        target_text: [1.0, 0.0, 2.0, 0.0],       # dist=4 -> een zwakke semantische match
    }
    m = _fresh_memory(monkeypatch, tmp_path, vectors)
    m.add("Algemeen bandenadvies", "product", competitor_text)
    m.add("Losse notitie 447", "product", target_text)

    results = m.search(query, limit=2)
    # Puur semantisch zou "Algemeen bandenadvies" (dichterbij) eerst geven; de
    # exacte merknaam-match tilt de zwakkere-semantische "Losse notitie 447" erboven.
    assert [i.title for i in results] == ["Losse notitie 447", "Algemeen bandenadvies"]


# --- (b) telefoonnummer-fragment vindt het contact-item ---

def test_phone_fragment_beats_stronger_semantic_competitor(monkeypatch, tmp_path):
    query = "12 34 56"
    competitor_text = "Je kan gewoon binnenlopen tijdens de openingsuren, geen afspraak nodig."
    target_text = "Contactgegevens garage: bel ons op 0470/12.34.56 of mail info@garage.be."

    vectors = {
        query: [1.0, 0.0, 0.0, 0.0],
        competitor_text: [1.0, 1.0, 0.0, 0.0],
        target_text: [1.0, 0.0, 2.0, 0.0],
    }
    m = _fresh_memory(monkeypatch, tmp_path, vectors)
    m.add("Vrije inloop", "info", competitor_text)
    m.add("Contactgegevens garage", "contact", target_text)

    results = m.search(query, limit=2)
    assert results[0].title == "Contactgegevens garage"


# --- (c) puur-semantische query blijft werken (bestaand gedrag, échte embeddings) ---

def test_pure_semantic_paraphrase_still_finds_item(client):
    client.post("/kennis", json={
        "title": "Huisdierenbeleid",
        "category": "regel",
        "content": "Viervoeters zijn welkom in onze showroom, mits aangelijnd.",
    })
    # Geen enkel letterlijk woord gedeeld met de content — puur semantische match.
    r = client.get("/kennis/search", params={"q": "mag ik mijn hond binnenbrengen?", "limit": 5})
    assert r.status_code == 200
    assert "Huisdierenbeleid" in [i["title"] for i in r.json()]


def test_search_finds_relevant_still_works(client):
    # Regressie: het bestaande gedrag uit test_api.py::test_search_finds_relevant
    # moet identiek blijven werken bovenop de nieuwe fusie.
    client.post("/kennis", json={
        "title": "Bandenwissel prijs opnieuw",
        "category": "prijs",
        "content": "Een seizoenswissel van de banden kost 60 euro inclusief btw.",
    })
    r = client.get("/kennis/search", params={"q": "wat kost het wisselen van mijn banden", "limit": 5})
    assert r.status_code == 200
    assert "Bandenwissel prijs opnieuw" in [i["title"] for i in r.json()]


# --- (d) edge cases: leeg/whitespace/rare query, item zonder content ---

def test_empty_and_whitespace_query_returns_empty_list(client):
    assert client.get("/kennis/search", params={"q": ""}).json() == []
    assert client.get("/kennis/search", params={"q": "   "}).json() == []


def test_nonsense_query_does_not_crash(client):
    r = client.get("/kennis/search", params={"q": "???!!! @@@ ---"})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_item_without_content_does_not_crash(monkeypatch, tmp_path):
    vectors = {
        "": [0.0, 0.0, 0.0, 0.0],
        "leeg item": [1.0, 0.0, 0.0, 0.0],
    }
    m = _fresh_memory(monkeypatch, tmp_path, vectors)
    m.add("Leeg item", "test", "")
    results = m.search("leeg item", limit=5)
    assert isinstance(results, list)
    assert results[0].title == "Leeg item"


def test_search_on_empty_kennisbank_returns_empty(monkeypatch, tmp_path):
    m = _fresh_memory(monkeypatch, tmp_path, {})
    assert m.search("iets") == []


# --- pure functies: lexicale laag geïsoleerd, geen embeddings nodig ---

def test_lexical_score_exact_phrase_wins_outright():
    tokens = _content_tokens("Pirelli")
    assert _lexical_score("Pirelli", tokens, "", "Merk: Pirelli.") == 1.0


def test_lexical_score_digit_fragment_ignores_formatting():
    query = "0470 12 34 56"
    tokens = _content_tokens(query)
    digits = re.sub(r"\D", "", query)
    assert _lexical_score(query, tokens, digits, "bel 0470/12.34.56") == 1.0


def test_lexical_score_stopwords_filtered_no_false_positive():
    # "is" mag niet matchen binnen "adviseren" (geen woordgrens-treffer), en
    # lidwoorden/voorzetsels tellen niet mee als betekenisdragende term.
    tokens = _content_tokens("wat is jullie telefoonnummer")
    assert tokens == ["telefoonnummer"]
    assert _lexical_score("wat is jullie telefoonnummer", tokens, "", "we adviseren dit altijd") == 0.0


def test_lexical_score_no_overlap_returns_zero():
    tokens = _content_tokens("Michelin")
    assert _lexical_score("Michelin", tokens, "", "Totaal andere inhoud zonder merk.") == 0.0


def test_tokenize_handles_empty_and_punctuation():
    assert _tokenize("") == []
    assert _tokenize("???!!!") == []
