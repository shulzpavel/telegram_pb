FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY services/jira-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy service code
COPY services/jira-service/ ./services/jira-service/
COPY app/ ./app/
COPY config.py .

# Expose port
EXPOSE 8001

# Run service
CMD ["python", "-m", "services.jira_service.main"]
