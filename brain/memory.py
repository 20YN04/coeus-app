import chromadb
import os
import re
import uuid
from datetime import datetime
from typing import Optional
from .config import settings
from .models import KennisItem

# Hybride zoeken: reine semantische ranking liet exacte termen (merknamen,
# telefoonnummerfragmenten) wegzakken zodra het meertalige embedding-model de
# zin parafraseerde i.p.v. letterlijk matchte. Token-regex: alnum-reeksen
# (unicode-vriendelijk), zodat "Pirelli" en "0470" allebei als term tellen.
_TOKEN_RE = re.compile(r"[^\W_]+", re.UNICODE)

# Kleine functiewoorden-lijst (NL + EN). Geen nieuwe dependency, geen corpus-brede
# idf-berekening (bleek onstabiel bij een kleine kennisbank: in een corpus van maar
# een paar items lijkt elk woord toevallig "zeldzaam"). Lidwoorden/voorzetsels/
# voornaamwoorden uit de query filteren voorkomt dat ze een item zonder de
# daadwerkelijk gezochte term (merknaam, telefoonnummer) toch lexicaal laten winnen.
_STOPWORDS = {
    "de", "het", "een", "en", "van", "in", "op", "te", "dat", "die", "dit",
    "is", "zijn", "was", "er", "voor", "aan", "met", "als", "ook", "maar",
    "of", "om", "uit", "bij", "niet", "je", "jij", "jullie", "wij", "we",
    "ik", "hij", "zij", "ze", "u", "wat", "hoe", "wie", "welke", "welk",
    "waar", "wanneer", "dan", "dus", "naar", "tot", "over", "onder",
    "tussen", "zonder", "door", "the", "a", "an", "and", "or", "to", "for",
    "are", "were", "which", "when", "do", "does", "did", "this", "that",
    "these", "those", "with", "at", "by", "from", "it", "its", "be", "been",
    "you", "he", "she", "they",
}


def _tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall(text.lower())


def _content_tokens(query: str) -> list[str]:
    # Unieke, betekenisdragende query-tokens (stopwoorden eruit) — bepaalt zowel de
    # teller (matches) als de noemer (totaal) van de term-overlap-score.
    return list(dict.fromkeys(t for t in _tokenize(query) if t not in _STOPWORDS))


def _token_present(token: str, text_lower: str) -> bool:
    # Woordgrens (\b), geen kale substring: anders matcht het 2-letter token "is"
    # ook midden in "adviseren" en vervuilt elke query met een stopwoord de score.
    return re.search(rf"\b{re.escape(token)}\b", text_lower) is not None


def _lexical_score(query: str, content_tokens: list[str], query_digits: str, text: str) -> float:
    # Genormaliseerde lexicale score in [0, 1] voor één item t.o.v. de query.
    # Géén nieuwe dependency (geen rank_bm25 o.i.d.) — de kennisbank is klein
    # (honderden items), een stdlib full-scan per query is prima.
    if not text:
        return 0.0
    text_lower = text.lower()

    # Exacte frase (case-insensitief) — merknaam of letterlijke deelzin — is het
    # sterkste signaal: volle score, ongeacht token-overlap elders.
    stripped = query.strip().lower()
    if stripped and stripped in text_lower:
        return 1.0

    # Cijferreeksen (telefoonnummers) matchen ongeacht spaties/streepjes/punten
    # in de opmaak — "0470 12 34 56" vindt "0470/12.34.56" en omgekeerd.
    if len(query_digits) >= 4 and query_digits in re.sub(r"\D", "", text_lower):
        return 1.0

    if not content_tokens:
        return 0.0
    hits = sum(1 for t in content_tokens if _token_present(t, text_lower))
    return hits / len(content_tokens)


# Hybride ranking: gewogen score-mix van semantische score (chroma-afstand →
# 1/(1+afstand), zelfde conventie als Memory.build_graph verderop) en lexicale score
# (_lexical_score, [0,1]). 0.7/0.3: semantiek blijft dominant voor vage/parafraserende
# vragen (bestaand gedrag — bij lexical_score=0 is de ranking een pure schaling van de
# semantische score, dus identiek geordend), maar een exacte term geeft een vaste
# lexicale vloer van 0.3 die een semantisch zwak item betrouwbaar boven een concurrent
# tilt die alleen op semantiek scoort (geverifieerd in test_hybrid_search.py met een
# gecontroleerde semantische afstand). Bewust GEEN Reciprocal Rank Fusion: RRF's
# 1/(k+rank)-curve verdunt het maximale lexicale signaal té veel om dat hard te
# garanderen; een genormaliseerde score-mix geeft een voorspelbare, testbare vloer.
_SEMANTIC_WEIGHT = 0.7
_LEXICAL_WEIGHT = 0.3

