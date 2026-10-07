FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend, frontend, database schema, and configuration
COPY backend/ ./backend/
COPY public/ ./public/
COPY supabase_setup.sql .
COPY .env* ./

EXPOSE 8080

CMD ["python", "backend/run.py"]
