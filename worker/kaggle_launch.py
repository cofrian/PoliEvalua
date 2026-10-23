"""Prepara y lanza el transcriptor en Kaggle sin abrir el navegador.

Lo ejecuta .github/workflows/kaggle-worker.yml cuando hay trozos de audio
esperando al respaldo. Genera un notebook privado de tipo script con
worker.py dentro y lo sube con la CLI oficial (``kaggle kernels push``), que
lo ejecuta en una GPU gratuita. El trabajador termina solo cuando la cola se
vacía (EXIT_AFTER_IDLE_SECONDS), así no gasta horas de GPU.

Variables: KAGGLE_USERNAME, KAGGLE_API_TOKEN (lo usa la CLI), APP_URL,
WORKER_TOKEN y opcionalmente KAGGLE_KERNEL_SLUG.
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

here = Path(__file__).parent
username = os.environ["KAGGLE_USERNAME"]
slug = os.environ.get("KAGGLE_KERNEL_SLUG", "transcriptor-upv")
app_url = os.environ["APP_URL"].rstrip("/")
# El token va dentro del notebook porque la API no permite adjuntar secretos.
# El notebook es privado y el token solo sirve para recoger y devolver trozos
# de la cola de transcripción.
token = os.environ["WORKER_TOKEN"]

RUNNER = '''
import os, subprocess, sys

subprocess.check_call([sys.executable, "-m", "pip", "install", "-q",
    "faster-whisper==1.1.1", "requests", "nvidia-cudnn-cu12==9.*", "nvidia-cublas-cu12"])
open("worker.py", "w", encoding="utf-8").write(WORKER_SOURCE)

import nvidia.cublas.lib, nvidia.cudnn.lib

# Son paquetes de espacio de nombres: no tienen __file__, sí __path__.
libs = [list(nvidia.cublas.lib.__path__)[0], list(nvidia.cudnn.lib.__path__)[0]]
try:
    gpus = len(subprocess.check_output(["nvidia-smi", "-L"], text=True).strip().splitlines())
except Exception:
    gpus = 0

processes = []
for gpu in range(max(gpus, 1)):
    env = {
        **os.environ,
        "APP_URL": APP_URL,
        "WORKER_TOKEN": WORKER_TOKEN,
        "WORKER_ID": f"kaggle-auto-gpu{gpu}",
        "WHISPER_MODEL": "large-v3-turbo" if gpus else "small",
        "WHISPER_DEVICE": "cuda" if gpus else "cpu",
        "WHISPER_COMPUTE_TYPE": "auto" if gpus else "int8",
        "CUDA_VISIBLE_DEVICES": str(gpu),
        "IDLE_MAX_SECONDS": "10",
        "EXIT_AFTER_IDLE_SECONDS": "600",
        "LD_LIBRARY_PATH": ":".join(libs + [os.environ.get("LD_LIBRARY_PATH", "")]),
    }
    processes.append(subprocess.Popen([sys.executable, "worker.py"], env=env))
print(f"{len(processes)} trabajador(es) en marcha")
sys.exit(max(process.wait() for process in processes))
'''

with tempfile.TemporaryDirectory() as folder:
    script = (
        f"APP_URL = {app_url!r}\n"
        f"WORKER_TOKEN = {token!r}\n"
        f"WORKER_SOURCE = {(here / 'worker.py').read_text(encoding='utf-8')!r}\n"
        + RUNNER
    )
    Path(folder, "transcriptor.py").write_text(script, encoding="utf-8")
    Path(folder, "kernel-metadata.json").write_text(json.dumps({
        "id": f"{username}/{slug}",
        "title": slug,
        "code_file": "transcriptor.py",
        "language": "python",
        "kernel_type": "script",
        "is_private": True,
        "enable_gpu": True,
        "enable_internet": True,
        "dataset_sources": [],
        "competition_sources": [],
        "kernel_sources": [],
    }), encoding="utf-8")
    sys.exit(subprocess.call(["kaggle", "kernels", "push", "-p", folder]))
