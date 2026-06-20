#!/usr/bin/env bash
# Builds the Coeus brein as a standalone sidecar binary (PyInstaller), bundling
# the all-MiniLM ONNX embedding model so semantic search works fully offline.
# Output: dist/coeus-brein/  (launched by the Tauri app on a loopback port).
set -euo pipefail
cd "$(dirname "$0")"

MODEL_DIR="${HOME}/.cache/chroma/onnx_models/all-MiniLM-L6-v2"

# The bundle ships the embedding model; make sure it's cached on this build
# machine first (ChromaDB downloads it once on first use). On CI, warm it before
# building. Locally it's already there after the first run.
if [ ! -d "$MODEL_DIR" ]; then
  echo "Embedding model not cached — warming it up once via ChromaDB..."
  venv/bin/python - <<'PY'
import chromadb
c = chromadb.Client()
col = c.get_or_create_collection("warmup")
col.add(ids=["x"], documents=["warmup"])  # triggers the one-time model download
PY
fi

venv/bin/pyinstaller --noconfirm --name coeus-brein \
  --collect-all chromadb \
  --collect-all onnxruntime \
  --collect-all tokenizers \
  --add-data "${MODEL_DIR}:onnx_models/all-MiniLM-L6-v2" \
  --hidden-import uvicorn.logging \
  --hidden-import uvicorn.loops.auto \
  --hidden-import uvicorn.loops.asyncio \
  --hidden-import uvicorn.protocols.http.auto \
  --hidden-import uvicorn.protocols.http.h11_impl \
  --hidden-import uvicorn.protocols.websockets.auto \
  --hidden-import uvicorn.lifespan.on \
  --hidden-import main \
  run_server.py
