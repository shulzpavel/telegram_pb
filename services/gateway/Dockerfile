FROM python:3.11-slim

ARG PIP_INDEX_URL=https://pypi.org/simple
ARG PIP_DEFAULT_TIMEOUT=60

WORKDIR /app

# Install dependencies (minimal = без asyncpg, для режима без метрик)
COPY services/gateway/requirements-minimal.txt requirements.txt
RUN PIP_INDEX_URL=${PIP_INDEX_URL} \
    PIP_DEFAULT_TIMEOUT=${PIP_DEFAULT_TIMEOUT} \
    pip install --no-cache-dir --default-timeout=${PIP_DEFAULT_TIMEOUT} -i ${PIP_INDEX_URL} -r requirements.txt

# Copy application code
COPY app/ ./app/
COPY run.py .
COPY config.py .
COPY session_store.py .
COPY scripts/ ./scripts/

# Expose port (if needed for health checks)
EXPOSE 8080

# Run gateway
CMD ["python", "run.py"]
