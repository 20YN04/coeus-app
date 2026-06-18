from pydantic import BaseModel
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

class LearnRequest(BaseModel):
    text: str
    category: Optional[str] = None

class AskRequest(BaseModel):
    question: str
