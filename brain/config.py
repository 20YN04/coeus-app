from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    openai_api_key: str
    coeus_tenant: str = "default"
    chroma_db_path: str = "./data/chroma"

    model_config = {"env_file": ".env"}

settings = Settings()
