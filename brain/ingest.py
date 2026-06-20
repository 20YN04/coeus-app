"""Onboarding-motor: key-free tekst-naar-kennis (geen LLM).

Hakt vrije tekst of een opgehaalde webpagina in zinnige stukken en leidt per
stuk een korte titel af. Bewust dom en deterministisch — geen AI-call, geen
externe key. Wordt gebruikt door /ingest/text en /ingest/url in main.py.
"""

import re
from typing import Optional

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
