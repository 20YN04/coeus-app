import chromadb
import uuid
from datetime import datetime
from .config import settings
from .models import KennisItem

class Memory:
    def __init__(self):
        # Persistente ChromaDB-client; data wordt op schijf bewaard
        self.client = chromadb.PersistentClient(path=settings.chroma_db_path)
        self.collection = self.client.get_or_create_collection(
            name=f"memora_{settings.memora_tenant}"
        )

    def add(self, title: str, category: str, content: str,
            source: str = "manual", source_detail: str = None) -> KennisItem:
        # Voeg een nieuw kennis-item toe aan de kennisbank
        item_id = str(uuid.uuid4())
        now = datetime.now()

        self.collection.add(
            ids=[item_id],
            documents=[content],
            metadatas=[{
                "title": title,
                "category": category,
                "source": source,
                "source_detail": source_detail or "",
                "created_at": now.isoformat()
            }]
        )

        return KennisItem(
            id=item_id, title=title, category=category,
            content=content, source=source,
            source_detail=source_detail, created_at=now
        )

    def search(self, query: str, limit: int = 5,
               category: str = None) -> list[KennisItem]:
        # Zoek semantisch in de kennisbank, optioneel gefilterd op categorie
        where_filter = {"category": category} if category else None
        results = self.collection.query(
            query_texts=[query], n_results=limit, where=where_filter
        )

        items = []
        if results['ids'] and results['ids'][0]:
            for i in range(len(results['ids'][0])):
                meta = results['metadatas'][0][i]
                items.append(KennisItem(
                    id=results['ids'][0][i],
                    title=meta['title'],
                    category=meta['category'],
                    content=results['documents'][0][i],
                    source=meta.get('source', 'manual'),
                    source_detail=meta.get('source_detail'),
                    created_at=datetime.fromisoformat(meta['created_at'])
                ))
        return items

    def get(self, item_id: str) -> KennisItem | None:
        # Haal één specifiek kennis-item op via id
        result = self.collection.get(ids=[item_id])
        if not result['ids']:
            return None
        meta = result['metadatas'][0]
        return KennisItem(
            id=item_id, title=meta['title'],
            category=meta['category'],
            content=result['documents'][0],
            source=meta.get('source', 'manual'),
            source_detail=meta.get('source_detail'),
            created_at=datetime.fromisoformat(meta['created_at'])
        )

    def get_all(self, category: str = None) -> list[KennisItem]:
        # Haal alle kennis-items op, optioneel gefilterd op categorie
        where_filter = {"category": category} if category else None
        result = self.collection.get(where=where_filter)
        items = []
        if result['ids']:
            for i in range(len(result['ids'])):
                meta = result['metadatas'][i]
                items.append(KennisItem(
                    id=result['ids'][i], title=meta['title'],
                    category=meta['category'],
                    content=result['documents'][i],
                    source=meta.get('source', 'manual'),
                    source_detail=meta.get('source_detail'),
                    created_at=datetime.fromisoformat(meta['created_at'])
                ))
        return items

    def update(self, item_id: str, title: str = None,
               content: str = None, category: str = None) -> KennisItem | None:
        # Werk een item bij; bestaande waarden blijven behouden indien niet meegegeven
        existing = self.get(item_id)
        if not existing:
            return None

        new_title = title or existing.title
        new_content = content or existing.content
        new_category = category or existing.category

        self.delete(item_id)
        return self.add(
            title=new_title, category=new_category,
            content=new_content, source=existing.source,
            source_detail=existing.source_detail
        )

    def delete(self, item_id: str):
        # Verwijder een item uit de kennisbank
        self.collection.delete(ids=[item_id])

    def get_categories(self) -> list[dict]:
        # Geef alle categorieën terug met het aantal items per categorie
        result = self.collection.get()
        cats = {}
        if result['metadatas']:
            for meta in result['metadatas']:
                cat = meta['category']
                cats[cat] = cats.get(cat, 0) + 1
        return [{"name": k, "count": v} for k, v in cats.items()]
