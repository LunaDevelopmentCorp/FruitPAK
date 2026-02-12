#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# FruitPAK Production Deployment Script
# ═══════════════════════════════════════════════════════════════════
#
# This script deploys the FruitPAK application using docker-compose
# with horizontal scaling enabled (3 backend replicas + nginx).
#
# Usage:
#   ./scripts/deploy-production.sh
#
# Prerequisites:
#   - Docker and Docker Compose installed
#   - .env.production file configured
#   - SSL certificates (optional, for HTTPS)
#
# ═══════════════════════════════════════════════════════════════════

set -e

echo "═══════════════════════════════════════════════════════════"
echo "  FruitPAK Production Deployment"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ── Configuration ──────────────────────────────────────────────────
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"
BACKUP_DIR="./backups"

# ── Pre-flight Checks ──────────────────────────────────────────────
echo "🔍 Running pre-flight checks..."

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Error: $ENV_FILE not found!"
    echo "   Copy .env.production.example to $ENV_FILE and configure it."
    exit 1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
    echo "❌ Error: $COMPOSE_FILE not found!"
    exit 1
fi

echo "✅ Pre-flight checks passed"
echo ""

# ── Backup Database ────────────────────────────────────────────────
echo "💾 Creating database backup..."

if command -v pg_dump &> /dev/null; then
    mkdir -p "$BACKUP_DIR"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/fruitpak_pre_deploy_$TIMESTAMP.sql"

    # Extract DB credentials from .env.production
    source "$ENV_FILE"

    if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps db | grep -q "Up"; then
        docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T db \
            pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "$BACKUP_FILE"
        echo "✅ Backup created: $BACKUP_FILE"
    else
        echo "⚠️  Database not running, skipping backup"
    fi
else
    echo "⚠️  pg_dump not found, skipping backup"
fi
echo ""

# ── Build Images ───────────────────────────────────────────────────
echo "🔨 Building Docker images..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --no-cache
echo "✅ Images built successfully"
echo ""

# ── Stop Old Containers ────────────────────────────────────────────
echo "🛑 Stopping old containers..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down
echo "✅ Old containers stopped"
echo ""

# ── Start Services ─────────────────────────────────────────────────
echo "🚀 Starting services..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

# Wait for services to be healthy
echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check health
HEALTHY=true
for service in db redis backend-1 backend-2 backend-3 nginx; do
    if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps "$service" | grep -q "healthy\|running"; then
        echo "  ✅ $service is healthy"
    else
        echo "  ❌ $service is not healthy"
        HEALTHY=false
    fi
done

echo ""

if [ "$HEALTHY" = true ]; then
    echo "═══════════════════════════════════════════════════════════"
    echo "  ✅ Deployment Successful!"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    echo "Services running:"
    echo "  - Nginx Load Balancer: http://localhost"
    echo "  - Backend (3 replicas): load-balanced via nginx"
    echo "  - PostgreSQL: localhost:5432"
    echo "  - Redis: localhost:6379"
    echo ""
    echo "Health checks:"
    echo "  - curl http://localhost/health"
    echo "  - curl http://localhost/health/ready"
    echo ""
    echo "View logs:"
    echo "  - docker compose -f $COMPOSE_FILE --env-file $ENV_FILE logs -f"
    echo ""
else
    echo "═══════════════════════════════════════════════════════════"
    echo "  ⚠️  Deployment Completed with Warnings"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    echo "Some services are not healthy. Check logs:"
    echo "  docker compose -f $COMPOSE_FILE --env-file $ENV_FILE logs"
    echo ""
fi
