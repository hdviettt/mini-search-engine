FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir httpx lxml fastapi "uvicorn[standard]" pydantic "psycopg[binary]" python-dotenv

# Neural re-ranking dependencies (ONNX cross-encoder, no GPU needed)
RUN pip install --no-cache-dir onnxruntime tokenizers numpy huggingface-hub

# NER: spaCy with medium English model (better accuracy, +40MB)
RUN pip install --no-cache-dir spacy && python -m spacy download en_core_web_md

# Download the cross-encoder model at build time (not at runtime)
RUN python -c "\
from huggingface_hub import hf_hub_download; \
import os; \
os.makedirs('/app/models/reranker/onnx', exist_ok=True); \
hf_hub_download('Xenova/ms-marco-MiniLM-L-6-v2', 'onnx/model.onnx', local_dir='/app/models/reranker'); \
hf_hub_download('Xenova/ms-marco-MiniLM-L-6-v2', 'tokenizer.json', local_dir='/app/models/reranker'); \
print('Reranker model downloaded.')"

COPY . .

ENV RERANKER_MODEL_DIR=/app/models/reranker

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --timeout-keep-alive 300
