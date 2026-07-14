"""Onboarding-motor: key-free tekst-naar-kennis (geen LLM).

Hakt vrije tekst of een opgehaalde webpagina in zinnige stukken en leidt per
stuk een korte titel af. Bewust dom en deterministisch — geen AI-call, geen
externe key. Wordt gebruikt door /ingest/text en /ingest/url in main.py.
"""

import re
from typing import Iterator, Optional
from urllib.parse import urljoin, urldefrag, urlparse

# Per kennis-item cappen we de inhoud zodat één gigantische paragraaf niet als
# één onleesbaar item belandt. ~1500 tekens is ongeveer een schermvullende alinea.
MAX_CHUNK_CHARS = 1500
# Stukjes kleiner dan dit voegen we samen met het volgende stuk — losse
# fragmenten (een kop, een losse regel) zijn op zichzelf geen nuttig item.
MIN_CHUNK_CHARS = 80
# Lengte van de afgeleide titel (eerste regel / eerste ~60 tekens).
TITLE_MAX_CHARS = 60


def _hard_split(text: str) -> list[str]:
    # Een paragraaf die langer is dan MAX_CHUNK_CHARS splitsen we op zin-grenzen,
    # en als dat niet lukt (geen leestekens) hard op de tekenlimiet.
    pieces: list[str] = []
    remaining = text.strip()
    while len(remaining) > MAX_CHUNK_CHARS:
        window = remaining[:MAX_CHUNK_CHARS]
        # Zoek de laatste zin-grens binnen het venster om netjes te knippen.
        cut = max(window.rfind('. '), window.rfind('! '), window.rfind('? '))
        if cut < MIN_CHUNK_CHARS:
            cut = window.rfind(' ')  # val terug op een woordgrens
        if cut < MIN_CHUNK_CHARS:
            cut = MAX_CHUNK_CHARS  # geen spatie: hard knippen
        else:
            cut += 1  # neem het leesteken/spatie mee
        pieces.append(remaining[:cut].strip())
        remaining = remaining[cut:].strip()
    if remaining:
        pieces.append(remaining)
    return pieces


def chunk_text(text: str) -> list[str]:
    """Hak tekst op in zinnige stukken.

    Strategie: split op lege regels (paragrafen), merge te kleine fragmenten met
    de volgende paragraaf, en hak paragrafen die de tekenlimiet overschrijden.
    """
    if not text or not text.strip():
        return []

    # Normaliseer regeleindes en splits op één-of-meer lege regels.
    normalized = text.replace('\r\n', '\n').replace('\r', '\n')
    paragraphs = [p.strip() for p in re.split(r'\n\s*\n', normalized) if p.strip()]

    chunks: list[str] = []
    buffer = ''
    for para in paragraphs:
        candidate = f'{buffer}\n\n{para}' if buffer else para
        if len(candidate) <= MAX_CHUNK_CHARS:
            buffer = candidate
            # Klein genoeg om door te groeien tot het MIN bereikt; pas flushen
            # zodra we boven MIN_CHUNK_CHARS zitten.
            if len(buffer) >= MIN_CHUNK_CHARS:
                chunks.append(buffer)
                buffer = ''
        else:
            # Candidate te groot. Flush wat we hebben en hak de grote paragraaf.
            if buffer:
                chunks.append(buffer)
                buffer = ''
            chunks.extend(_hard_split(para))

    if buffer:
        # Restant: plak aan het vorige stuk als het te klein is om alleen te staan.
        if chunks and len(buffer) < MIN_CHUNK_CHARS:
            chunks[-1] = f'{chunks[-1]}\n\n{buffer}'
        else:
            chunks.append(buffer)

    return [c.strip() for c in chunks if c.strip()]


# Ruis-filter voor web-afgeleide chunks (URL-import + crawl-fallback). Boilerplate
# die html_to_text overleeft — knoppen, cookie-balken, nav-lijsten ín de body — is
# geen kennis; bij de ericbanden.be-validatie was ~33% van de items zulke ruis.
NOISE_MIN_CHARS = 40

