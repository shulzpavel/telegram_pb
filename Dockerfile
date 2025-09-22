FROM python:3.11-slim

WORKDIR /app

RUN apt-get update \ 
    && apt-get install -y --no-install-recommends \
       curl \
       ca-certificates \ 
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=UTF-8 \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

CMD ["python", "bot_with_logs.py"]
