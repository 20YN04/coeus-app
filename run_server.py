"""Standalone entrypoint for the Coeus brein sidecar.

Bundled by PyInstaller and launched by the Tauri app. Serves the FastAPI brein
on a local loopback port (COEUS_PORT, default 8765). Search / graph / categories
/ CRUD run fully offline via ChromaDB's local embedding model; /learn and /ask
are online-optional.
"""
import os
import shutil
import sys
from pathlib import Path


def ensure_embedding_model() -> None:
    """Seed ChromaDB's model cache from the model bundled in the frozen build, so
    the first semantic search works offline — no download on a fresh machine.

    Only runs in a PyInstaller build (sys.frozen). The model ships under
    _MEIPASS/onnx_models/all-MiniLM-L6-v2 and is copied into the per-user cache
    ChromaDB looks in, once, if that cache is empty.
    """
    if not getattr(sys, "frozen", False):
        return
    bundled = Path(sys._MEIPASS) / "onnx_models" / "all-MiniLM-L6-v2"
    if not bundled.exists():
        return
    cache = Path.home() / ".cache" / "chroma" / "onnx_models" / "all-MiniLM-L6-v2"
    if cache.exists():
        return
    cache.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(bundled, cache)


if __name__ == "__main__":
    # Seed the model before importing the app, so ChromaDB never reaches for the network.
    ensure_embedding_model()

    import uvicorn
    from main import app

    port = int(os.environ.get("COEUS_PORT", "8765"))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
