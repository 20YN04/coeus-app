"""Standalone entrypoint for the Coeus brein sidecar.

Bundled by PyInstaller and launched by the Tauri app. Serves the FastAPI
brein on a local loopback port (COEUS_PORT, default 8765). Search / graph /
categories / CRUD run fully offline via ChromaDB's local embedding model;
/learn and /ask are online-optional.
"""
import os

import uvicorn

from main import app

if __name__ == "__main__":
    port = int(os.environ.get("COEUS_PORT", "8765"))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
