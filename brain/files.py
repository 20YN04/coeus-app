"""Gedeelde bestand-naar-tekst extractie.

Zowel /ingest/file (main.py, handmatige upload) als de lokale-map-connector
(brain/connector.py, automatische scan) moeten exact dezelfde regels volgen
voor toegestane bestandstypes, maximumgrootte en tekst-extractie — anders
levert eenzelfde PDF via de twee paden een ander resultaat op.
"""
import io
from typing import Optional

# Toegestane upload-types en een ruime maximumgrootte (~10MB) zodat één bestand
# het brein niet kan platleggen. PDF gaat door pypdf, .md/.txt als UTF-8-tekst.
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
TEXT_SUFFIXES = (".md", ".markdown", ".txt")
PDF_SUFFIX = ".pdf"
ALLOWED_SUFFIXES = (PDF_SUFFIX,) + TEXT_SUFFIXES


def pdf_to_text(data: bytes) -> str:
    # Extraheer tekst per pagina uit een PDF met pypdf. Onleesbare/lege pagina's
    # leveren gewoon niets op; een corrupte PDF gooit een exception (caller vangt).
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    pages = []
    for page in reader.pages:
        extracted = page.extract_text() or ""
        if extracted.strip():
            pages.append(extracted.strip())
    return "\n\n".join(pages)


def extract_text(filename: str, data: bytes) -> Optional[str]:
    """Extraheer leesbare tekst uit bestand-bytes op basis van de extensie.

    None bij een niet-ondersteund type (caller beslist hoe te reageren — 422
    bij een handmatige upload, stil overslaan bij een map-scan). Een kapotte
    PDF geeft "" i.p.v. te crashen; lege/onleesbare tekstbestanden vallen
    terug op een tolerante decode.
    """
    lower = filename.lower()
    if lower.endswith(PDF_SUFFIX):
        try:
            return pdf_to_text(data)
        except Exception:
            return ""
    if lower.endswith(TEXT_SUFFIXES):
        try:
            return data.decode("utf-8")
        except UnicodeDecodeError:
            return data.decode("utf-8", errors="replace")
    return None
