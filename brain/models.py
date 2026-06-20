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