# Frasen die op zichzelf nooit kennis zijn (vergeleken case-insensitief, zonder
# leestekens). Bewust een korte, conservatieve lijst: liever een ruis-item te veel
# dan een echt feit weggegooid.
_NOISE_PHRASES = {
    'lees meer', 'lees verder', 'read more', 'meer info', 'meer informatie',
    'meer weten', 'ontdek meer', 'bekijk meer', 'bekijk alle',
    'terug naar boven', 'naar boven', 'terug', 'vorige', 'volgende',
    'home', 'menu', 'sluiten', 'zoeken', 'ok', 'oke', 'akkoord',
    'contacteer ons', 'neem contact op', 'contact opnemen', 'contact',
    'deel dit bericht', 'deel dit artikel', 'delen', 'share',
    'cookies accepteren', 'accepteer cookies', 'alle cookies accepteren',
    'cookie instellingen', 'cookieinstellingen', 'privacybeleid',
    'privacy policy', 'algemene voorwaarden', 'disclaimer',
}

# Zins-signalen: een regel mét leesteken/valuta is een zin of feit, geen nav-label.
_SENTENCE_CHARS = re.compile(r'[.!?:;€$]')


def _normalize_phrase(line: str) -> str:
    # "Lees meer →" / "LEES MEER..." → "lees meer" zodat de frase-lijst matcht.
    return re.sub(r'[^\w\s]', '', line, flags=re.UNICODE).strip().lower()


def is_noise_chunk(chunk: str) -> bool:
    """True als een web-chunk boilerplate is i.p.v. kennis.

    Drie signalen (alleen voor web-afgeleide tekst gebruiken — een gebruiker die
    zelf een kort feit plakt mag nooit gefilterd worden):
    1. kort fragment zonder cijfer ("Lees meer", "Onze diensten") = knop/kop-tekst;
       korte regels MÉT cijfer (telefoonnummer, prijs) zijn juist waardevol;
    2. de hele chunk bestaat uit bekende boilerplate-frasen (cookie-balk, share);
    3. (bijna) alle regels zijn korte woordgroepjes zonder zinsleestekens of
       cijfers — een aan elkaar geplakt menu, geen alinea.
    """
    text = chunk.strip()
    if not text:
        return True
    has_digit = any(ch.isdigit() for ch in text)
    if len(text) < NOISE_MIN_CHARS and not has_digit:
        return True
    lines = [ln for ln in (raw.strip() for raw in text.splitlines()) if ln]
    normalized = [n for n in (_normalize_phrase(ln) for ln in lines) if n]
    if normalized and all(n in _NOISE_PHRASES for n in normalized):
        return True
    if len(lines) >= 3 and not has_digit:
        nav_like = sum(
            1 for ln in lines
            if len(ln.split()) <= 3 and not _SENTENCE_CHARS.search(ln)
        )
        if nav_like / len(lines) >= 0.8:
            return True
    return False


def filter_noise_chunks(chunks: list[str]) -> list[str]:
    """Verwijder boilerplate-chunks uit web-afgeleide tekst (zie is_noise_chunk)."""
    return [c for c in chunks if not is_noise_chunk(c)]


def derive_title(chunk: str) -> str:
    """Leid een korte titel af: eerste niet-lege regel, gecapt op ~60 tekens."""
    first_line = next((ln.strip() for ln in chunk.splitlines() if ln.strip()), '')
    if not first_line:
        first_line = chunk.strip()
    if len(first_line) <= TITLE_MAX_CHARS:
        return first_line
    # Knip op een woordgrens vlak voor de limiet zodat we geen woord halveren.
    clipped = first_line[:TITLE_MAX_CHARS]
    space = clipped.rfind(' ')
    if space >= TITLE_MAX_CHARS // 2:
        clipped = clipped[:space]
    return clipped.rstrip(' ,.;:') + '…'


