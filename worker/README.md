---
title: Transcriptor UPV
emoji: 🎙️
colorFrom: yellow
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# Transcriptor de exposiciones

Trabajador que procesa la cola de transcripción de la plataforma. Pide un
trabajo a la app, descarga el audio temporal, lo transcribe con
[faster-whisper](https://github.com/SYSTRAN/faster-whisper) y devuelve el
texto. La app borra el audio en cuanto recibe la transcripción.

Puedes arrancar tantos trabajadores como quieras; la cola reparte las
grabaciones y nunca entrega la misma a dos a la vez.

## Variables

| Variable | Obligatoria | Valor |
|---|---|---|
| `APP_URL` | Sí | URL pública de la app, p. ej. `https://tu-app.vercel.app` |
| `WORKER_TOKEN` | Sí | El mismo valor que `TRANSCRIPTION_WORKER_TOKEN` en la app |
| `WORKER_ID` | No | Nombre único del trabajador (`hf-1`, `upv-gpu`…) |
| `WHISPER_MODEL` | No | `small` (por defecto, CPU), `medium`, `large-v3-turbo` (GPU) |
| `WHISPER_DEVICE` | No | `auto`, `cpu` o `cuda` |
| `WHISPER_COMPUTE_TYPE` | No | `int8` en CPU, `float16` en GPU |

## Opción A: Space gratuito de Hugging Face

1. En huggingface.co → **New Space** → SDK **Docker**, hardware **CPU basic (free)**.
2. Sube los archivos de esta carpeta (`README.md`, `Dockerfile`, `app.py`, `requirements.txt`).
3. En **Settings → Variables and secrets** añade `APP_URL`, `WORKER_TOKEN` (como *secret*) y `WORKER_ID`.
4. Añade la URL del Space (`https://USUARIO-NOMBRE.hf.space`) a
   `TRANSCRIPTION_WORKER_URLS` en la app. Así la app lo despierta al encolar.
5. Repite con 2–3 Spaces para procesar en paralelo.

Si el Space es privado, define `HF_TOKEN` (token de lectura) en la app para
poder despertarlo.

## Opción B: tu PC o una máquina de la UPV

```bash
docker build -t transcriptor-upv worker
docker run --rm -p 7860:7860 \
  -e APP_URL=https://tu-app.vercel.app \
  -e WORKER_TOKEN=... -e WORKER_ID=pc-sergio \
  transcriptor-upv
```

Con GPU NVIDIA añade `--gpus all -e WHISPER_DEVICE=cuda -e WHISPER_COMPUTE_TYPE=float16 -e WHISPER_MODEL=large-v3-turbo`
(requiere una imagen base con CUDA/cuDNN, p. ej. `nvidia/cuda:12.3.2-cudnn9-runtime-ubuntu22.04`).

Un trabajador detrás de la red de la UPV no necesita puertos abiertos: es él
quien consulta la app.

## Estado

`GET /health` devuelve si el modelo está cargado, si está ocupado y cuántas
grabaciones ha procesado.
