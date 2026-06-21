import os
from typing import Optional
from pydantic_settings import BaseSettings

# Naam van het lokale key-bestand in de data-map. Plain text, één regel: de LLM-key.
# Wordt door POST /config/llm-key geschreven en hier (per call) heringelezen, zodat
# een net ingestelde key direct werkt zonder rebuild/herstart van de sidecar.
LLM_KEY_FILENAME = ".llm-key"


class Settings(BaseSettings):
    openai_api_key: str = ""
    deepseek_api_key: str = ""
    coeus_tenant: str = "default"
    chroma_db_path: str = "./data/chroma"

    # LLM-provider: DeepSeek is OpenAI-compatibel, dus alleen base_url + model verschillen
    llm_base_url: str = "https://api.deepseek.com"
    llm_model: str = "deepseek-chat"

    # extra="ignore": een onbekende env-var op de machine van een klant mag de
    # gedistribueerde app nooit laten crashen (was de oorzaak van een opstartcrash).
    model_config = {"env_file": ".env", "extra": "ignore"}

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # De geïnstalleerde app kan niet schrijven in de read-only .app-bundle, dus
        # de Tauri-shell geeft een schrijfbare OS app-data dir door via COEUS_DATA_DIR.
        # Als die gezet is, persist ChromaDB onder <COEUS_DATA_DIR>/chroma; anders
        # de dev-default ./data/chroma.
        data_dir = os.environ.get("COEUS_DATA_DIR", "").strip()
        if data_dir:
            self.chroma_db_path = os.path.join(data_dir, "chroma")

    @property
    def data_dir(self) -> str:
        # De schrijfbare data-map: COEUS_DATA_DIR indien gezet, anders de ouder van
        # chroma_db_path (dev-default ./data). Hier leeft o.a. het lokale key-bestand.
        env_dir = os.environ.get("COEUS_DATA_DIR", "").strip()
        if env_dir:
            return env_dir
        return os.path.dirname(os.path.abspath(self.chroma_db_path))

    @property
    def llm_key_path(self) -> str:
        # Absoluut pad naar het lokale key-bestand in de data-map.
        return os.path.join(self.data_dir, LLM_KEY_FILENAME)

    def _file_key(self) -> str:
        # Lees de key uit het lokale bestand (indien aanwezig). Faalt nooit hard:
        # een onleesbaar bestand levert gewoon een lege key op (→ offline modus).
        path = self.llm_key_path
        try:
            with open(path, "r", encoding="utf-8") as f:
                return f.read().strip()
        except OSError:
            return ""

    @property
    def llm_api_key(self) -> str:
        # Volgorde: env DEEPSEEK_API_KEY → env OPENAI_API_KEY → lokaal key-bestand.
        # Env wint zodat een dev/CI-omgeving expliciet stuurt; het bestand is het
        # runtime-kanaal voor de gedistribueerde klant-app (gezet via /config/llm-key).
        # Per call ingelezen: een net geschreven bestand werkt direct, geen herstart.
        return self.deepseek_api_key or self.openai_api_key or self._file_key()

    @property
    def llm_provider(self) -> Optional[str]:
        # Welke provider wordt er gebruikt, puur informatief voor /config/llm-status.
        # Leid af uit de base_url; geen key → None. Nooit de key zelf teruggeven.
        if not self.llm_api_key:
            return None
        return "openai" if "openai.com" in self.llm_base_url else "deepseek"


settings = Settings()
