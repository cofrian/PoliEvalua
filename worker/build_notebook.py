"""Genera kaggle_worker.ipynb y colab_worker.ipynb incrustando worker.py.

Vuelve a ejecutarlo tras cambiar worker.py: ``python build_notebook.py``.
"""

import json
from pathlib import Path

here = Path(__file__).parent
worker_source = (here / "worker.py").read_text(encoding="utf-8")


def code(source: str) -> dict:
    return {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": source.strip("\n").splitlines(keepends=True),
    }


def markdown(source: str) -> dict:
    return {"cell_type": "markdown", "metadata": {}, "source": source.strip("\n").splitlines(keepends=True)}


KAGGLE_INTRO = """
# Transcriptor UPV en Kaggle (GPU gratis)

1. **Settings → Accelerator → GPU T4 x2** e **Internet → On** (requiere verificar el teléfono en Kaggle).
2. **Add-ons → Secrets**: crea `WORKER_TOKEN` con el valor de `TRANSCRIPTION_WORKER_TOKEN` y actívalo para este notebook.
3. Pulsa **Run All**. Deja la pestaña abierta mientras haya exposiciones: cada GPU procesa una grabación a la vez.
"""

COLAB_INTRO = """
# Transcriptor UPV en Google Colab (respaldo)

1. **Entorno de ejecución → Cambiar tipo → GPU T4**.
2. Panel izquierdo **🔑 Secretos**: crea `WORKER_TOKEN` con el valor de `TRANSCRIPTION_WORKER_TOKEN` y activa el acceso del notebook.
3. **Entorno de ejecución → Ejecutar todo**. Colab corta las sesiones inactivas: deja la pestaña abierta y vuelve a ejecutar si se desconecta.
"""

KAGGLE_SECRET = """from kaggle_secrets import UserSecretsClient

token = UserSecretsClient().get_secret("WORKER_TOKEN")"""

COLAB_SECRET = """from google.colab import userdata

token = userdata.get("WORKER_TOKEN")"""


def build(platform: str) -> list[dict]:
    kaggle = platform == "kaggle"
    return [
    markdown(KAGGLE_INTRO if kaggle else COLAB_INTRO),
    code(f"""
APP_URL = "https://valencia-hack-jurado.vercel.app"
WORKER_PREFIX = "{platform}"
WHISPER_MODEL = "large-v3"  # en GPU: máxima calidad (turbo confundía términos como «kit»)
"""),
    code("""
!pip install -q faster-whisper==1.1.1 av==18.1.0 requests nvidia-cudnn-cu12==9.* nvidia-cublas-cu12
"""),
    code("%%writefile worker.py\n" + worker_source),
    code("""
import os
import subprocess
import sys
import time

import nvidia.cublas.lib
import nvidia.cudnn.lib
""" + (KAGGLE_SECRET if kaggle else COLAB_SECRET) + """
libs = [list(nvidia.cublas.lib.__path__)[0], list(nvidia.cudnn.lib.__path__)[0]]
try:
    gpu_count = len(subprocess.check_output(["nvidia-smi", "-L"], text=True).strip().splitlines())
except Exception:
    gpu_count = 0

processes = []
for gpu in range(max(gpu_count, 1)):
    env = {
        **os.environ,
        "APP_URL": APP_URL,
        "WORKER_TOKEN": token,
        "WORKER_ID": f"{WORKER_PREFIX}-gpu{gpu}",
        "WHISPER_MODEL": WHISPER_MODEL if gpu_count else "small",
        "WHISPER_DEVICE": "cuda" if gpu_count else "cpu",
        "WHISPER_COMPUTE_TYPE": "float16" if gpu_count else "int8",
        "CUDA_VISIBLE_DEVICES": str(gpu),
        "IDLE_MAX_SECONDS": "10",
        "LD_LIBRARY_PATH": ":".join(libs + [os.environ.get("LD_LIBRARY_PATH", "")]),
    }
    log = open(f"worker-{gpu}.log", "w")
    processes.append((subprocess.Popen([sys.executable, "worker.py"], env=env, stdout=log, stderr=subprocess.STDOUT), log.name))
print(f"{len(processes)} trabajador(es) en marcha. Deja esta celda ejecutándose.")

seen = {name: 0 for _, name in processes}
while True:
    for process, name in processes:
        with open(name) as handle:
            lines = handle.readlines()
        for line in lines[seen[name]:]:
            print(f"[{name}] {line}", end="")
        seen[name] = len(lines)
        if process.poll() is not None:
            print(f"[{name}] terminó con código {process.returncode}")
            raise SystemExit(1)
    time.sleep(5)
"""),
    ]


for platform in ("kaggle", "colab"):
    notebook = {
        "cells": build(platform),
        "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"}},
        "nbformat": 4,
        "nbformat_minor": 5,
    }
    output = here / f"{platform}_worker.ipynb"
    output.write_text(json.dumps(notebook, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{output.name} generado")
