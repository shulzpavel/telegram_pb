FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/
COPY run.py .
COPY config.py .

# Expose port (if needed for health checks)
EXPOSE 8080

# Run gateway
CMD ["python", "run.py"]
