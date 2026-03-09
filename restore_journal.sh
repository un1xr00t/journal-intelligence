#!/bin/bash
# restore_journal.sh
# Usage: ./restore_journal.sh journal_backup_20260304_030000
# (pass the backup name WITHOUT extension)
# Place at: <your-app-root>/restore_journal.sh

set -e

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${APP_ROOT}/backups"
BACKUP_NAME="$1"

if [ -z "$BACKUP_NAME" ]; then
  echo "Usage: $0 <backup_name>"
  echo ""
  echo "Available backups:"
  ls "$BACKUP_DIR"/*.db 2>/dev/null | xargs -I{} basename {} .db | sed 's/^/  /'
  exit 1
fi

DB_BACKUP="$BACKUP_DIR/${BACKUP_NAME}.db"
DERIVED_BACKUP="$BACKUP_DIR/${BACKUP_NAME}_derived.tar.gz"

if [ ! -f "$DB_BACKUP" ]; then
  echo "ERROR: DB backup not found: $DB_BACKUP"
  exit 1
fi

echo "=== Journal Dashboard Restore ==="
echo "Restoring from: $BACKUP_NAME"
echo ""
read -p "This will OVERWRITE the current database and derived data. Continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

# 1. Stop the API
echo "[1/4] Stopping API..."
pkill -9 -f uvicorn 2>/dev/null || true
sleep 2

# 2. Restore DB
echo "[2/4] Restoring database..."
cp "$APP_ROOT/db/journal.db" "$APP_ROOT/db/journal.db.pre_restore_$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true
cp "$DB_BACKUP" "$APP_ROOT/db/journal.db"
echo "  DB restored."

# 3. Restore derived data (if backup exists)
if [ -f "$DERIVED_BACKUP" ]; then
  echo "[3/4] Restoring derived data..."
  cp -r "$APP_ROOT/data/derived" "$APP_ROOT/data/derived.pre_restore_$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true
  tar -xzf "$DERIVED_BACKUP" -C "$APP_ROOT/data/"
  echo "  Derived data restored."
else
  echo "[3/4] No derived data backup found — skipping."
fi

# 4. Restart API
echo "[4/4] Restarting API..."
cd "$APP_ROOT"
nohup env PYTHONPATH="$APP_ROOT" venv/bin/uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --workers 2 > logs/api.log 2>&1 &
sleep 3
tail -5 logs/api.log

echo ""
echo "=== Restore complete ==="
