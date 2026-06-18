from fastapi import FastAPI, HTTPException
from brain.memory import Memory
from brain.learner import Learner
from brain.models import KennisItem, LearnRequest, AskRequest

app = FastAPI(title="Memora API", description="AI Brein voor bedrijfskennis")
memory = Memory()
learner = Learner()

@app.get("/")
def root():
    # Statuscheck van de API
    return {"name": "Memora", "status": "online", "tenant": "default"}

@app.get("/kennis")
def list_kennis(category: str = None):
    # Geef alle kennis-items terug, optioneel gefilterd op categorie
    return memory.get_all(category)

@app.get("/kennis/search")
def search_kennis(q: str, category: str = None, limit: int = 5):
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
def add_kennis(item: KennisItem):
    # Voeg handmatig een kennis-item toe
    return memory.add(item.title, item.category, item.content, source="manual")

@app.put("/kennis/{item_id}")
def update_kennis(item_id: str, item: KennisItem):
    # Werk een bestaand kennis-item bij
    updated = memory.update(item_id, item.title, item.content, item.category)
    if not updated:
        raise HTTPException(404, "Niet gevonden")
    return updated

@app.delete("/kennis/{item_id}")
def delete_kennis(item_id: str):
    # Verwijder een kennis-item
    memory.delete(item_id)
    return {"ok": True}

@app.post("/learn")
def learn(request: LearnRequest):
    # Leer uit vrije tekst: GPT extraheert kennis, die we opslaan
    items = learner.extract_knowledge(request.text, request.category)
    saved = []
    for item in items:
        saved.append(memory.add(
            title=item["title"],
            category=item.get("category", request.category or "algemeen"),
            content=item["content"],
            source="ai",
            source_detail="GPT extractie"
        ))
    return {"geleerd": len(saved), "items": saved}

@app.post("/ask")
def ask(request: AskRequest):
    # Beantwoord een vraag op basis van de kennisbank
    context = memory.search(request.question, limit=5)
    answer = learner.answer_question(request.question, context)
    return {
        "antwoord": answer,
        "bronnen": [{"title": c.title, "category": c.category} for c in context]
    }

@app.get("/categories")
def categories():
    # Geef alle categorieën met item-aantallen terug
    return memory.get_categories()
