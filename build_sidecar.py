#!/usr/bin/env python3
"""Cross-platform PyInstaller build for the Coeus brein sidecar (used by CI on
macOS + Windows; locally you can still use build_sidecar.sh).

Warms the multilingual ONNX embedding model (via fastembed, geen torch) into a
build-local cache, then bundles a onedir binary that ships the model + seed so
semantic search / graph / CRUD en first-run seeding volledig offline werken.
Output: dist/coeus-brein/.
"""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
# Build-lokale cache waarin we het fastembed-model downloaden om het mee te bundelen.
# In de gebundelde app komt dit terecht op <_MEIPASS>/fastembed_models (zie memory.py).
FASTEMBED_CACHE = ROOT / "build" / "fastembed_models"


def warm_model() -> None:
    """Download het meertalige embedding-model één keer naar de build-cache, zodat we
    het in de bundel kunnen meenemen (de app draait dan offline)."""
    sys.path.insert(0, str(ROOT))
    from brain.config import settings
    from fastembed import TextEmbedding

    FASTEMBED_CACHE.mkdir(parents=True, exist_ok=True)
    print(f"Warming embedding model {settings.embed_model} into {FASTEMBED_CACHE} ...")
    TextEmbedding(model_name=settings.embed_model, cache_dir=str(FASTEMBED_CACHE))


def main() -> None:
    warm_model()
    if not any(FASTEMBED_CACHE.glob("models--*")):
        sys.exit(f"embedding model still missing in {FASTEMBED_CACHE} after warmup")

    # PyInstaller --add-data uses ';' on Windows, ':' elsewhere.
    sep = ";" if os.name == "nt" else ":"

    cmd = [
        sys.executable, "-m", "PyInstaller", "--noconfirm", "--name", "coeus-brein",
        "--collect-all", "chromadb",
        "--collect-all", "onnxruntime",
        "--collect-all", "tokenizers",
        "--collect-all", "fastembed",
        f"--add-data={FASTEMBED_CACHE}{sep}fastembed_models",
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
