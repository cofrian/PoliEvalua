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

El trabajador solo entra cuando Groq no puede transcribir. Puedes arrancar tantos trabajadores como quieras; la cola reparte las
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
| `EXIT_AFTER_IDLE_SECONDS` | No | Termina tras ese tiempo sin trabajo (0 = nunca) |

## Opción A: Kaggle automático (recomendado)

La app transcribe primero con Groq. Cuando un trozo no se puede procesar allí,
GitHub Actions (`.github/workflows/kaggle-worker.yml`) lanza este trabajador en
una GPU gratuita de Kaggle con `kaggle_launch.py`, y este se apaga tras 10 min
sin trabajo. Kaggle da unas 30 h de GPU a la semana.

1. En kaggle.com verifica tu teléfono (sin eso no hay internet en los notebooks).
2. **Settings → API → Create New Token**: copia el `KAGGLE_API_TOKEN`.
3. En GitHub → **Settings → Secrets and variables → Actions** crea
   `KAGGLE_USERNAME` (tu usuario de Kaggle), `KAGGLE_API_TOKEN` y
   `TRANSCRIPTION_WORKER_TOKEN` (el mismo valor que en Vercel).
4. Opcional, para que arranque al instante en vez de en ≤10 min: un token
   *fine-grained* de GitHub con permiso **Actions: Read and write** en este
   repositorio, guardado en Vercel como `GITHUB_DISPATCH_TOKEN`.

El notebook que se crea (`transcriptor-upv`) es privado y lleva dentro el token
del trabajador, que solo permite recoger y devolver trozos de la cola.

## Opción A2: Kaggle o Colab a mano

Abre `kaggle_worker.ipynb` o `colab_worker.ipynb`, sigue los pasos del
principio y pulsa **Run All**. Útil si GitHub Actions no está disponible.

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
