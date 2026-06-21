from openai import OpenAI
import openai
from .config import settings
from .models import KennisItem
import json
import re

class Learner:
    def __init__(self):
        # De lokale app draait volledig offline (zoeken/graph/CRUD via ChromaDB,
        # géén key). Alleen /learn en /ask hebben een LLM nodig.
        #
        # De key kan op twee manieren binnenkomen: via env (.env, dev/CI) óf via een
        # lokaal key-bestand dat Ynarchive bij oplevering schrijft, en dat de klant
        # zelf kan (her)zetten via POST /config/llm-key. Dat bestand kan dus ná het
        # opstarten van de sidecar veranderen. Daarom bouwen we de client niet één
        # keer in __init__, maar her-evalueren we de key per call en cachen we de
        # client op (key, base_url): zo werkt een net ingestelde key direct, zonder
        # herstart, en bouwen we niet bij elke request een nieuwe HTTP-client.
        self._client = None
        self._client_signature: tuple[str, str] | None = None

    def _get_client(self):
        # Lees de actuele key (env → lokaal bestand). Geen key → RuntimeError, die
        # /learn en /ask omzetten naar 502/503.
        api_key = settings.llm_api_key
        if not api_key:
            # Reset een eventueel eerder gebouwde client zodat een verwijderde key
            # (DELETE /config/llm-key) niet stiekem actief blijft.
            self._client = None
            self._client_signature = None
            raise RuntimeError("Geen LLM-key geconfigureerd (offline modus)")

        signature = (api_key, settings.llm_base_url)
        if self._client is None or self._client_signature != signature:
            self._client = OpenAI(api_key=api_key, base_url=settings.llm_base_url)
            self._client_signature = signature
        return self._client

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
            response = self._get_client().chat.completions.create(
                model=settings.llm_model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=2000
            )
        except openai.OpenAIError as e:
            # Gooi een generieke fout — nooit de ruwe OpenAI-fout (met API-key) doorsturen
            raise RuntimeError(f"OpenAI-aanroep mislukt: {type(e).__name__}") from None

        raw = response.choices[0].message.content
        # Strip voor de regex zodat een leading newline/spatie de ^-anchor niet saboteert
        raw = raw.strip()
        # Verwijder opening-fence (ook ```json, ```JSON, of alleen ```)
        raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
        # Verwijder sluitende fence en eventueel overblijvende witruimte
        raw = re.sub(r"\n?```$", "", raw)
        raw = raw.strip()

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

        prompt = f"""Je bent Coeus, het AI-brein van een bedrijf. Je beantwoordt vragen op basis van wat je over het bedrijf weet.

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
            response = self._get_client().chat.completions.create(
                model=settings.llm_model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.5,
                max_tokens=1000
            )
        except openai.OpenAIError as e:
            raise RuntimeError(f"OpenAI-aanroep mislukt: {type(e).__name__}") from None

        return response.choices[0].message.content.strip()
