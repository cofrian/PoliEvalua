"""Envoltorio HTTP del trabajador para servidores con URL pública.

Expone /health y /wake (la app lo llama al encolar). Sin URL pública basta con
``python worker.py``.
"""

import threading

from fastapi import FastAPI

from worker import WHISPER_MODEL, WORKER_ID, loop, state, wake_event

app = FastAPI(title="Transcriptor UPV")


@app.get("/")
@app.get("/health")
def health():
    return {"worker": WORKER_ID, "model": WHISPER_MODEL, **state}


@app.post("/wake")
def wake():
    """Despierta el trabajador para que consulte la cola al momento."""
    wake_event.set()
    return {"ok": True}


threading.Thread(target=loop, name="queue-loop", daemon=True).start()
