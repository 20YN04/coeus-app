import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import requests
from brain.memory import Memory
from brain.learner import Learner
from brain.seed import seed_if_empty
from brain.ingest import chunk_text, derive_title, html_to_text, crawl_site
from brain.config import settings
from brain.models import (
    KennisItem, CreateKennisRequest, UpdateKennisRequest,
    LearnRequest, AskRequest, IngestTextRequest, IngestUrlRequest,
    IngestCrawlRequest, CleanupApplyRequest, LlmKeyRequest, LlmStatus,
)

# Auto-opschonen: standaard embedding-afstand waaronder twee items als duplicaat
# gelden. Empirisch getuned op de default embedding (all-MiniLM, cosine-afstand):
# near-identieke tekst zit < ~0.03, items in dezelfde categorie maar inhoudelijk
# verschillend ruim > 0.1. 0.05 vangt echte duplicaten zonder die false positives.
CLEANUP_DEFAULT_THRESHOLD = 0.05


@asynccontextmanager
async def lifespan(app: FastAPI):
    # First-run seed: vul een lege kennisbank uit seed/default.json (of COEUS_SEED_FILE)
    # zodat een verse installatie niet blanco is. Faalt nooit hard — zie brain/seed.py.
    seed_if_empty(memory)
    yield


app = FastAPI(
    title="Coeus API",
    description="AI Brein voor bedrijfskennis",
    lifespan=lifespan,
)

