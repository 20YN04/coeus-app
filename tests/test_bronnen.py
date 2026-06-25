"""Unit-test voor de bronvermelding-filter van /ask (zie main._cited_bronnen)."""
from types import SimpleNamespace

from main import _cited_bronnen


def _item(title):
    return SimpleNamespace(id=title, title=title, category="test")


def test_only_cited_sources_returned():
    context = [_item("Openingsuren"), _item("Parkeren"), _item("Bandenwissel")]
    answer = "Wij zijn open volgens 'Openingsuren' van 9 tot 17 uur."
    titles = [b.title for b in _cited_bronnen(answer, context)]
    assert titles == ["Openingsuren"]


def test_fallback_to_top3_when_nothing_cited():
    context = [_item(f"Item {i}") for i in range(6)]
    answer = "Een antwoord dat geen enkele titel letterlijk noemt."
    assert len(_cited_bronnen(answer, context)) == 3


def test_dedupe_on_title():
    # crawl maakt vaak meerdere items met dezelfde titel
    context = [_item("Contactgegevens"), _item("Contactgegevens"), _item("Contactgegevens")]
    answer = "Zie 'Contactgegevens' voor het adres."
    assert len(_cited_bronnen(answer, context)) == 1
