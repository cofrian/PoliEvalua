"""Trabajador de transcripción para la plataforma UPV.

Uso directo (PC, Kaggle, Colab): ``python worker.py``. En un servidor con URL
pública, ``app.py`` lo envuelve en FastAPI para poder despertarlo con /wake.

Consulta la cola de la app, descarga el audio temporal, lo transcribe con
faster-whisper y devuelve el texto. No guarda nada en disco más allá del
archivo temporal de cada trabajo. Funciona igual en un Space gratuito de
Hugging Face, en una máquina de la UPV o en un PC con GPU.
"""

from __future__ import annotations

import logging
import os
import socket
import tempfile
import threading
import time

import requests
from faster_whisper import WhisperModel

APP_URL = os.environ["APP_URL"].rstrip("/")
WORKER_TOKEN = os.environ["WORKER_TOKEN"]
WORKER_ID = os.environ.get("WORKER_ID") or f"worker-{socket.gethostname()}"
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")
WHISPER_DEVICE = os.environ.get("WHISPER_DEVICE", "auto")
WHISPER_COMPUTE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
IDLE_MIN_SECONDS = 5
IDLE_MAX_SECONDS = int(os.environ.get("IDLE_MAX_SECONDS", "60"))
# Si se define, el trabajador termina tras ese tiempo sin trabajo (Kaggle
# arrancado automáticamente: no gasta horas de GPU esperando).
EXIT_AFTER_IDLE_SECONDS = int(os.environ.get("EXIT_AFTER_IDLE_SECONDS", "0"))
MAX_AUDIO_BYTES = 60 * 1024 * 1024

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("worker")

session = requests.Session()
session.headers["Authorization"] = f"Bearer {WORKER_TOKEN}"

wake_event = threading.Event()
state = {"model_ready": False, "busy": False, "processed": 0, "last_error": None}

def transcribe(model: WhisperModel, path: str, language: str | None, prompt: str | None) -> str:
    segments, _info = model.transcribe(
        path,
        language=language or None,
        # Pista de vocabulario (equipo, título, rúbrica) para los nombres propios.
        initial_prompt=prompt or None,
        vad_filter=True,
        beam_size=5,
    )
    return " ".join(segment.text.strip() for segment in segments).strip()


def report_failure(job_id: str, message: str, retryable: bool) -> None:
    try:
        session.post(
            f"{APP_URL}/api/worker/jobs/{job_id}/fail",
            json={"workerId": WORKER_ID, "error": message[:1000], "retryable": retryable},
            timeout=30,
        )
    except requests.RequestException as error:
        log.error("No se pudo informar del fallo: %s", error)


def process_job(model: WhisperModel, job: dict) -> None:
    job_id = job["jobId"]
    log.info("Trabajo %s (intento %s, %ss de audio)", job_id, job["attempt"], job["durationSeconds"])
    # Carpeta temporal (no NamedTemporaryFile) para que funcione también en Windows.
    with tempfile.TemporaryDirectory(prefix="transcriptor-") as folder:
        audio_path = os.path.join(folder, "audio")
        with requests.get(job["audioUrl"], stream=True, timeout=120) as response:
            response.raise_for_status()
            size = 0
            with open(audio_path, "wb") as audio_file:
                for chunk in response.iter_content(1024 * 256):
                    size += len(chunk)
                    if size > MAX_AUDIO_BYTES:
                        break
                    audio_file.write(chunk)
        if size > MAX_AUDIO_BYTES:
            report_failure(job_id, "El audio supera el tamaño permitido.", retryable=False)
            return

        started = time.monotonic()
        text = transcribe(model, audio_path, job.get("language"), job.get("prompt"))

    # Un segmento sin voz (pausa larga) es válido: se envía vacío.
    response = session.post(
        f"{APP_URL}/api/worker/jobs/{job_id}/complete",
        json={"workerId": WORKER_ID, "transcript": text},
        timeout=60,
    )
    if response.status_code == 409:
        log.warning("La reserva de %s caducó; otro trabajador lo tiene.", job_id)
        return
    response.raise_for_status()
    state["processed"] += 1
    log.info("Trabajo %s listo en %.0fs", job_id, time.monotonic() - started)


def loop() -> None:
    log.info("Cargando Whisper %s (%s, %s)…", WHISPER_MODEL, WHISPER_DEVICE, WHISPER_COMPUTE)
    model = WhisperModel(WHISPER_MODEL, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE)
    state["model_ready"] = True
    log.info("Modelo listo. Trabajador %s consultando %s", WORKER_ID, APP_URL)

    idle = IDLE_MIN_SECONDS
    last_job_at = time.monotonic()
    while True:
        job = None
        try:
            response = session.post(
                f"{APP_URL}/api/worker/claim", json={"workerId": WORKER_ID}, timeout=30
            )
            if response.status_code == 200:
                job = response.json()
            elif response.status_code != 204:
                log.warning("La cola respondió %s: %s", response.status_code, response.text[:200])
        except requests.RequestException as error:
            log.warning("Cola no disponible: %s", error)

        if not job:
            if EXIT_AFTER_IDLE_SECONDS and time.monotonic() - last_job_at > EXIT_AFTER_IDLE_SECONDS:
                log.info("Sin trabajo desde hace %ss: el trabajador termina.", EXIT_AFTER_IDLE_SECONDS)
                return
            # Sin trabajo: espera cada vez más (hasta IDLE_MAX_SECONDS) para no
            # gastar invocaciones gratuitas de Vercel, salvo que nos despierten.
            woken = wake_event.wait(idle)
            wake_event.clear()
            idle = IDLE_MIN_SECONDS if woken else min(idle * 2, IDLE_MAX_SECONDS)
            continue

        idle = IDLE_MIN_SECONDS
        state["busy"] = True
        last_job_at = time.monotonic()
        try:
            process_job(model, job)
            state["last_error"] = None
        except Exception as error:  # noqa: BLE001 - cualquier fallo se reintenta
            log.exception("Fallo en el trabajo %s", job.get("jobId"))
            state["last_error"] = str(error)[:300]
            report_failure(job["jobId"], f"Error del transcriptor: {error}", retryable=True)
        finally:
            state["busy"] = False
            last_job_at = time.monotonic()


if __name__ == "__main__":
    loop()
