FROM python:3.12-slim

WORKDIR /app

ENV RERANKER_MODEL_DIR=/app/models/reranker

# Cross-encoder model. Heavy and independent of app code, so this layer
# caches until the download script itself changes.
COPY scripts/download_model.py scripts/
RUN pip install --no-cache-dir "huggingface-hub>=0.20" \
 && python scripts/download_model.py

# Dependencies come from pyproject.toml — the single source of truth.
# Never hardcode a second package list here; that drift is what made
# `pip install -e .` fail locally while the image worked.
COPY . .
RUN pip install --no-cache-dir .

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --timeout-keep-alive 300
