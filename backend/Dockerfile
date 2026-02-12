FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
# curl: for health checks
# build-essential, libpq-dev: for psycopg2 compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user for security
RUN useradd -m -u 1000 fruitpak && \
    chown -R fruitpak:fruitpak /app
USER fruitpak

EXPOSE 8000

# Production: Use multiple workers
# Development: Use --reload for hot reloading
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