# Meertalig embedding-model i.p.v. chroma's default all-MiniLM (Engels-centrisch, zwak
# op NL → "waar gevestigd" matchte "Adres" niet). We draaien het via fastembed
# (onnxruntime, GEEN torch → lichte offline-bundle) en geven de vectoren expliciet aan
# chroma mee — zo blijven we los van chroma's embedding-function-persistentie.
_embedder = None


def _fastembed_cache_dir() -> Optional[str]:
    # In de gebundelde app zit het embedding-model offline mee in de PyInstaller-
    # resources (zie build_sidecar.py); wijs fastembed daarheen en zet HF offline zodat
    # het nooit het netwerk probeert. In dev (None): fastembed gebruikt zijn eigen cache
    # en downloadt het model één keer.
    import sys
    base = getattr(sys, "_MEIPASS", None)
    if base:
        cache = os.path.join(base, "fastembed_models")
        if os.path.isdir(cache):
            os.environ.setdefault("HF_HUB_OFFLINE", "1")
            return cache
    return None


def _get_embedder():
    global _embedder
    if _embedder is None:
        from fastembed import TextEmbedding
        _embedder = TextEmbedding(
            model_name=settings.embed_model, cache_dir=_fastembed_cache_dir()
        )
    return _embedder


def _embed(texts: list[str]) -> list[list[float]]:
    # fastembed levert numpy-vectoren; chroma wil gewone lijsten.
    return [v.tolist() for v in _get_embedder().embed(list(texts))]


