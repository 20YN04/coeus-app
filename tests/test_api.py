"""Integratietests tegen de brein (echte ChromaDB + offline embeddings, geen LLM)."""


def test_health(client):
    r = client.get("/")
    assert r.status_code == 200


def test_kennis_crud(client):
    r = client.post("/kennis", json={
        "title": "CRUD testitem",
        "category": "test",
        "content": "Een uniek stuk inhoud voor de CRUD-test xyz123.",
    })
    assert r.status_code == 200
    iid = r.json()["id"]

    r = client.get(f"/kennis/{iid}")
    assert r.status_code == 200
    assert r.json()["title"] == "CRUD testitem"

    assert any(i["id"] == iid for i in client.get("/kennis").json())

    r = client.put(f"/kennis/{iid}", json={"title": "CRUD gewijzigd"})
    assert r.status_code == 200
    assert client.get(f"/kennis/{iid}").json()["title"] == "CRUD gewijzigd"

    assert client.delete(f"/kennis/{iid}").status_code in (200, 204)
    assert client.get(f"/kennis/{iid}").status_code == 404


def test_search_finds_relevant(client):
    client.post("/kennis", json={
        "title": "Bandenwissel prijs",
        "category": "prijs",
        "content": "Een seizoenswissel van de banden kost 60 euro inclusief btw.",
    })
    r = client.get("/kennis/search", params={"q": "wat kost het wisselen van mijn banden", "limit": 5})
    assert r.status_code == 200
    assert "Bandenwissel prijs" in [i["title"] for i in r.json()]


def test_categories_and_graph(client):
    assert client.get("/categories").status_code == 200
    r = client.get("/graph")
    assert r.status_code == 200
    assert "nodes" in r.json()


def test_ingest_text_adds_items(client):
    before = len(client.get("/kennis").json())
    r = client.post("/ingest/text", json={
        "text": ("Onze garage is open van maandag tot vrijdag van 8u tot 18u. "
                 "Wij doen onderhoud, banden en keuring. Bel ons voor een afspraak."),
        "category": "import",
    })
    assert r.status_code == 200
    assert r.json()["toegevoegd"] >= 1
    assert len(client.get("/kennis").json()) > before


def test_cleanup_dedupe(client):
    dup = "De openingsuren zijn van 9 tot 17 uur, maandag tot vrijdag. Uniektest987."
    client.post("/kennis", json={"title": "Openingsuren A", "category": "test", "content": dup})
    client.post("/kennis", json={"title": "Openingsuren B", "category": "test", "content": dup})
    distinct = client.post("/kennis", json={
        "title": "Parkeren", "category": "test",
        "content": "Achter het gebouw is gratis parkeergelegenheid. Heel iets anders uniektest987x.",
    }).json()["id"]

    assert client.get("/cleanup/preview").json()["duplicaten"] >= 1
    assert client.post("/cleanup/apply", json={}).json()["verwijderd"] >= 1
    # het distincte item overleeft de opschoning
    assert client.get(f"/kennis/{distinct}").status_code == 200


def test_llm_key_config_roundtrip(client):
    assert client.get("/config/llm-status").json()["configured"] is False

    assert client.post("/config/llm-key", json={"key": "sk-test-fake-1234567890"}).status_code == 200
    st = client.get("/config/llm-status").json()
    assert st["configured"] is True
    assert st["provider"] == "deepseek"

    assert client.delete("/config/llm-key").status_code == 200
    assert client.get("/config/llm-status").json()["configured"] is False


def test_ask_without_key_is_graceful(client):
    client.delete("/config/llm-key")  # zeker geen sleutel
    r = client.post("/ask", json={"question": "Wat zijn de openingsuren?"})
    # geen sleutel → nette 503, geen crash
    assert r.status_code == 503


def test_ask_validation(client):
    # lege vraag wordt door de Pydantic-validatie afgewezen
    assert client.post("/ask", json={"question": ""}).status_code == 422
