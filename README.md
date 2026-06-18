# Memora — AI Brein Core

The Python core of **Memora**: an AI brain that learns a business's knowledge and answers questions about it. It stores knowledge in a ChromaDB vector store and uses GPT (via the OpenAI API) to extract structured knowledge from free text and to answer questions grounded in that knowledge base.

Memora is a product of Ynarchive.

## Architecture

- `brain/config.py` — settings (loaded from `.env` via pydantic-settings).
- `brain/models.py` — pydantic models (`KennisItem`, `LearnRequest`, `AskRequest`).
- `brain/memory.py` — `Memory`: the ChromaDB-backed knowledge base (add, search, get, update, delete, categories).
- `brain/learner.py` — `Learner`: GPT-powered knowledge extraction and Q&A.
- `main.py` — the FastAPI app exposing the HTTP API. Lives at the repo root because it imports the `brain` package.

## Installation

Requires **Python 3.12** (the type annotations use `X | None`, which crashes on 3.9).

```bash
cd ~/Projects/memora-app

# create the virtual environment with python3.12
python3.12 -m venv venv
source venv/bin/activate

# install dependencies
pip install -r requirements.txt
```

### Configuration

Copy the example env file and fill in your OpenAI key:

```bash
cp .env.example .env
```

`.env`:

```
OPENAI_API_KEY=sk-...        # required for /learn and /ask
MEMORA_TENANT=default        # collection namespace
```

`OPENAI_API_KEY` is required: the `Learner` (used by `/learn` and `/ask`) calls the OpenAI API. The knowledge-base endpoints (`/kennis*`, `/categories`) work without a real key.

The first call to `Memory.add()` downloads the default embedding model (`all-MiniLM-L6-v2`, ~80MB) from the internet. ChromaDB data is persisted under `data/chroma/` (gitignored).

## Running

Run from the repo root so `from brain.memory import Memory` and `from main import app` resolve:

```bash
cd ~/Projects/memora-app
source venv/bin/activate
uvicorn main:app --reload
```

The API is then available at `http://127.0.0.1:8000`. Interactive docs at `http://127.0.0.1:8000/docs`.

## API endpoints

| Method | Path                  | Description                                              |
| ------ | --------------------- | -------------------------------------------------------- |
| GET    | `/`                   | Status check.                                            |
| GET    | `/kennis`             | List all knowledge items (optional `?category=`).        |
| GET    | `/kennis/search`      | Semantic search (`?q=`, optional `?category=`, `?limit=`).|
| GET    | `/kennis/{item_id}`   | Get one knowledge item by id.                            |
| POST   | `/kennis`             | Add a knowledge item manually.                           |
| PUT    | `/kennis/{item_id}`   | Update a knowledge item.                                 |
| DELETE | `/kennis/{item_id}`   | Delete a knowledge item.                                 |
| POST   | `/learn`              | Extract knowledge from free text with GPT and store it.  |
| POST   | `/ask`                | Answer a question grounded in the knowledge base.        |
| GET    | `/categories`         | List categories with item counts.                        |

## Example flow

Teach Memora something, then ask about it.

```bash
# 1. Learn from free text — GPT extracts structured knowledge
curl -X POST http://127.0.0.1:8000/learn \
  -H "Content-Type: application/json" \
  -d '{"text": "Onze webshop is open van maandag tot vrijdag van 9u tot 17u. We verkopen handgemaakte keramiek. Een grote vaas kost 45 euro."}'

# response: {"geleerd": 3, "items": [ ... ]}

# 2. Ask a question — answered using only the stored knowledge
curl -X POST http://127.0.0.1:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "Wat kost een grote vaas?"}'

# response: {"antwoord": "Een grote vaas kost 45 euro.", "bronnen": [ ... ]}
```

## Testing (no API calls)

The import tests below do not call the OpenAI API:

```bash
cd ~/Projects/memora-app
source venv/bin/activate
python -c "from brain.memory import Memory; from brain.learner import Learner; from main import app; print('Alle imports OK')"
```
