"""Test-setup voor de brein. Belangrijk: de env wordt op module-niveau gezet, vóór
`main` (en dus brain.config / Memory) geïmporteerd wordt — die lezen de env bij import.
Een lege seed + verse temp-datamap + geen LLM-sleutel = een schone, offline brein.
"""
import os
import tempfile

os.environ["COEUS_DATA_DIR"] = tempfile.mkdtemp(prefix="coeus-test-")
os.environ["COEUS_SEED_FILE"] = os.path.join(os.path.dirname(__file__), "empty_seed.json")
# Lege string (niet pop): een env-var wint van het lokale .env-bestand in pydantic-
# settings, zodat de tests altijd sleutelloos draaien — ook met een .env op de machine.
os.environ["DEEPSEEK_API_KEY"] = ""
os.environ["OPENAI_API_KEY"] = ""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def client():
    from main import app

    # `with` triggert de lifespan (seed_if_empty op de lege seed → 0 items).
    with TestClient(app) as c:
        yield c
