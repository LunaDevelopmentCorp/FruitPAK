#!/bin/bash
# Quick database backup script for FruitPAK
# Creates a timestamped dump of the entire PostgreSQL database

set -e

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/fruitpak_backup_${TIMESTAMP}.sql"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "=========================================="
echo "  FruitPAK Database Backup"
echo "=========================================="
echo ""

# Extract database connection details from .env or use defaults
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-fruitpak}
DB_USER=${DB_USER:-fruitpak_user}

echo "Database: $DB_NAME"
echo "Host:     $DB_HOST:$DB_PORT"
echo "User:     $DB_USER"
echo ""
echo "Backup file: $BACKUP_FILE"
echo ""

# Run pg_dump
echo "🔄 Starting backup..."
PGPASSWORD=${DB_PASSWORD} pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --format=custom \
  --compress=9 \
  --file="$BACKUP_FILE"

# Check if successful
if [ $? -eq 0 ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo ""
    echo "✅ Backup successful!"
    echo "   Size: $BACKUP_SIZE"
    echo "   File: $BACKUP_FILE"
    echo ""
    echo "To restore:"
    echo "  pg_restore -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME --clean $BACKUP_FILE"
else
    echo ""
    echo "❌ Backup failed!"
    exit 1
fi

echo ""
echo "=========================================="
