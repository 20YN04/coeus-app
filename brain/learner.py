from openai import OpenAI
import openai
from .config import settings
from .models import KennisItem
import json
import re

class Learner:
    def __init__(self):
        # OpenAI-client voor kennisextractie en het beantwoorden van vragen
        self.client = OpenAI(api_key=settings.openai_api_key)

    def extract_knowledge(self, text: str,
                          category_hint: str = None) -> list[dict]:
        # Laat GPT gestructureerde kennis uit vrije tekst halen
        prompt = f"""Je bent een AI die gestructureerde kennis extraheert uit tekst over een bedrijf.

        Analyseer de volgende tekst en haal alle feitelijke kennis eruit.
        Geef ALLEEN een JSON array terug met objecten in dit formaat:
        [{{"title": "korte titel", "category": "categorie", "content": "volledige beschrijving"}}]

        Categorieën die je kunt gebruiken: product, dienst, klant, prijs, proces, openingstijd, contact, regel

        Tekst om uit te leren:
        {text}

        JSON array:"""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=2000
            )
        except openai.OpenAIError as e:
            # Gooi een generieke fout — nooit de ruwe OpenAI-fout (met API-key) doorsturen
            raise RuntimeError(f"OpenAI-aanroep mislukt: {type(e).__name__}") from None

        raw = response.choices[0].message.content.strip()
        # Verwijder markdown code-fences met regex (ook varianten als ```json\n)
        raw = re.sub(r"^```[a-z]*\n", "", raw)
        raw = raw.rstrip("`").strip()

        try:
            items = json.loads(raw)
            return items
        except json.JSONDecodeError as e:
            # Sla geen getrunceerde blob op — gooi zodat /learn een 422/500 teruggeeft
            raise ValueError(f"GPT gaf geen geldige JSON terug: {e}") from None

    def answer_question(self, question: str,
                        context: list[KennisItem]) -> str:
        # Beantwoord een vraag op basis van de meegegeven kennis-items
        # Bouw context-sectie
        context_text = ""
        for item in context:
            context_text += f"--- {item.title} ({item.category}) ---\n{item.content}\n\n"

        if not context_text.strip():
            return "Ik heb nog geen kennis over dit onderwerp. Je kunt informatie toevoegen aan de kennisbank, dan kan ik je vraag de volgende keer wél beantwoorden."

        prompt = f"""Je bent Memora, het AI-brein van een bedrijf. Je beantwoordt vragen op basis van wat je over het bedrijf weet.

        BELANGRIJK:
        - Gebruik ALLEEN informatie uit de context hieronder
        - Als het antwoord niet in de context staat, zeg dan: "Daar weet ik nog niets over. Je kunt dit toevoegen aan de kennisbank, dan help ik je de volgende keer wél verder."
        - Wees vriendelijk, professioneel, en beknopt
        - Spreek in het Nederlands
        - Noem de bron (titel van het kennis-item) als je iets citeert

        Context (dit is alles wat ik weet over dit bedrijf):
        {context_text}

        Vraag: {question}

        Antwoord:"""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.5,
                max_tokens=1000
            )
        except openai.OpenAIError as e:
            raise RuntimeError(f"OpenAI-aanroep mislukt: {type(e).__name__}") from None

        return response.choices[0].message.content.strip()
