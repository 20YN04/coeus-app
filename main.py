import logging
import os
import threading
import time
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import requests
from brain.memory import Memory
from brain.learner import Learner
from brain.seed import seed_if_empty
from brain.ingest import (
    chunk_text, derive_title, filter_noise_chunks, html_to_text,
    crawl_site, crawl_site_with_progress,
)
from brain.files import ALLOWED_SUFFIXES, MAX_UPLOAD_BYTES, extract_text, pdf_to_text
from brain.config import settings
from brain.feedback import append_feedback, read_feedback
from brain.usage import append_usage
from brain.digest import build_digest
from brain.models import (
    KennisItem, CreateKennisRequest, UpdateKennisRequest,
    LearnRequest, AskRequest, IngestTextRequest, IngestUrlRequest,
    IngestCrawlRequest, CleanupApplyRequest, LlmKeyRequest, LlmStatus,
    ConnectFolderRequest,
    FeedbackRequest,
)
from brain import connector as connector_mod

logger = logging.getLogger("coeus.main")

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
    # Gekoppelde map (indien aanwezig) her-scannen bij opstart, in een achtergrond-
    # thread zodat een grote map de boot nooit blokkeert. Faalt nooit hard.
    connector_mod.auto_rescan_in_background(memory)
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


def _log_usage(event_type: str, meta: dict | None = None) -> None:
    # Gedeelde basis voor het weekrapport (GET /digest, brain/digest.py):
    # append-only usage.jsonl, zie brain/usage.py. Nooit een request laten
    # falen door logging — een schijf-/rechtenprobleem hier mag /ask,
    # /kennis/search of een ingest-route niet breken.
    try:
        append_usage(settings.data_dir, event_type, meta)
    except Exception:  # noqa: BLE001 — logging mag nooit de request breken
        logger.warning("Kon usage-event '%s' niet loggen", event_type, exc_info=True)

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
    # Zoek semantisch in de kennisbank. Usage-log zonder zoekterm (privacy) —
    # het weekrapport telt enkel dát er gezocht is, niet waarnaar.
    results = memory.search(q, limit, category)
    _log_usage("search")
    return results

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

    # Usage-log: de vraag zelf (nodig voor het weekrapport — "waar vroeg men
    # naar") + answered (echt antwoord vs. de letterlijke "weet ik niet"-
    # fallback, zie Learner.is_fallback).
    _log_usage("ask", {"vraag": request.question, "answered": not learner.is_fallback(answer)})

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

def _ingest_chunks(
    text: str, category: str | None, source_detail: str, *, filter_noise: bool = False
) -> int:
    # Gedeelde kern van de key-free ingest-routes: tekst hakken, titel afleiden,
    # elk stuk als kennis-item opslaan met source="import". Key-free, geen LLM.
    # filter_noise alleen voor web-afgeleide tekst (URL/crawl): boilerplate-chunks
    # (knoppen, cookie-balken, nav-lijsten) eruit. Zelf geplakte tekst en bestanden
    # worden nooit gefilterd — wat de gebruiker bewust aanlevert is per definitie kennis.
    chunks = chunk_text(text)
    if filter_noise:
        chunks = filter_noise_chunks(chunks)
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
    return _ingest_chunks(text, category, source_detail, filter_noise=True)


@app.post("/ingest/text")
def ingest_text(request: IngestTextRequest):
    # Onboarding-motor: vrije tekst (of geplakte website-tekst) in stukken hakken
    # en als kennis-items opslaan. source_detail = de meegegeven URL of "tekst-import".
    source_detail = (request.source_url or "").strip() or "tekst-import"
    added = _ingest_chunks(request.text, request.category, source_detail)
    _log_usage("ingest", {"bron": "text", "toegevoegd": added})
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
    _log_usage("ingest", {"bron": "url", "toegevoegd": added})
    return {"toegevoegd": added, "ai_extractie": bool(settings.llm_api_key)}


# Crawl-voortgang — in-memory job-store voor de async /ingest/crawl-flow (single-
# user lokale desktop-app: geen persistentie/multi-worker nodig, de sidecar
# draait per klant op hun eigen machine). Klaar-jobs blijven ~1u opvraagbaar
# zodat de wizard/Importeren-UI de eindstatus nog kan tonen na een trage tab-
# switch; oudere jobs ruimen we lazy op bij het starten van een nieuwe job.
_crawl_jobs: dict[str, dict] = {}
CRAWL_JOB_RETENTION_SECONDS = 3600


def _prune_crawl_jobs() -> None:
    cutoff = time.time() - CRAWL_JOB_RETENTION_SECONDS
    stale = [
        jid for jid, job in _crawl_jobs.items()
        if job["status"] != "running" and job.get("afgerond_op", cutoff + 1) < cutoff
    ]
    for jid in stale:
        del _crawl_jobs[jid]


