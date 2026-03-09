#!/bin/bash
# backup_journal.sh
# Place at: <your-app-root>/backup_journal.sh
# Cron: 0 3 * * * /path/to/journal-intelligence/backup_journal.sh >> /path/to/journal-intelligence/logs/backup.log 2>&1

set -e

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${APP_ROOT}/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="journal_backup_${TIMESTAMP}"
KEEP_DAYS=14  # auto-purge backups older than this

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup: $BACKUP_NAME"

# 1. Safe SQLite backup (uses SQLite's own backup API — safe even while running)
sqlite3 "$APP_ROOT/db/journal.db" ".backup '$BACKUP_DIR/${BACKUP_NAME}.db'"
echo "[$(date)] DB backup done"

# 2. Tar up derived data (master summaries, user memory, exports)
tar -czf "$BACKUP_DIR/${BACKUP_NAME}_derived.tar.gz" \
  -C "$APP_ROOT/data" derived/ \
  2>/dev/null || true
echo "[$(date)] Derived data backup done"

# 3. Purge old backups
find "$BACKUP_DIR" -name "journal_backup_*" -mtime +${KEEP_DAYS} -delete
echo "[$(date)] Old backups purged (kept last ${KEEP_DAYS} days)"

echo "[$(date)] Backup complete: $BACKUP_NAME"
