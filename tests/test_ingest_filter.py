"""Tests voor het web-ruis-filter (brain.ingest) en de crawl met auto-opschonen.

Het filter mag alleen web-afgeleide chunks raken: zelf geplakte tekst wordt nooit
gefilterd. De crawl-test mockt requests + crawl_site zodat er geen netwerk nodig is.
"""
from brain.ingest import filter_noise_chunks, is_noise_chunk


def test_noise_boilerplate_phrases():
    # Knop-/cookie-teksten die html_to_text overleven zijn ruis.
    assert is_noise_chunk("Lees meer")
    assert is_noise_chunk("Lees meer →")
    assert is_noise_chunk("Alle cookies accepteren")
    assert is_noise_chunk("Lees meer\n\nLees verder\n\nDelen")


def test_noise_short_without_digits():
    assert is_noise_chunk("Onze diensten")
    # Kort MÉT cijfers = waardevol (telefoonnummer, prijs): nooit filteren.
    assert not is_noise_chunk("Bel ons: 011 22 79 15")
    assert not is_noise_chunk("Bandenwissel vanaf 60 euro")


def test_noise_glued_nav_list():
    nav = "Home\nDiensten\nBanden\nKeuring\nOver ons\nContact\nVacatures\nNieuws"
    assert is_noise_chunk(nav)


def test_real_paragraphs_survive():
    para = (
        "Wij zijn gespecialiseerd in banden van Michelin, Pirelli en Continental. "
        "Voor een seizoenswissel maak je best vooraf een afspraak."
    )
    assert not is_noise_chunk(para)
    # Een regel-lijst met echte feiten (cijfers/leestekens) is geen nav-menu.
    facts = "Openingsuren:\nma-vr 8u tot 18u\nza 9u tot 13u\nzo gesloten"
    assert not is_noise_chunk(facts)
    nav = "Home\nMenu\nContact\nZoeken"
    assert filter_noise_chunks([para, "Lees meer", nav]) == [para]


def test_ingest_text_is_never_filtered(client):
    # Zelf geplakte korte kennis (geen cijfers, < 40 tekens) moet gewoon landen —
    # het filter geldt alleen voor web-afgeleide tekst.
    r = client.post("/ingest/text", json={"text": "Wij verkopen enkel Michelin banden."})
    assert r.status_code == 200
    assert r.json()["toegevoegd"] == 1


def test_crawl_filters_noise_and_dedupes(client, monkeypatch):
    real = (
        "Garage Test doet onderhoud van alle merken. Wij werken enkel op afspraak "
        "en gebruiken originele onderdelen voor elke herstelling die we uitvoeren."
    )
    # Lang genoeg (≥ 80 tekens samen met "Lees meer") om als eigen chunk te flushen
    # i.p.v. aan de echte alinea geplakt te worden — zo test dit écht het filter.
    nav = "Home\nDiensten\nBanden\nKeuring\nDiagnose\nOver ons\nContact\nVacatures\nNieuws\nJobs"
    page_text = f"{real}\n\nLees meer\n\n{nav}"

    class FakeResponse:
        status_code = 200
        text = "<html><body>startpagina</body></html>"
        headers = {"content-type": "text/html"}

        def raise_for_status(self):
            return None

    def fake_get(url, timeout=15, headers=None):
        return FakeResponse()

    def fake_crawl(url, max_pages=15):
        # Twee identieke pagina's: de echte alinea landt dubbel (→ near-duplicate),
        # de ruis ("Lees meer" + nav-lijst) moet per pagina gefilterd worden.
        yield f"{url}/a", page_text
        yield f"{url}/b", page_text

    import main
    monkeypatch.setattr(main.requests, "get", fake_get)
    monkeypatch.setattr(main, "crawl_site", fake_crawl)

    before = len(client.get("/kennis").json())
    r = client.post("/ingest/crawl", json={"url": "https://example.test"})
    assert r.status_code == 200
    body = r.json()
    assert body["paginas"] == 2
    # Ruis gefilterd: per pagina bleef alleen de echte alinea over.
    assert body["toegevoegd"] == 2
    # Auto-opschonen ná de crawl: het identieke item van pagina b is verwijderd.
    assert body["opgeschoond"] >= 1
    after = len(client.get("/kennis").json())
    assert after == before + body["toegevoegd"] - body["opgeschoond"]