class Memory:
    def __init__(self):
        # Persistente ChromaDB-client; data wordt op schijf bewaard.
        # Maak het pad aan als het nog niet bestaat (COEUS_DATA_DIR kan naar een
        # nog-niet-bestaande OS app-data dir wijzen op een verse installatie).
        os.makedirs(settings.chroma_db_path, exist_ok=True)
        self.client = chromadb.PersistentClient(path=settings.chroma_db_path)
        self.collection = self.client.get_or_create_collection(
            name=f"coeus_{settings.coeus_tenant}",
            metadata={"embed_model": settings.embed_model},
        )
        self._migrate_if_model_changed()

    def _migrate_if_model_changed(self) -> None:
        # De app auto-update; wisselt het embedding-model (of komt een install van vóór
        # deze versie), dan zijn de opgeslagen vectoren incompatibel → herbereken ze
        # eenmalig uit de bewaarde documenten. Eén keer bij opstart, daarna nooit meer.
        stored = (self.collection.metadata or {}).get("embed_model")
        if stored == settings.embed_model:
            return
        data = self.collection.get(include=["documents", "metadatas"])
        ids = data.get("ids") or []
        name = self.collection.name
        self.client.delete_collection(name)
        self.collection = self.client.create_collection(
            name=name, metadata={"embed_model": settings.embed_model}
        )
        if ids:
            docs = data["documents"]
            self.collection.add(
                ids=ids, documents=docs, metadatas=data["metadatas"],
                embeddings=_embed(docs),
            )

    def add(self, title: str, category: str, content: str,
            source: str = "manual", source_detail: Optional[str] = None) -> KennisItem:
        # Voeg een nieuw kennis-item toe aan de kennisbank
        item_id = str(uuid.uuid4())
        now = datetime.now()

        self.collection.add(
            ids=[item_id],
            documents=[content],
            embeddings=_embed([content]),
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
        # Hybride zoeken: semantisch (fastembed/chroma) + lexicaal (exacte term/
        # cijferreeks), gefuseerd tot één ranking. Lege/blanco query levert niets op
        # (geen zinvolle semantische embedding, geen lexicale termen).
        if not query or not query.strip():
            return []

        where_filter = {"category": category} if category else None
        total = self.collection.count()
        if total == 0:
            return []

        # Vraag de volledige (gefilterde) set op — n_results is een max, geen exact
        # aantal, dus dit is veilig ook als category het resultaat verkleint. Zo
        # krijgt elk item een semantische rank/score, ook items die buiten een kleine
        # top-N ANN-afkap zouden vallen maar wél een exacte lexicale match hebben.
        results = self.collection.query(
            query_embeddings=_embed([query]), n_results=total, where=where_filter
        )

        ids = results['ids'][0] if results['ids'] else []
        if not ids:
            return []

        distances = results['distances'][0]
        documents = results['documents'][0]
        metadatas = results['metadatas'][0]

        query_digits = re.sub(r"\D", "", query)
        content_tokens = _content_tokens(query)

        scored = []
        for i, item_id in enumerate(ids):
            meta = metadatas[i]
            content = documents[i] or ""
            text = f"{meta.get('title', '')} {content}"
            semantic_score = 1.0 / (1.0 + float(distances[i]))
            lexical_score = _lexical_score(query, content_tokens, query_digits, text)
            fused = _SEMANTIC_WEIGHT * semantic_score + _LEXICAL_WEIGHT * lexical_score
            scored.append((fused, item_id, meta, content))

        # Stabiele sort: bij gelijke fused score wint de oorspronkelijke (semantische)
        # volgorde van chroma, zodat puur-semantische queries (lexical_score=0 overal)
        # exact het bestaande gedrag behouden.
        scored.sort(key=lambda s: s[0], reverse=True)

        items = []
        for _, item_id, meta, content in scored[:limit]:
            items.append(KennisItem(
                id=item_id,
                title=meta['title'],
                category=meta['category'],
                content=content,
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
        # Werk een item bij; bestaande waarden blijven behouden indien niet meegegeven.
        # Gebruik ChromaDB in-place update zodat het id stabiel blijft (geen delete-then-add).
        existing = self.get(item_id)
        if not existing:
            return None

        # Expliciete None-check: lege string is een geldige intentionele waarde
        new_title = title if title is not None else existing.title
        new_content = content if content is not None else existing.content
        new_category = category if category is not None else existing.category

        self.collection.update(
            ids=[item_id],
            documents=[new_content],
            metadatas=[{
                "title": new_title,
                "category": new_category,
                "source": existing.source,
                "source_detail": existing.source_detail or "",
                "created_at": existing.created_at.isoformat()
            }]
        )

        return KennisItem(
            id=item_id, title=new_title, category=new_category,
            content=new_content, source=existing.source,
            source_detail=existing.source_detail,
            created_at=existing.created_at
        )

    def delete(self, item_id: str):
        # Verwijder een item uit de kennisbank
        self.collection.delete(ids=[item_id])

    def build_graph(self, neighbors: int = 4) -> dict:
        # Bouw een kennis-graph: nodes = items, edges = semantische gelijkenis.
        # Hergebruikt de bestaande embeddings (geen nieuwe AI-call). Voor elk item
        # zoeken we de dichtstbijzijnde buren via ChromaDB en leggen we undirected,
        # gededupliceerde edges met een gewicht afgeleid van de afstand.
        result = self.collection.get(include=["metadatas", "embeddings"])
        ids = result["ids"]
        if not ids:
            return {"nodes": [], "edges": []}

        nodes = [
            {
                "id": ids[i],
                "title": result["metadatas"][i]["title"],
                "category": result["metadatas"][i]["category"],
            }
            for i in range(len(ids))
        ]

        embeddings = result["embeddings"]
        n_query = min(neighbors + 1, len(ids))  # +1 want het item zelf zit in de uitslag
        edge_weight: dict[tuple[str, str], float] = {}

        for i, item_id in enumerate(ids):
            res = self.collection.query(
                query_embeddings=[list(embeddings[i])],
                n_results=n_query,
            )
            for nbr_id, dist in zip(res["ids"][0], res["distances"][0]):
                if nbr_id == item_id:
                    continue
                key = tuple(sorted((item_id, nbr_id)))
                weight = 1.0 / (1.0 + float(dist))  # kleinere afstand = sterkere edge
                if key not in edge_weight or weight > edge_weight[key]:
                    edge_weight[key] = weight

        edges = [
            {"source": a, "target": b, "weight": round(w, 4)}
            for (a, b), w in edge_weight.items()
        ]
        return {"nodes": nodes, "edges": edges}

    def find_duplicates(self, threshold: float = 0.05) -> list[dict]:
        # Vind near-duplicate kennis-items via de bestaande embeddings (key-free,
        # geen LLM). Voor elk item zoeken we de dichtstbijzijnde buren — net als
        # build_graph — en behandelen we een paar als duplicaat zodra de embedding-
        # AFSTAND < threshold (zeer gelijkend). Transitief gegroepeerd met union-find,
        # zodat A~B en B~C één cluster {A,B,C} vormen.
        #
        # Read-only: deze methode verwijdert niets. Per cluster van ≥2 kiezen we
        # ÉÉN keeper (langste content, gelijkspel → oudste created_at) en geven de
        # rest terug als verwijderbaar.
        result = self.collection.get(include=["metadatas", "documents", "embeddings"])
        ids = result["ids"]
        if not ids:
            return []

        index = {item_id: i for i, item_id in enumerate(ids)}

        # Union-find over de item-ids.
        parent = {item_id: item_id for item_id in ids}

        def find(x: str) -> str:
            root = x
            while parent[root] != root:
                root = parent[root]
            # Padcompressie
            while parent[x] != root:
                parent[x], x = root, parent[x]
            return root

        def union(a: str, b: str):
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[ra] = rb

        embeddings = result["embeddings"]
        # +1 want het item zelf zit altijd in zijn eigen buren-uitslag.
        n_query = min(2, len(ids)) + 1
        for i, item_id in enumerate(ids):
            res = self.collection.query(
                query_embeddings=[list(embeddings[i])],
                n_results=min(n_query, len(ids)),
            )
            for nbr_id, dist in zip(res["ids"][0], res["distances"][0]):
                if nbr_id == item_id:
                    continue
                if float(dist) < threshold:
                    union(item_id, nbr_id)

        # Groepeer items per union-find-root.
        groups: dict[str, list[str]] = {}
        for item_id in ids:
            groups.setdefault(find(item_id), []).append(item_id)

        clusters = []
        for member_ids in groups.values():
            if len(member_ids) < 2:
                continue
            metas = [result["metadatas"][index[m]] for m in member_ids]
            docs = [result["documents"][index[m]] for m in member_ids]

            # Keeper: langste content, gelijkspel → oudste created_at.
            def sort_key(m: str):
                meta = result["metadatas"][index[m]]
                doc = result["documents"][index[m]] or ""
                return (-len(doc), meta.get("created_at", ""))

            ordered = sorted(member_ids, key=sort_key)
            keeper = ordered[0]
            removable = ordered[1:]

            def brief(m: str) -> dict:
                meta = result["metadatas"][index[m]]
                return {"id": m, "title": meta["title"]}

            clusters.append({
                "keep": brief(keeper),
                "remove": [brief(m) for m in removable],
            })

        return clusters

    def dedupe(self, threshold: float = 0.05) -> int:
        # Vind near-duplicates en verwijder elke "removable" uit elke cluster.
        # De keeper per cluster blijft staan. Geeft het aantal verwijderde items terug.
        clusters = self.find_duplicates(threshold)
        removed = 0
        for cluster in clusters:
            for item in cluster["remove"]:
                self.delete(item["id"])
                removed += 1
        return removed

    def get_by_source_detail(self, source_detail: str) -> list[KennisItem]:
        # Alle items die van één bron-detail afkomstig zijn (bv. een relatief
        # bestandspad uit de map-connector). Gebruikt bij een gewijzigd/verwijderd
        # bestand om eerst de oude items van dat pad op te ruimen.
        result = self.collection.get(where={"source_detail": source_detail})
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

    def count_by_source(self, source: str) -> int:
        # Aantal items met een gegeven source (bv. "connector"), zonder de
        # volledige documenten/embeddings op te halen.
        result = self.collection.get(where={"source": source}, include=[])
        return len(result['ids'] or [])

    def delete_by_source(self, source: str) -> int:
        # Verwijder alle items met een gegeven source. Geeft het aantal terug.
        result = self.collection.get(where={"source": source}, include=[])
        ids = result['ids'] or []
        if ids:
            self.collection.delete(ids=ids)
        return len(ids)

    def get_categories(self) -> list[dict]:
        # Geef alle categorieën terug met het aantal items per categorie
        result = self.collection.get()
        cats = {}
        if result['metadatas']:
            for meta in result['metadatas']:
                cat = meta['category']
                cats[cat] = cats.get(cat, 0) + 1
        return [{"name": k, "count": v} for k, v in cats.items()]
