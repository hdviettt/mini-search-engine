FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir httpx lxml fastapi uvicorn pydantic "psycopg[binary]" python-dotenv

COPY . .

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --timeout-keep-alive 300
