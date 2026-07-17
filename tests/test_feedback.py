"""Tests voor de antwoord-feedback-loop (duim omhoog/omlaag + reden)."""
import os

from brain.config import settings
from brain.feedback import FEEDBACK_FILENAME


def test_feedback_up_and_down_roundtrip(client):
    r_up = client.post("/feedback", json={
        "question": "Wat zijn de openingsuren?",
        "answer_excerpt": "De garage is open van 8u tot 18u, maandag tot vrijdag.",
        "rating": "up",
    })
    assert r_up.status_code == 200
    up_body = r_up.json()
    assert up_body["rating"] == "up"
    assert "id" in up_body and "timestamp" in up_body

    r_down = client.post("/feedback", json={
        "question": "Wat kost een bandenwissel?",
        "answer_excerpt": "Een seizoenswissel kost 60 euro.",
        "rating": "down",
        "reason": "verouderd",
        "source_ids": ["abc123"],
    })
    assert r_down.status_code == 200
    down_body = r_down.json()
    assert down_body["rating"] == "down"
    assert down_body["reason"] == "verouderd"
    assert down_body["source_ids"] == ["abc123"]

    items = client.get("/feedback", params={"limit": 100}).json()
    ids = [i["id"] for i in items]
    assert down_body["id"] in ids
    assert up_body["id"] in ids
    # nieuwste eerst
    assert ids.index(down_body["id"]) < ids.index(up_body["id"])


def test_feedback_validation(client):
    r = client.post("/feedback", json={
        "question": "x", "answer_excerpt": "y", "rating": "sideways",
    })
    assert r.status_code == 422


def test_feedback_survives_corrupt_line(client):
    client.post("/feedback", json={
        "question": "Corrupt-test vraag",
        "answer_excerpt": "Corrupt-test antwoord",
        "rating": "up",
    })

    path = os.path.join(settings.data_dir, FEEDBACK_FILENAME)
    with open(path, "a", encoding="utf-8") as f:
        f.write("dit is geen geldige json\n")

    r = client.get("/feedback")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
