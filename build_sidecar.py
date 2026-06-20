#!/usr/bin/env python3
"""Cross-platform PyInstaller build for the Coeus brein sidecar (used by CI on
macOS + Windows; locally you can still use build_sidecar.sh).

Warms the all-MiniLM ONNX embedding model into ChromaDB's per-user cache, then
bundles a onedir binary that ships the model + seed so semantic search / graph /
CRUD and first-run seeding work fully offline. Output: dist/coeus-brein/.
"""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MODEL = Path.home() / ".cache" / "chroma" / "onnx_models" / "all-MiniLM-L6-v2"


def warm_model() -> None:
    """ChromaDB downloads the embedding model once on first use — trigger that so
    the path exists before we bundle it."""
    if MODEL.exists():
        return
    print("Embedding model not cached — warming it up once via ChromaDB...")
    import chromadb

    client = chromadb.Client()
    col = client.get_or_create_collection("warmup")
    col.add(ids=["x"], documents=["warmup"])


def main() -> None:
    warm_model()
    if not MODEL.exists():
        sys.exit(f"embedding model still missing at {MODEL} after warmup")

    # PyInstaller --add-data uses ';' on Windows, ':' elsewhere.
    sep = ";" if os.name == "nt" else ":"

    cmd = [
        sys.executable, "-m", "PyInstaller", "--noconfirm", "--name", "coeus-brein",
        "--collect-all", "chromadb",
        "--collect-all", "onnxruntime",
        "--collect-all", "tokenizers",
        f"--add-data={MODEL}{sep}onnx_models/all-MiniLM-L6-v2",
        f"--add-data={ROOT / 'seed'}{sep}seed",
        "--hidden-import", "uvicorn.logging",
        "--hidden-import", "uvicorn.loops.auto",
        "--hidden-import", "uvicorn.loops.asyncio",
        "--hidden-import", "uvicorn.protocols.http.auto",
        "--hidden-import", "uvicorn.protocols.http.h11_impl",
        "--hidden-import", "uvicorn.protocols.websockets.auto",
        "--hidden-import", "uvicorn.lifespan.on",
        "--hidden-import", "main",
        str(ROOT / "run_server.py"),
    ]
    print("Running:", " ".join(cmd))
    subprocess.run(cmd, check=True, cwd=ROOT)
    print("Built dist/coeus-brein/")


if __name__ == "__main__":
    main()
