"""SSRF-veilige HTTP-fetch voor de onboarding-ingest (/ingest/url + crawl).

Het brein haalt server-side webpagina's op die de gebruiker aanlevert. Zonder
guard kan dat misbruikt worden om interne doelen te bereiken vanaf de
netwerkpositie van het slachtoffer (cloud-metadata `169.254.169.254`, een
router-UI op `192.168.x`, een andere loopback-service, …) — de klassieke SSRF.
Deze module laat alleen publiek-routeerbare hosts toe en her-valideert élke
redirect-hop, zodat een 3xx naar een intern adres de guard niet omzeilt.

Restrisico (bewust, gedocumenteerd): DNS-rebinding tussen onze resolve en die
van `requests` blijft een theoretische TOCTOU. Voor de lokale desktop-tier is
dat marginaal; voor de cloud-tier hoort hier IP-pinning bij (aparte todo).
"""
import ipaddress
import socket
from urllib.parse import urlparse

import requests


class BlockedURLError(requests.exceptions.RequestException):
    """Doel-URL wijst naar een niet-publiek adres (loopback/privé/link-local/…).

    Subclass van RequestException zodat bestaande `except RequestException`-
    handlers (o.a. de crawl die dode links overslaat) een geblokkeerde link
    vanzelf skippen; de ingest-endpoints vangen 'm apart voor een nette 422.
    """


# Max aantal redirects dat we handmatig volgen — hoog genoeg voor legitieme
# http→https / trailing-slash-redirects, laag genoeg tegen redirect-loops.
_MAX_REDIRECTS = 5
_DEFAULT_TIMEOUT = 15
_UA = "Coeus-Onboarding/1.0 (+kennisbank-import)"


def _is_public_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    # Blokkeer alles wat niet globaal-routeerbaar is: loopback (127/8, ::1),
    # privé (10/8, 172.16/12, 192.168/16, fc00::/7), link-local (169.254/16,
    # incl. cloud-metadata, fe80::/10), multicast, reserved en unspecified.
    return not (
        ip.is_loopback
        or ip.is_private
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def assert_public_url(url: str) -> None:
    """Raise BlockedURLError als de host van `url` naar een niet-publiek adres
    resolvet (of niet resolvet). Controleert álle A/AAAA-records — één privé
    record is genoeg om te weigeren."""
    parsed = urlparse(url)
    host = parsed.hostname
    if not host:
        raise BlockedURLError("Geen geldige host in de URL")

    # Host kan al een IP-literal zijn; anders resolven we alle adressen.
    try:
        infos = socket.getaddrinfo(host, parsed.port or None, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise BlockedURLError(f"Kon host niet opzoeken: {host}") from exc

    for info in infos:
        addr = info[4][0]
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            continue
        if not _is_public_ip(ip):
            raise BlockedURLError(
                "Interne of privé-adressen zijn niet toegestaan voor ingest"
            )


def safe_get(url: str, *, timeout: int = _DEFAULT_TIMEOUT) -> requests.Response:
    """`requests.get` met SSRF-guard op de start-URL én elke redirect-hop.

    Volgt redirects handmatig (allow_redirects=False) zodat een 3xx naar een
    intern adres opnieuw door assert_public_url moet. Gooit BlockedURLError bij
    een geblokkeerd doel en de gewone requests-excepties (Timeout, …) verder.
    """
    headers = {"User-Agent": _UA}
    current = url
    for _ in range(_MAX_REDIRECTS + 1):
        assert_public_url(current)
        resp = requests.get(
            current, timeout=timeout, headers=headers, allow_redirects=False
        )
        if resp.is_redirect and resp.headers.get("location"):
            current = requests.compat.urljoin(current, resp.headers["location"])
            continue
        return resp
    raise BlockedURLError("Te veel redirects")
