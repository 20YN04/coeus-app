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

    @property
    def llm_api_key(self) -> str:
        # DeepSeek-key heeft voorrang; val terug op OpenAI als die gezet is
        return self.deepseek_api_key or self.openai_api_key

settings = Settings()