# CORS — de Coeus Kennisbank-frontend doet client-side fetches naar dit brein (cross-origin).
# Zonder dit blokkeert de browser die calls (geen Access-Control-Allow-Origin) en faalt o.a.
# de semantische zoek. Specifieke origins i.p.v. "*" want dit is een muterende API.
# Productie-origins komma-gescheiden via COEUS_CORS_ORIGINS.
_cors_origins = [o.strip() for o in os.environ.get("COEUS_CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)
memory = Memory()
learner = Learner()

@app.get("/")
def root():
    # Statuscheck van de API
    return {"name": "Coeus", "status": "online", "tenant": "default"}

@app.get("/kennis")
def list_kennis(category: str = None):
    # Geef alle kennis-items terug, optioneel gefilterd op categorie
    return memory.get_all(category)

@app.get("/kennis/search")
def search_kennis(q: str, category: str = None,
                  limit: int = Query(default=5, ge=1, le=50)):
    # Zoek semantisch in de kennisbank
    return memory.search(q, limit, category)

@app.get("/kennis/{item_id}")
def get_kennis(item_id: str):
    # Haal één kennis-item op via id
    item = memory.get(item_id)
    if not item:
        raise HTTPException(404, "Niet gevonden")
    return item

@app.post("/kennis")
def add_kennis(item: CreateKennisRequest):
    # Voeg handmatig een kennis-item toe; clients kunnen geen id/created_at injecteren
    return memory.add(
        item.title, item.category, item.content,
        source=item.source, source_detail=item.source_detail
    )

@app.put("/kennis/{item_id}")
def update_kennis(item_id: str, item: UpdateKennisRequest):
    # Werk een bestaand kennis-item bij; alleen title/category/content zijn bewerkbaar
    updated = memory.update(item_id, item.title, item.content, item.category)
    if not updated:
        raise HTTPException(404, "Niet gevonden")
    return updated

@app.delete("/kennis/{item_id}")
def delete_kennis(item_id: str):
    # Verwijder een kennis-item; geef 404 als het id niet bestaat
    if not memory.get(item_id):
        raise HTTPException(404, "Niet gevonden")
    memory.delete(item_id)
    return {"ok": True}

@app.post("/learn")
def learn(request: LearnRequest):
    # Leer uit vrije tekst: GPT extraheert kennis, die we opslaan
    try:
        items = learner.extract_knowledge(request.text, request.category)
    except RuntimeError:
        # OpenAI-verbinding mislukt
        raise HTTPException(502, "Upstream AI-service niet bereikbaar")
    except ValueError:
        # GPT gaf geen parseerbare JSON terug
        raise HTTPException(422, "GPT gaf geen geldige JSON terug; probeer opnieuw")

    saved = []
    skipped = 0
    for item in items:
        try:
            # KeyError als GPT een verplicht veld weglaat; TypeError als item geen dict is
            saved.append(memory.add(
                title=item["title"],
                category=item.get("category", request.category or "algemeen"),
                content=item["content"],
                source="ai",
                source_detail="GPT extractie"
            ))
        except (KeyError, TypeError):
            skipped += 1
    return {"geleerd": len(saved), "overgeslagen": skipped, "items": saved}

def _cited_bronnen(answer: str, context: list) -> list:
    # Geef alleen de bronnen terug die het model echt aanhaalt: hun titel komt voor in
    # het antwoord (de prompt vraagt om de titel te noemen bij citeren). Matcht niets
    # (impliciet geciteerd), val terug op de top-3 meest relevante. Dedupe op titel zodat
    # crawl-duplicaten ('Contactgegevens' ×3) niet driemaal verschijnen.
    low = (answer or "").lower()
    cited = [c for c in context if c.title and c.title.lower() in low]
    chosen = cited or context[:3]
    seen, out = set(), []
    for c in chosen:
        key = (c.title or "").lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(c)
    return out


@app.post("/ask")
def ask(request: AskRequest):
    # Beantwoord een vraag op basis van de kennisbank. Ruimere recall (12 i.p.v. 5):
    # bij een grotere/ruisigere kennisbank (bv. na een crawl) en de zwakke meertalige
    # embeddings zakte het relevante item anders onder de top-5 → "weet ik niks" terwijl
    # het antwoord wél in de kennisbank stond. De gehardde system-prompt laat het model
    # de irrelevante items negeren.
    context = memory.search(request.question, limit=12)
    try:
        answer = learner.answer_question(request.question, context, lang=request.lang)
    except RuntimeError:
        raise HTTPException(503, "Upstream AI-service niet bereikbaar")

    return {
        "antwoord": answer,
        # Alleen de écht geciteerde bronnen teruggeven (titel komt voor in het antwoord),
        # niet alle 12 opgehaalde context-items — anders oogt elk antwoord onfocus.
        # id meegeven zodat de frontend per bron naar /kennisbank/detail kan linken.
        "bronnen": [
            {"id": c.id, "title": c.title, "category": c.category}
            for c in _cited_bronnen(answer, context)
        ],
    }


@app.get("/config/llm-status", response_model=LlmStatus)
def llm_status():
    # Of er een LLM-key beschikbaar is (env óf lokaal bestand) en welke provider.
    # Geeft NOOIT de key zelf terug — alleen booleans + provider/model.
    configured = bool(settings.llm_api_key)
    return LlmStatus(
        configured=configured,
        provider=settings.llm_provider,
        model=settings.llm_model if configured else None,
    )


@app.post("/config/llm-key")
def set_llm_key(request: LlmKeyRequest):
    # Schrijf de LLM-key naar een lokaal bestand in de data-map. Loopback-only brein,
    # dus dit accepteren we lokaal. De key komt zo NOOIT in de JS-bundle terecht en
    # de Learner herleest hem per call → de volgende /ask|/learn werkt direct.
    key = request.key.strip()
    if not key:
        raise HTTPException(422, "Lege sleutel")

    path = settings.llm_key_path
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(key)
        # Best-effort restrictieve rechten op unix (eigenaar lezen/schrijven).
        # Faalt stil op platforms zonder chmod-semantiek (bv. Windows).
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
    except OSError:
        raise HTTPException(500, "Kon de sleutel niet opslaan")

    return {"ok": True, "configured": True}


@app.delete("/config/llm-key")
def delete_llm_key():
    # Verwijder het lokale key-bestand. Idempotent: bestaat het al niet, dan is de
    # uitkomst nog steeds "niet geconfigureerd". Env-keys raken we niet aan — die
    # leven niet in dit bestand. configured weerspiegelt de actuele situatie.
    path = settings.llm_key_path
    try:
        os.remove(path)
    except FileNotFoundError:
        pass
    except OSError:
        raise HTTPException(500, "Kon de sleutel niet verwijderen")

    return {"configured": bool(settings.llm_api_key)}

def _ingest_chunks(text: str, category: str | None, source_detail: str) -> int:
    # Gedeelde kern van /ingest/text en /ingest/url: tekst hakken, titel afleiden,
    # elk stuk als kennis-item opslaan met source="import". Key-free, geen LLM.
    chunks = chunk_text(text)
    cat = (category or "").strip() or "import"
    added = 0
    for chunk in chunks:
        memory.add(
            title=derive_title(chunk),
            category=cat,
            content=chunk,
            source="import",
            source_detail=source_detail,
        )
        added += 1
    return added


# Max tekst per pagina die we aan de LLM voeren — token-/kostenplafond bij crawl.
_AI_EXTRACT_MAX_CHARS = 12000


def _ingest_page(text: str, category: str | None, source_detail: str) -> int:
    # Slimme ingest van één opgehaalde webpagina. MÉT LLM-sleutel: laat de Learner (Pro)
    # de pagina structureren tot een paar schone feiten i.p.v. de hele pagina (incl.
    # nav/footer/"Lees meer") ruw te chunken — ruwe chunking maakte bij echte sites een
    # vuilnisbak-kennisbank (validatie ericbanden.be: 15 pagina's → 544 ruis-items).
    # ZONDER sleutel of bij een LLM-fout op deze pagina: val terug op key-free chunking
    # zodat de crawl altijd werkt (offline-veilig); één rotte pagina stopt de crawl niet.
    if settings.llm_api_key:
        try:
            # Crawl is bulk (veel pagina's) → flash (snel/goedkoop), niet pro (reasoning,
            # ~5x trager per pagina). Flash extraheert schone feiten in ~15s/pagina.
            items = learner.extract_knowledge(
                text[:_AI_EXTRACT_MAX_CHARS], category, model=settings.llm_model
            )
            added = 0
            for item in items:
                if not isinstance(item, dict):
                    continue
                title = (item.get("title") or "").strip()
                content = (item.get("content") or "").strip()
                if not title or not content:
                    continue
                memory.add(
                    title=title,
                    category=(item.get("category") or category or "import").strip() or "import",
                    content=content,
                    source="ai",
                    source_detail=source_detail,
                )
                added += 1
            if added:
                return added
            # AI gaf niets bruikbaars terug → val terug op chunking
        except (RuntimeError, ValueError):
            pass
    return _ingest_chunks(text, category, source_detail)


@app.post("/ingest/text")
def ingest_text(request: IngestTextRequest):
    # Onboarding-motor: vrije tekst (of geplakte website-tekst) in stukken hakken
    # en als kennis-items opslaan. source_detail = de meegegeven URL of "tekst-import".
    source_detail = (request.source_url or "").strip() or "tekst-import"
    added = _ingest_chunks(request.text, request.category, source_detail)
    return {"toegevoegd": added}


@app.post("/ingest/url")
def ingest_url(request: IngestUrlRequest):
    # Onboarding-motor: een webpagina server-side ophalen, leesbare tekst extraheren
    # en in stukken hakken. Resilient: bad/unreachable URL → nette 4xx/5xx, nooit crash.
    url = request.url.strip()
    if not url.lower().startswith(("http://", "https://")):
        raise HTTPException(422, "Ongeldige URL — gebruik http:// of https://")

    try:
        resp = requests.get(
            url,
            timeout=15,
            headers={"User-Agent": "Coeus-Onboarding/1.0 (+kennisbank-import)"},
        )
        resp.raise_for_status()
    except requests.exceptions.Timeout:
        raise HTTPException(502, "De website reageerde niet op tijd")
    except requests.exceptions.RequestException:
        raise HTTPException(502, "Kon de website niet ophalen")

    content_type = resp.headers.get("content-type", "")
    if "html" not in content_type and "text" not in content_type:
        raise HTTPException(422, "De URL bevat geen leesbare tekst (geen HTML)")

    text = html_to_text(resp.text)
    if not text.strip():
        raise HTTPException(422, "Geen leesbare tekst gevonden op deze pagina")

    added = _ingest_page(text, request.category, url)
    return {"toegevoegd": added, "ai_extractie": bool(settings.llm_api_key)}


@app.post("/ingest/crawl")
def ingest_crawl(request: IngestCrawlRequest):
    # Onboarding-motor: hele site crawlen vanaf url (BFS, dezelfde host), per pagina
    # leesbare tekst extraheren en in stukken hakken. Resilient: onbereikbare
    # start → 502, niet-HTML start → 422, en losse pagina's die falen worden
    # tijdens de crawl stilletjes overgeslagen (zie crawl_site).
    url = request.url.strip()
    if not url.lower().startswith(("http://", "https://")):
        raise HTTPException(422, "Ongeldige URL — gebruik http:// of https://")

    # Valideer de startpagina expliciet zodat een dode/niet-HTML URL een nette
    # foutmelding geeft i.p.v. een lege crawl (de generator slaat fouten stil over).
    try:
        resp = requests.get(
            url,
            timeout=15,
            headers={"User-Agent": "Coeus-Onboarding/1.0 (+kennisbank-import)"},
        )
        resp.raise_for_status()
    except requests.exceptions.Timeout:
        raise HTTPException(502, "De website reageerde niet op tijd")
    except requests.exceptions.RequestException:
        raise HTTPException(502, "Kon de website niet ophalen")

    content_type = resp.headers.get("content-type", "")
    if "html" not in content_type and "text" not in content_type:
        raise HTTPException(422, "De URL bevat geen leesbare tekst (geen HTML)")

    added = 0
    pages = 0
    for page_url, text in crawl_site(url, request.max_pages):
        added += _ingest_page(text, request.category, page_url)
        pages += 1

    return {"toegevoegd": added, "paginas": pages, "ai_extractie": bool(settings.llm_api_key)}


# Toegestane upload-types en een ruime maximumgrootte (~10MB) zodat één bestand
# het brein niet kan platleggen. PDF gaat door pypdf, .md/.txt als UTF-8-tekst.
_MAX_UPLOAD_BYTES = 10 * 1024 * 1024
_TEXT_SUFFIXES = (".md", ".markdown", ".txt")


def _pdf_to_text(data: bytes) -> str:
    # Extraheer tekst per pagina uit een PDF met pypdf. Onleesbare/lege pagina's
    # leveren gewoon niets op; een corrupte PDF geeft een nette 422 (zie caller).
    import io
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    pages = []
    for page in reader.pages:
        extracted = page.extract_text() or ""
        if extracted.strip():
            pages.append(extracted.strip())
    return "\n\n".join(pages)


@app.post("/ingest/file")
async def ingest_file(file: UploadFile = File(...), category: str | None = Form(default=None)):
    # Onboarding-motor: een geüpload bestand (.pdf / .md / .markdown / .txt) inlezen,
    # tekst extraheren, in stukken hakken en key-free opslaan. source_detail =
    # de bestandsnaam. Resilient: verkeerd type / te groot / onleesbaar → nette 4xx.
    name = (file.filename or "").strip() or "upload"
    lower = name.lower()

    data = await file.read()
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(422, "Bestand is te groot (max 10MB)")
    if not data:
        raise HTTPException(422, "Het bestand is leeg")

    if lower.endswith(".pdf"):
        try:
            text = _pdf_to_text(data)
        except Exception:
            raise HTTPException(422, "Kon de PDF niet lezen — is het een geldig PDF-bestand?")
    elif lower.endswith(_TEXT_SUFFIXES):
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            # Val terug op een tolerante decode i.p.v. te crashen op rare bytes.
            text = data.decode("utf-8", errors="replace")
    else:
        raise HTTPException(422, "Niet-ondersteund bestandstype — gebruik .pdf, .md, .markdown of .txt")

    if not text.strip():
        raise HTTPException(422, "Geen leesbare tekst gevonden in dit bestand")

    added = _ingest_chunks(text, category, name)
    return {"toegevoegd": added, "bestand": name}


@app.get("/categories")
def categories():
    # Geef alle categorieën met item-aantallen terug
    return memory.get_categories()

@app.get("/graph")
def graph(neighbors: int = Query(default=4, ge=1, le=20)):
    # Semantische kennis-graph: nodes + edges op basis van embedding-gelijkenis
    return memory.build_graph(neighbors)


@app.get("/cleanup/preview")
def cleanup_preview(
    threshold: float = Query(default=CLEANUP_DEFAULT_THRESHOLD, ge=0.0, le=2.0),
):
    # Auto-opschonen (read-only): vind near-duplicate kennis-items via de bestaande
    # embeddings (key-free, geen LLM) zodat de UI "X duplicaten in Y groepen" kan
    # tonen vóór het verwijderen. Crasht nooit op een lege kennisbank (→ 0/0).
    clusters = memory.find_duplicates(threshold)
    duplicaten = sum(len(c["remove"]) for c in clusters)
    return {
        "groepen": len(clusters),
        "duplicaten": duplicaten,
        # Per groep de keeper-titel + een paar voorbeeld-titels van wat zou
        # verdwijnen, zodat de UI context kan tonen zonder alle content te laden.
        "clusters": [
            {
                "keep": c["keep"]["title"],
                "remove": [r["title"] for r in c["remove"]],
            }
            for c in clusters
        ],
    }


@app.post("/cleanup/apply")
def cleanup_apply(request: CleanupApplyRequest):
    # Auto-opschonen (muterend): vind near-duplicates en verwijder per groep alles
    # behalve de keeper. Geeft het aantal verwijderde items terug.
    threshold = request.threshold if request.threshold is not None else CLEANUP_DEFAULT_THRESHOLD
    removed = memory.dedupe(threshold)
    return {"verwijderd": removed}