def html_to_text(html: str) -> str:
    """Haal leesbare tekst uit HTML: drop script/style/nav/footer, behoud structuur."""
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, 'html.parser')
    for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'aside', 'noscript']):
        tag.decompose()
    # separator='\n' behoudt paragraaf-grenzen zodat chunk_text iets te knippen heeft.
    text = soup.get_text(separator='\n')
    # Comprimeer overtollige lege regels tot maximaal één lege regel.
    lines = [ln.strip() for ln in text.splitlines()]
    cleaned: list[str] = []
    blank = False
    for ln in lines:
        if ln:
            cleaned.append(ln)
            blank = False
        elif not blank:
            cleaned.append('')
            blank = True
    return '\n'.join(cleaned).strip()


# Bestandsextensies die we tijdens een crawl overslaan: assets en downloads zijn
# geen leesbare HTML-pagina's (en zouden de crawl onnodig vertragen).
_SKIP_EXTENSIONS = (
    '.pdf', '.zip', '.rar', '.gz', '.tar', '.dmg', '.exe',
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico', '.bmp', '.avif',
    '.mp4', '.webm', '.mov', '.mp3', '.wav', '.ogg',
    '.css', '.js', '.json', '.xml', '.rss', '.woff', '.woff2', '.ttf', '.eot',
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv',
)


def _is_crawlable(url: str) -> bool:
    # Sla mailto:/tel:/javascript: en asset-/download-links over; alleen http(s)
    # naar een echte pagina is zinnig om te crawlen.
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https'):
        return False
    path = parsed.path.lower()
    return not path.endswith(_SKIP_EXTENSIONS)


def _extract_links(html: str, base_url: str, host: str) -> list[str]:
    # Haal interne <a href> links op dezelfde host uit een pagina, absoluut
    # gemaakt en zonder fragment. Dedupe gebeurt bij de aanroeper.
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, 'html.parser')
    links: list[str] = []
    for a in soup.find_all('a', href=True):
        href = a['href'].strip()
        if not href or href.startswith(('#', 'mailto:', 'tel:', 'javascript:')):
            continue
        absolute, _ = urldefrag(urljoin(base_url, href))
        if urlparse(absolute).netloc != host:
            continue  # alleen dezelfde host
        if _is_crawlable(absolute):
            links.append(absolute)
    return links


def crawl_site(start_url: str, max_pages: int = 15) -> Iterator[tuple[str, str]]:
    """Crawl pagina's op dezelfde host vanaf start_url (BFS), key-free.

    Yield per pagina een (url, text)-paar met de leesbare tekst. Breadth-first:
    haal een pagina op, extraheer interne links op dezelfde host, zet onbekende
    in de wachtrij, dedupe, cap op max_pages. Per-pagina 15s timeout, beleefd
    (één request tegelijk). Resilient: een pagina die faalt wordt overgeslagen,
    de crawl crasht nooit. De eerste pagina (start_url) wordt door de aanroeper
    apart opgehaald/gevalideerd; deze generator herstart vanaf die response.
    """
    import requests

    host = urlparse(start_url).netloc
    seen: set[str] = set()
    queue: list[str] = [urldefrag(start_url)[0]]
    headers = {"User-Agent": "Coeus-Onboarding/1.0 (+kennisbank-import)"}

    while queue and len(seen) < max_pages:
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)

        try:
            resp = requests.get(url, timeout=15, headers=headers)
            resp.raise_for_status()
        except requests.exceptions.RequestException:
            continue  # onbereikbare pagina: overslaan, niet crashen

        content_type = resp.headers.get("content-type", "")
        if "html" not in content_type and "text" not in content_type:
            continue  # geen leesbare HTML

        # Wachtrij aanvullen met nieuwe interne links voor we de tekst yielden.
        for link in _extract_links(resp.text, url, host):
            if link not in seen and link not in queue:
                queue.append(link)

        text = html_to_text(resp.text)
        if text.strip():
            yield url, text
