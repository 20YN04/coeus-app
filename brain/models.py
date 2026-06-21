from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class KennisItem(BaseModel):
    id: str
    title: str
    category: str
    content: str
    source: str = "manual"
    source_detail: Optional[str] = None
    created_at: datetime
    metadata: dict = {}

class CreateKennisRequest(BaseModel):
    # Inkomend model voor POST /kennis — clients mogen geen id of created_at meegeven
    title: str
    category: str
    content: str
    source: str = "manual"
    source_detail: Optional[str] = None

class UpdateKennisRequest(BaseModel):
    # Inkomend model voor PUT /kennis/{id} — alleen bewerkbare velden, allemaal optioneel
    title: Optional[str] = None
    category: Optional[str] = None
    content: Optional[str] = None

class LearnRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)
    category: Optional[str] = None

class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)

class IngestTextRequest(BaseModel):
    # Onboarding-motor: vrije tekst in stukken hakken en als kennis-items opslaan
    # (key-free, geen LLM). source_url is optioneel — herkomst van de tekst.
    text: str = Field(..., min_length=1, max_length=200000)
    category: Optional[str] = None
    source_url: Optional[str] = None

class IngestUrlRequest(BaseModel):
    # Onboarding-motor: een webpagina server-side ophalen, leesbare tekst eruit
    # halen en in stukken hakken (key-free, geen LLM).
    url: str = Field(..., min_length=1, max_length=2000)
    category: Optional[str] = None

class CleanupApplyRequest(BaseModel):
    # Auto-opschonen: verwijder near-duplicate kennis-items via de bestaande
    # embeddings (key-free, geen LLM). threshold is de embedding-afstand waaronder
    # twee items als duplicaat gelden — lager = strenger. Optioneel: het brein
    # gebruikt zijn eigen sensible default als die niet meegegeven wordt.
    threshold: Optional[float] = Field(default=None, ge=0.0, le=2.0)

class LlmKeyRequest(BaseModel):
    # POST /config/llm-key — de klant (of Ynarchive bij oplevering) zet de LLM-key.
    # Wordt naar een lokaal bestand in de data-map geschreven, nooit in de JS-bundle.
    key: str = Field(..., min_length=1, max_length=500)


class LlmStatus(BaseModel):
    # GET /config/llm-status — geeft NOOIT de key zelf terug, alleen of er één is.
    configured: bool
    provider: Optional[str] = None
    model: Optional[str] = None


class IngestCrawlRequest(BaseModel):
    # Onboarding-motor: meerdere pagina's op dezelfde host crawlen vanaf url (BFS),
    # leesbare tekst per pagina in stukken hakken (key-free, geen LLM). max_pages
    # is gecapt zodat een crawl bounded blijft en niet eindeloos doorloopt.
    url: str = Field(..., min_length=1, max_length=2000)
    max_pages: int = Field(default=15, ge=1, le=50)
    category: Optional[str] = None
