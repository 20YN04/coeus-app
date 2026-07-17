"""Tests voor de lokale-map-connector (brain/connector.py + /connector/* in main.py).

Gebruikt de gedeelde sessie-`client` (zie conftest.py): elke test ontkoppelt
zichzelf aan het einde (met verwijder_items=True) zodat connector-items niet
tussen tests lekken via de gedeelde ChromaDB-collectie.
"""
import os
import time

import pytest


@pytest.fixture(autouse=True)
def _disconnect_after(client):
    yield
    client.delete("/connector/folder", params={"verwijder_items": True})


def _write(path, text):
    path.write_text(text, encoding="utf-8")


def test_no_connection_returns_null_path(client):
    r = client.get("/connector/folder")
    assert r.status_code == 200
    assert r.json() == {"path": None}


def test_connect_and_initial_scan(client, tmp_path):
    _write(tmp_path / "a.md", "Onze garage is elke werkdag open van acht tot zes uur 's avonds.")
    _write(tmp_path / "b.txt", "Wij werken uitsluitend op afspraak, bel gerust voor een moment dat past.")

    r = client.post("/connector/folder", json={"path": str(tmp_path)})
    assert r.status_code == 200
    body = r.json()
    assert body["path"] == str(tmp_path)
    assert body["bestanden_bekend"] == 2
    assert body["items"] >= 2

    status = client.get("/connector/folder").json()
    assert status["path"] == str(tmp_path)
    assert status["bestanden_bekend"] == 2
    assert status["laatste_scan"] is not None

    items = client.get("/kennis", params={"category": "connector"}).json()
    assert len(items) == status["items"]
    assert all(i["source"] == "connector" for i in items)
    detail_paths = {i["source_detail"] for i in items}
    assert detail_paths == {"a.md", "b.txt"}


def test_rescan_picks_up_new_file(client, tmp_path):
    _write(tmp_path / "a.md", "Onze garage is elke werkdag open van acht tot zes uur 's avonds.")
    client.post("/connector/folder", json={"path": str(tmp_path)})

    _write(tmp_path / "b.md", "Een tweede kennisbestand met genoeg tekst om als item te tellen hier.")
    r = client.post("/connector/rescan")
    assert r.status_code == 200
    body = r.json()
    assert body["nieuw"] == 1
    assert body["gewijzigd"] == 0
    assert body["verwijderd"] == 0
    assert body["items_toegevoegd"] >= 1

    status = client.get("/connector/folder").json()
    assert status["bestanden_bekend"] == 2


def test_changed_file_replaces_old_items(client, tmp_path):
    f = tmp_path / "a.md"
    _write(f, "Originele inhoud met genoeg lengte om als kennis-item opgeslagen te worden hier.")
    client.post("/connector/folder", json={"path": str(tmp_path)})

    before = client.get("/kennis", params={"category": "connector"}).json()
    assert any("Originele" in i["content"] for i in before)

    # Nieuwe inhoud + mtime expliciet vooruitzetten (bestandssysteem-timestamp-
    # resolutie is soms te grof om een wijziging binnen dezelfde testrun te
    # garanderen op basis van "gewoon opnieuw schrijven").
    _write(f, "Gewijzigde inhoud, helemaal anders dan daarvoor en ook lang genoeg om te tellen.")
    future = time.time() + 10
    os.utime(f, (future, future))

    r = client.post("/connector/rescan")
    body = r.json()
    assert body["nieuw"] == 0
    assert body["gewijzigd"] == 1
    assert body["items_verwijderd"] >= 1
    assert body["items_toegevoegd"] >= 1

    after = client.get("/kennis", params={"category": "connector"}).json()
    assert not any("Originele" in i["content"] for i in after)
    assert any("Gewijzigde" in i["content"] for i in after)


def test_removed_file_cleans_up_items(client, tmp_path):
    keep = tmp_path / "keep.md"
    gone = tmp_path / "gone.md"
    _write(keep, "Dit bestand blijft gewoon bestaan en moet blijven staan als kennis.")
    _write(gone, "Dit bestand wordt zo dadelijk verwijderd en moet dus ook verdwijnen.")
    client.post("/connector/folder", json={"path": str(tmp_path)})

    gone.unlink()
    r = client.post("/connector/rescan")
    body = r.json()
    assert body["verwijderd"] == 1
    assert body["items_verwijderd"] >= 1

    status = client.get("/connector/folder").json()
    assert status["bestanden_bekend"] == 1

    items = client.get("/kennis", params={"category": "connector"}).json()
    assert not any("verwijderd en moet dus ook" in i["content"] for i in items)
    assert any("blijft gewoon bestaan" in i["content"] for i in items)


def test_invalid_path_rejected(client, tmp_path):
    missing = tmp_path / "does-not-exist"
    assert client.post("/connector/folder", json={"path": str(missing)}).status_code == 422

    # Relatief pad — nooit toegestaan.
    assert client.post("/connector/folder", json={"path": "relatief/pad"}).status_code == 422

    # Een bestand is geen map.
    f = tmp_path / "file.txt"
    _write(f, "hallo")
    assert client.post("/connector/folder", json={"path": str(f)}).status_code == 422


def test_symlink_escape_is_ignored(client, tmp_path_factory):
    root = tmp_path_factory.mktemp("connroot")
    outside = tmp_path_factory.mktemp("outside")

    secret = outside / "secret.md"
    _write(secret, "Geheime data die nooit via de gekoppelde map geleerd mag worden vandaag.")
    link = root / "link.md"
    link.symlink_to(secret)
    _write(root / "normal.md", "Normale kennis die wel gewoon geleerd mag worden vandaag hier.")

    r = client.post("/connector/folder", json={"path": str(root)})
    assert r.status_code == 200
    body = r.json()
    # Alleen normal.md telt mee — de symlink naar buiten de map wordt genegeerd.
    assert body["bestanden_bekend"] == 1

    items = client.get("/kennis", params={"category": "connector"}).json()
    assert all("Geheime data" not in i["content"] for i in items)
    assert any("Normale kennis" in i["content"] for i in items)


def test_disconnect_removes_link_but_keeps_items_by_default(client, tmp_path):
    _write(tmp_path / "a.md", "Wat kennis die na het ontkoppelen gewoon moet blijven bestaan hier.")
    client.post("/connector/folder", json={"path": str(tmp_path)})
    before = len(client.get("/kennis", params={"category": "connector"}).json())
    assert before >= 1

    r = client.delete("/connector/folder")
    assert r.status_code == 200
    assert r.json()["items_verwijderd"] == 0

    assert client.get("/connector/folder").json() == {"path": None}
    after = len(client.get("/kennis", params={"category": "connector"}).json())
    assert after == before
    # De autouse-fixture ruimt de items op (delete_by_source werkt ook zonder
    # actieve koppeling — connector.json hoeft niet te bestaan).