def _run_crawl_job(job_id: str, url: str, max_pages: int, category: str | None) -> None:
    # Draait in een achtergrond-thread (stdlib threading — geen celery/nieuwe
    # deps). Elke stap schrijft naar de job-dict; GET /ingest/status/{id} leest
    # 'm read-only. Faalt de crawl halverwege, dan eindigt de job netjes op
    # status "error" i.p.v. voor altijd op "running" te blijven hangen — de
    # tellingen tot dat punt blijven staan (partial credit).
    job = _crawl_jobs[job_id]
    added = 0
    pages = 0
    try:
        for page_url, text, bezocht, queue_len in crawl_site_with_progress(url, max_pages):
            job["huidige_url"] = page_url
            added += _ingest_page(text, category, page_url)
            pages = bezocht
            job["paginas_bezocht"] = pages
            job["paginas_totaal_geschat"] = bezocht + queue_len
            job["toegevoegd"] = added
        job["opgeschoond"] = memory.dedupe(CLEANUP_DEFAULT_THRESHOLD) if added else 0
        job["status"] = "done"
    except Exception as exc:  # noqa: BLE001 — achtergrond-thread mag nooit stil crashen
        job["error"] = str(exc)
        job["status"] = "error"
    finally:
        job["afgerond_op"] = time.time()
        # Partial credit: log wat er binnen is, ook als de job halverwege faalde.
        _log_usage("ingest", {"bron": "crawl", "toegevoegd": added})


@app.post("/ingest/crawl")
def ingest_crawl(request: IngestCrawlRequest, async_: bool = Query(default=False, alias="async")):
    # Onboarding-motor: hele site crawlen vanaf url (BFS, dezelfde host), per pagina
    # leesbare tekst extraheren en in stukken hakken. Resilient: onbereikbare
    # start → 502, niet-HTML start → 422, en losse pagina's die falen worden
    # tijdens de crawl stilletjes overgeslagen (zie crawl_site).
    #
    # Default blijft het oude synchrone gedrag — ongewijzigd, zodat bestaande
    # callers/tests niets merken. ?async=true start in plaats daarvan een
    # achtergrond-thread en geeft meteen {job_id} terug; voortgang via
    # GET /ingest/status/{job_id}. De wizard en Importeren gebruiken dit pad.
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

    if not async_:
        added = 0
        pages = 0
        for page_url, text in crawl_site(url, request.max_pages):
            added += _ingest_page(text, request.category, page_url)
            pages += 1

        # Auto-opschonen ná de crawl: dezelfde near-duplicate-pass als Instellingen →
        # Opschonen, maar automatisch — blokken die over meerdere pagina's herhaald
        # worden (uitgelekte boilerplate, dubbele feiten) verdwijnen meteen i.p.v. dat
        # de klant zelf moet opschonen. Alleen draaien als er echt iets is toegevoegd.
        opgeschoond = memory.dedupe(CLEANUP_DEFAULT_THRESHOLD) if added else 0
        _log_usage("ingest", {"bron": "crawl", "toegevoegd": added})

        return {
            "toegevoegd": added,
            "paginas": pages,
            "opgeschoond": opgeschoond,
            "ai_extractie": bool(settings.llm_api_key),
        }

    _prune_crawl_jobs()
    job_id = uuid.uuid4().hex
    _crawl_jobs[job_id] = {
        "status": "running",
        "paginas_bezocht": 0,
        "paginas_totaal_geschat": 1,
        "toegevoegd": 0,
        "huidige_url": url,
        "opgeschoond": None,
        "error": None,
    }
    thread = threading.Thread(
        target=_run_crawl_job,
        args=(job_id, url, request.max_pages, request.category),
        daemon=True,
    )
    thread.start()
    return {"job_id": job_id}


@app.get("/ingest/status/{job_id}")
def ingest_crawl_status(job_id: str):
    # Voortgang van een async crawl-job (zie POST /ingest/crawl?async=true).
    # Read-only view op de job-dict; 404 als de job niet (meer) bestaat —
    # klaar-jobs blijven CRAWL_JOB_RETENTION_SECONDS opvraagbaar.
    job = _crawl_jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job niet gevonden")
    return {
        "status": job["status"],
        "paginas_bezocht": job["paginas_bezocht"],
        "paginas_totaal_geschat": job["paginas_totaal_geschat"],
        "toegevoegd": job["toegevoegd"],
        "huidige_url": job["huidige_url"],
        "opgeschoond": job["opgeschoond"],
        "error": job["error"],
    }


