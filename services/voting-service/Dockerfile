FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY services/voting-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy service code
COPY services/voting-service/ ./services/voting_service/
COPY app/ ./app/
COPY config.py .

# Expose port
EXPOSE 8002

# Run service
CMD ["python", "-m", "services.voting_service.main"]
