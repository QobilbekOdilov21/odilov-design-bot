FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATABASE_PATH=/data/odilov.db

WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt \
    && groupadd --system bot \
    && useradd --system --gid bot bot \
    && mkdir -p /data \
    && chown bot:bot /data

COPY app/ /app/app/
USER bot
VOLUME ["/data"]
CMD ["python", "-m", "app.main"]
