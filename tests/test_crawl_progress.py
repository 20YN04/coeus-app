"""Tests voor de async crawl-voortgang (POST /ingest/crawl?async=true +
GET /ingest/status/{job_id}). Mockt requests + crawl_site_with_progress zodat
er geen netwerk nodig is — dezelfde aanpak als test_ingest_filter.py.
"""
import time

import main


class FakeResponse:
    status_code = 200
    text = "<html><body>startpagina</body></html>"
    headers = {"content-type": "text/html"}

    def raise_for_status(self):
        return None


def _fake_get(url, timeout=15, headers=None):
    return FakeResponse()


def _poll_until(client, job_id, predicate, timeout=5.0):
    deadline = time.time() + timeout
    status = client.get(f"/ingest/status/{job_id}").json()
    while time.time() < deadline and not predicate(status):
        time.sleep(0.05)
        status = client.get(f"/ingest/status/{job_id}").json()
    return status


def test_crawl_async_returns_job_id_immediately(client, monkeypatch):
    import threading

    release = threading.Event()

    def fake_crawl(url, max_pages=15):
        yield f"{url}/a", "Eerste pagina met genoeg tekst om als los kennis-item te tellen, echt wel honderd tekens.", 1, 1
        release.wait(timeout=5)
        yield f"{url}/b", "Tweede pagina met genoeg tekst om als los kennis-item te tellen, ook honderd tekens lang.", 2, 0

    monkeypatch.setattr(main.requests, "get", _fake_get)
    monkeypatch.setattr(main, "crawl_site_with_progress", fake_crawl)

    r = client.post("/ingest/crawl", params={"async": "true"}, json={"url": "https://async-a.test"})
    assert r.status_code == 200
    body = r.json()
    assert "job_id" in body
    assert set(body.keys()) == {"job_id"}  # geen sync-velden in het async-antwoord

    job_id = body["job_id"]

    # Status beweegt: na de eerste pagina staat de job nog op "running" met
    # tellingen die de eerste pagina weerspiegelen (queue+bezocht = schatting).
    status = _poll_until(client, job_id, lambda s: s["paginas_bezocht"] >= 1)
    assert status["status"] == "running"
    assert status["paginas_bezocht"] == 1
    assert status["paginas_totaal_geschat"] == 2  # 1 bezocht + 1 nog in de wachtrij
    assert status["huidige_url"] == "https://async-a.test/a"
    assert status["toegevoegd"] >= 1

    release.set()

    status = _poll_until(client, job_id, lambda s: s["status"] == "done")
    assert status["status"] == "done"
    assert status["paginas_bezocht"] == 2
    assert status["paginas_totaal_geschat"] == 2
    assert status["toegevoegd"] >= 2
    assert status["opgeschoond"] == 0
    assert status["error"] is None


def test_crawl_async_page_error_ends_job_cleanly(client, monkeypatch):
    def fake_crawl(url, max_pages=15):
        yield f"{url}/a", "Een geldige eerste pagina met voldoende inhoud om als kennis-item te tellen hier.", 1, 1
        raise RuntimeError("kaboom halverwege de crawl")

    monkeypatch.setattr(main.requests, "get", _fake_get)
    monkeypatch.setattr(main, "crawl_site_with_progress", fake_crawl)

    r = client.post("/ingest/crawl", params={"async": "true"}, json={"url": "https://async-error.test"})
    job_id = r.json()["job_id"]

    status = _poll_until(client, job_id, lambda s: s["status"] != "running")
    assert status["status"] == "error"
    assert status["error"]
    # De pagina van vóór de crash telt nog mee — geen alles-of-niets.
    assert status["paginas_bezocht"] == 1
    assert status["toegevoegd"] >= 1


def test_crawl_status_unknown_job_is_404(client):
    assert client.get("/ingest/status/does-not-exist").status_code == 404


def test_crawl_sync_default_unchanged(client, monkeypatch):
    def fake_crawl(url, max_pages=15):
        yield f"{url}/a", "Synchrone crawl-pagina met genoeg tekst om als kennis-item geteld te worden hier."

    monkeypatch.setattr(main.requests, "get", _fake_get)
    monkeypatch.setattr(main, "crawl_site", fake_crawl)

    r = client.post("/ingest/crawl", json={"url": "https://sync-default.test"})
    assert r.status_code == 200
    body = r.json()
    # Oude vorm, geen job_id: bestaande callers (o.a. test_ingest_filter.py)
    # blijven werken zonder wijziging.
    assert set(body.keys()) == {"toegevoegd", "paginas", "opgeschoond", "ai_extractie"}
    assert body["paginas"] == 1
    assert body["toegevoegd"] >= 1
