import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import requests
from brain.memory import Memory
from brain.learner import Learner
from brain.seed import seed_if_empty
from brain.ingest import chunk_text, derive_title, html_to_text
from brain.models import (
    KennisItem, CreateKennisRequest, UpdateKennisRequest,
    LearnRequest, AskRequest, IngestTextRequest, IngestUrlRequest,
)


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

@app.post("/ask")
def ask(request: AskRequest):
    # Beantwoord een vraag op basis van de kennisbank
    context = memory.search(request.question, limit=5)
    try:
        answer = learner.answer_question(request.question, context)
    except RuntimeError:
        raise HTTPException(503, "Upstream AI-service niet bereikbaar")

    return {
        "antwoord": answer,
        "bronnen": [{"title": c.title, "category": c.category} for c in context]
    }

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

    added = _ingest_chunks(text, request.category, url)
    return {"toegevoegd": added}


@app.get("/categories")
def categories():
    # Geef alle categorieën met item-aantallen terug
    return memory.get_categories()

@app.get("/graph")
def graph(neighbors: int = Query(default=4, ge=1, le=20)):
    # Semantische kennis-graph: nodes + edges op basis van embedding-gelijkenis
    return memory.build_graph(neighbors)
