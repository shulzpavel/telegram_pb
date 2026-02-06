FROM python:3.11-slim

ARG PIP_INDEX_URL=https://pypi.org/simple
ARG PIP_DEFAULT_TIMEOUT=60

# Needed for container healthcheck (curl)
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY services/jira-service/requirements.txt .
RUN PIP_INDEX_URL=${PIP_INDEX_URL} \
    PIP_DEFAULT_TIMEOUT=${PIP_DEFAULT_TIMEOUT} \
    pip install --no-cache-dir --default-timeout=${PIP_DEFAULT_TIMEOUT} -i ${PIP_INDEX_URL} -r requirements.txt

# Copy service code
COPY services/jira-service/ ./services/jira-service/
COPY app/ ./app/
COPY config.py .

# Expose port
EXPOSE 8001

# Run service
CMD ["python", "-m", "services.jira_service.main"]
