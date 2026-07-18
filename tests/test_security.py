"""Security-tests: CSRF-origin-guard + SSRF-guard op de ingest-fetch.

De CSRF-tests draaien tegen de echte app (client-fixture): een gesmede
cross-origin POST moet 403 krijgen, een request zónder Origin (curl / native /
deze test-client) en één met een toegestane loopback-origin moet doorgaan.
De SSRF-tests mocken DNS (socket.getaddrinfo) zodat ze offline en deterministisch
zijn — geen echt netwerk.
"""
import socket

import pytest

from brain import net
from brain.net import BlockedURLError, assert_public_url


# --- CSRF-origin-guard ------------------------------------------------------

def test_csrf_blocks_foreign_origin(client):
    # Een kwaadaardige pagina die blind naar het loopback-brein POST't: de
    # browser hangt er Origin: https://evil.example aan → moet 403 zijn.
    r = client.post(
        "/config/llm-key",
        json={"key": "gestolen"},
        headers={"Origin": "https://evil.example"},
    )
    assert r.status_code == 403


def test_csrf_blocks_cross_site_sec_fetch(client):
    r = client.post(
        "/kennis",
        json={"title": "x", "category": "test", "content": "y"},
        headers={"Sec-Fetch-Site": "cross-site"},
    )
    assert r.status_code == 403


def test_csrf_allows_absent_origin(client):
    # Geen Origin (curl / native client / test-client) → geen browser-CSRF,
    # gewoon toestaan. (Dit is ook waarom de bestaande 82 tests blijven werken.)
    r = client.post(
        "/kennis",
        json={"title": "Origin-loze aanmaak", "category": "test", "content": "inhoud abc"},
    )
    assert r.status_code == 200


def test_csrf_allows_loopback_origin(client):
    # De dev-frontend draait op http://localhost:3000 — moet doorgelaten worden.
    r = client.post(
        "/kennis",
        json={"title": "Loopback-origin", "category": "test", "content": "inhoud def"},
        headers={"Origin": "http://localhost:3000"},
    )
    assert r.status_code == 200


def test_csrf_does_not_touch_get(client):
    # GET is niet-muterend en mag nooit door de guard geraakt worden, ook niet
    # met een vreemde Origin.
    r = client.get("/kennis", headers={"Origin": "https://evil.example"})
    assert r.status_code == 200


# --- SSRF-guard -------------------------------------------------------------

def _fake_getaddrinfo(ip: str):
    def _inner(host, port, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (ip, port or 0))]
    return _inner


@pytest.mark.parametrize("url", [
    "http://127.0.0.1/",
    "http://localhost/",
    "http://169.254.169.254/latest/meta-data/",  # cloud-metadata
    "http://10.0.0.5/admin",
    "http://192.168.1.1/",
    "http://[::1]/",
])
def test_ssrf_blocks_internal_targets(url):
    # IP-literals hebben geen DNS nodig; 'localhost' resolvet naar loopback.
    with pytest.raises(BlockedURLError):
        assert_public_url(url)


def test_ssrf_blocks_dns_to_private(monkeypatch):
    # Een publieke hostnaam die (rebinding-stijl) naar een privé-IP resolvet.
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("10.1.2.3"))
    with pytest.raises(BlockedURLError):
        assert_public_url("http://intern.example.com/")


def test_ssrf_allows_public_host(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo("93.184.216.34"))
    # Mag niet raisen.
    assert_public_url("http://example.com/")


def test_ssrf_endpoint_rejects_private_url(client):
    # End-to-end door de app: /ingest/url naar een loopback-doel → 422 (niet 502),
    # met de origin-guard tevreden (geen Origin-header).
    r = client.post("/ingest/url", json={"url": "http://127.0.0.1:9999/secret"})
    assert r.status_code == 422
