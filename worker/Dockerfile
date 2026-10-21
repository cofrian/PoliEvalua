FROM python:3.11-slim

# Usuario sin privilegios (requisito de los Spaces de Hugging Face).
RUN useradd -m -u 1000 worker
WORKDIR /home/worker/app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=worker worker.py app.py ./
USER worker
ENV HF_HOME=/home/worker/.cache/huggingface \
    PYTHONUNBUFFERED=1

EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
