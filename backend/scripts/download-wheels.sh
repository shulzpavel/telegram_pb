#!/bin/sh
# Скачать wheels для офлайн-сборки (когда docker build не имеет доступа в сеть)
# Платформа и Python должны совпадать с python:3.11-slim в Dockerfile
set -e
cd "$(dirname "$0")/../.."
mkdir -p docker-wheels
rm -rf docker-wheels/*
echo "Downloading packages for linux x86_64, Python 3.11..."
if python3 -m pip download -r backend/requirements.txt -d docker-wheels \
  --platform manylinux2014_x86_64 \
  --platform manylinux_2_17_x86_64 \
  --python-version 311 2>/dev/null; then
  echo "Done (platform-specific)."
else
  echo "Platform-specific failed, trying default..."
  python3 -m pip download -r backend/requirements.txt -d docker-wheels
  echo "Done (host platform). Убедись что хост — Linux x86_64."
fi
echo "Run: docker compose -f docker-compose.yml -f docker-compose.offline.yml build gateway --no-cache"
