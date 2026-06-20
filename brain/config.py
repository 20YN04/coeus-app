import os
from pydantic_settings import BaseSettings

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
    def llm_api_key(self) -> str:
        # DeepSeek-key heeft voorrang; val terug op OpenAI als die gezet is
        return self.deepseek_api_key or self.openai_api_key

settings = Settings()