@app.post("/ingest/file")
async def ingest_file(file: UploadFile = File(...), category: str | None = Form(default=None)):
    # Onboarding-motor: een geüpload bestand (.pdf / .md / .markdown / .txt) inlezen,
    # tekst extraheren, in stukken hakken en key-free opslaan. source_detail =
    # de bestandsnaam. Resilient: verkeerd type / te groot / onleesbaar → nette 4xx.
    # Extractie zit in brain/files.py, gedeeld met de map-connector (brain/connector.py).
    name = (file.filename or "").strip() or "upload"
    lower = name.lower()

    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(422, "Bestand is te groot (max 10MB)")
    if not data:
        raise HTTPException(422, "Het bestand is leeg")

    if not lower.endswith(ALLOWED_SUFFIXES):
        raise HTTPException(422, "Niet-ondersteund bestandstype — gebruik .pdf, .md, .markdown of .txt")

    if lower.endswith(".pdf"):
        try:
            text = pdf_to_text(data)
        except Exception:
            raise HTTPException(422, "Kon de PDF niet lezen — is het een geldig PDF-bestand?")
    else:
        text = extract_text(name, data) or ""

    if not text.strip():
        raise HTTPException(422, "Geen leesbare tekst gevonden in dit bestand")

    added = _ingest_chunks(text, category, name)
    _log_usage("ingest", {"bron": "file", "toegevoegd": added})
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


# --- Lokale-map-connector ---------------------------------------------------
# "Gedeelde map"-variant van map-sync (géén Google-OAuth): een KMO koppelt één
# map op deze machine (bv. de offerte-/documentenmap) en Coeus leert alle
# .pdf/.md/.markdown/.txt-bestanden erin, met her-scan om nieuwe/gewijzigde
# bestanden bij te leren. Werkt alleen zolang het brein op dezelfde machine
# draait als de gekoppelde map (Tauri-sidecar leest rechtstreeks van schijf).
# Logica in brain/connector.py; hier alleen HTTP-vertaling.

@app.get("/connector/folder")
def connector_status():
    # Huidige koppeling + laatste scan-cijfers, of {"path": null} als er geen is.
    return connector_mod.get_status(memory)


@app.post("/connector/folder")
def connector_connect(request: ConnectFolderRequest):
    # Koppel een absolute map en draai meteen de eerste scan. Ongeldig/
    # onbereikbaar pad → 422 (bestaat niet, is geen map, of niet leesbaar).
    try:
        status = connector_mod.connect_folder(memory, request.path)
    except connector_mod.ConnectorError as e:
        raise HTTPException(422, str(e))
    _log_usage("ingest", {"bron": "connector", "toegevoegd": status.get("items_toegevoegd", 0)})
    return status


@app.post("/connector/rescan")
def connector_rescan():
    # Scan de gekoppelde map opnieuw: nieuw/gewijzigd/verwijderd bijwerken.
    # Geen koppeling → lege tellers (geen 404; "niets te doen" is geen fout).
    result = connector_mod.scan_folder(memory)
    _log_usage("ingest", {"bron": "connector", "toegevoegd": result.get("items_toegevoegd", 0)})
    return result


@app.delete("/connector/folder")
def connector_disconnect(verwijder_items: bool = Query(default=False)):
    # Ontkoppel de map. De koppeling (connector.json) verdwijnt; de al geleerde
    # items blijven staan tenzij verwijder_items=true expliciet wordt meegegeven.
    return connector_mod.disconnect(memory, verwijder_items=verwijder_items)


@app.post("/feedback")
def submit_feedback(request: FeedbackRequest):
    # Duim omhoog/omlaag op een /ask-antwoord: key-vrij, lokaal, append-only
    # (zie brain/feedback.py). exclude_none zodat een niet-meegegeven reason/
    # source_ids niet als "null" in het JSONL-bestand belandt.
    try:
        return append_feedback(settings.data_dir, request.model_dump(exclude_none=True))
    except OSError:
        raise HTTPException(500, "Feedback kon niet opgeslagen worden")


@app.get("/feedback")
def list_feedback(limit: int = Query(default=100, ge=1, le=500)):
    # Nieuwste eerst — voedt een later beheer-scherm waar Ynarchive (en de klant)
    # de antwoordkwaliteit opvolgt.
    return read_feedback(settings.data_dir, limit)


@app.get("/digest")
def digest(days: int = Query(default=7, ge=1, le=90), lang: str = Query(default="nl", max_length=5)):
    # Weekrapport: key-vrij berekend uit chroma-metadata + usage.jsonl +
    # feedback.jsonl (brain/digest.py, deelt de usage-basis met het waarde-blok
    # in de Overzicht-UI). "samenvatting" is de enige LLM-stap — optioneel: zonder
    # sleutel blijft dat veld null, de rest van het rapport werkt altijd.
    result = build_digest(memory, settings.data_dir, days)
    if settings.llm_api_key:
        try:
            result["samenvatting"] = learner.summarize_digest(result, lang=lang)
        except RuntimeError:
            result["samenvatting"] = None
    return result

