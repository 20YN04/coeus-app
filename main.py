from fastapi import FastAPI, HTTPException, Query
from brain.memory import Memory
from brain.learner import Learner
from brain.models import KennisItem, CreateKennisRequest, UpdateKennisRequest, LearnRequest, AskRequest

app = FastAPI(title="Coeus API", description="AI Brein voor bedrijfskennis")
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

@app.get("/categories")
def categories():
    # Geef alle categorieën met item-aantallen terug
    return memory.get_categories()
