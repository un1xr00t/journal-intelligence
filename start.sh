#!/usr/bin/env bash
# start.sh
# Journal Intelligence — start the app locally.
# Run after install_local.sh completes.

set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_ROOT"

# Sanity checks
[[ -f config/config.yaml ]] || { echo "ERROR: config/config.yaml not found. Run ./install_local.sh first."; exit 1; }
[[ -d venv ]]               || { echo "ERROR: venv not found. Run ./install_local.sh first."; exit 1; }
[[ -f db/journal.db ]]      || { echo "ERROR: database not found. Run ./install_local.sh first."; exit 1; }

source venv/bin/activate

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Journal Intelligence"
echo "  http://localhost:8000"
echo "  Press Ctrl+C to stop."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

PYTHONPATH="$APP_ROOT" \
JOURNAL_HOME="$APP_ROOT" \
    uvicorn src.api.main:app \
    --host 127.0.0.1 \
    --port 8000 \
    --workers 1 \
    --log-level info 2>&1 | tee -a logs/api.log
