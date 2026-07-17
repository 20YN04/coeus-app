"""Validatie van de seed-kennisbanken (industrie-sjablonen) in seed/.

Elke seed is een JSON-array van items met title/category/content/source/
source_detail. RAG haalt items los op, dus elk item moet zelfstandig geldig
zijn: verplichte velden aanwezig, non-empty category, unieke titles per seed.
"""

import json
from pathlib import Path

import pytest

SEED_DIR = Path(__file__).resolve().parent.parent / "seed"
SEED_FILES = sorted(SEED_DIR.glob("*.json"))
REQUIRED_FIELDS = ("title", "category", "content", "source", "source_detail")


def _load(path: Path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def test_seed_files_present():
    names = {p.name for p in SEED_FILES}
    assert {"default.json", "horeca.json", "kapper.json"} <= names


@pytest.mark.parametrize("seed_path", SEED_FILES, ids=lambda p: p.name)
def test_seed_is_nonempty_array(seed_path):
    data = _load(seed_path)
    assert isinstance(data, list), f"{seed_path.name} moet een JSON-array zijn"
    assert len(data) > 0, f"{seed_path.name} mag niet leeg zijn"


@pytest.mark.parametrize("seed_path", SEED_FILES, ids=lambda p: p.name)
def test_items_have_required_fields(seed_path):
    for i, item in enumerate(_load(seed_path)):
        assert isinstance(item, dict), f"item {i} is geen object"
        for field in REQUIRED_FIELDS:
            assert field in item, f"item {i} ({item.get('title', '?')}) mist '{field}'"
            assert isinstance(item[field], str), (
                f"item {i} ({item.get('title', '?')}): '{field}' moet een string zijn"
            )


@pytest.mark.parametrize("seed_path", SEED_FILES, ids=lambda p: p.name)
def test_title_category_content_nonempty(seed_path):
    for i, item in enumerate(_load(seed_path)):
        for field in ("title", "category", "content"):
            assert item[field].strip(), (
                f"item {i} ({item.get('title', '?')}): '{field}' is leeg"
            )


@pytest.mark.parametrize("seed_path", SEED_FILES, ids=lambda p: p.name)
def test_no_duplicate_titles(seed_path):
    titles = [item["title"] for item in _load(seed_path)]
    dupes = {t for t in titles if titles.count(t) > 1}
    assert not dupes, f"dubbele titles in {seed_path.name}: {dupes}"


@pytest.mark.parametrize(
    ("seed_name", "expected_detail"),
    [("horeca.json", "horeca-template"), ("kapper.json", "kapper-template")],
)
def test_industry_seed_source_fields(seed_name, expected_detail):
    for item in _load(SEED_DIR / seed_name):
        assert item["source"] == "seed", f"{item['title']}: source moet 'seed' zijn"
        assert item["source_detail"] == expected_detail, (
            f"{item['title']}: source_detail moet '{expected_detail}' zijn"
        )
