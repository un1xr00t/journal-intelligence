#!/usr/bin/env bash
# install_local.sh
# Journal Intelligence — local install (Mac, Linux, WSL)
#
# Usage:
#   ./install_local.sh
#
# Installs everything in the current directory.
# The app runs at http://localhost:8000 — never touches the internet
# unless you configure an AI provider in Settings.

set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Journal Intelligence — Local Installer"
echo "  App root: $APP_ROOT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Check prerequisites ───────────────────────────────────────────────────────
echo "[1/6] Checking prerequisites..."

check_cmd() {
    command -v "$1" &>/dev/null || {
        echo "  ERROR: '$1' not found. Please install it and re-run."
        exit 1
    }
}

check_cmd python3
check_cmd node
check_cmd npm
check_cmd sqlite3

PY_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
NODE_MAJOR=$(node --version | cut -d. -f1 | tr -d v)

echo "  Python $PY_VERSION  |  Node $(node --version)  |  npm $(npm --version)"

if [[ "$PY_VERSION" < "3.10" ]]; then
    echo "  ERROR: Python 3.10+ required (found $PY_VERSION)."
    exit 1
fi

if [[ "$NODE_MAJOR" -lt 18 ]]; then
    echo "  ERROR: Node 18+ required (found $(node --version))."
    exit 1
fi

# ── Create directories ────────────────────────────────────────────────────────
echo "[2/6] Creating directories..."
cd "$APP_ROOT"
mkdir -p db logs data/entries backups config exports

echo "  Creating Python package __init__.py files..."
touch src/__init__.py
touch src/api/__init__.py
touch src/auth/__init__.py
touch src/ingest/__init__.py
touch src/nlp/__init__.py
touch src/patterns/__init__.py

# ── Python virtualenv ─────────────────────────────────────────────────────────
echo "[3/6] Setting up Python virtualenv..."

if [[ ! -d venv ]]; then
    python3 -m venv venv
    echo "  Created venv."
else
    echo "  venv already exists."
fi

source venv/bin/activate

if [[ -f requirements.txt ]]; then
    pip install -q -r requirements.txt
    echo "  Python dependencies installed."
else
    echo "  WARNING: requirements.txt not found. Installing core packages..."
    pip install -q \
        fastapi uvicorn[standard] \
        pydantic python-jose[cryptography] passlib[bcrypt] \
        python-multipart aiofiles \
        pyyaml anthropic openai \
        weasyprint \
        sentence-transformers numpy \
        slowapi
fi

# ── Frontend ──────────────────────────────────────────────────────────────────
echo "[4/6] Building React frontend..."
cd "$APP_ROOT/frontend"
npm install --silent
npm run build
cd "$APP_ROOT"
echo "  Frontend built."

# ── Config file ───────────────────────────────────────────────────────────────
echo "[5/6] Generating config/config.yaml..."

if [[ -f config/config.yaml ]]; then
    echo "  config.yaml already exists — skipping."
else
    JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")

    cat > config/config.yaml <<EOF
database:
  path: $APP_ROOT/db/journal.db

storage:
  base_path: $APP_ROOT/data/
  raw_entries: entries/

jwt:
  secret_key: $JWT_SECRET
  algorithm: HS256
  access_token_expire_minutes: 15
  refresh_token_expire_days: 30

cors:
  allowed_origins:
    - "http://localhost:5173"
    - "http://localhost:8000"
    - "http://127.0.0.1:8000"

anthropic:
  api_key: ""
  model: "claude-sonnet-4-5"

server:
  host: 127.0.0.1
  port: 8000
  workers: 1
  log_level: info
EOF
    echo "  config.yaml written."
fi

# ── Database ──────────────────────────────────────────────────────────────────
echo "[6/6] Initialising database..."

DB_PATH="$APP_ROOT/db/journal.db"

if [[ -f "$DB_PATH" ]]; then
    echo "  Database already exists — skipping."
else
    sqlite3 "$DB_PATH" < "$APP_ROOT/init_db.sql"
    echo "  Database created at $DB_PATH"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Install complete!"
echo ""
echo "  To start the app:"
echo "    ./start.sh"
echo ""
echo "  Then open: http://localhost:8000"
echo ""
echo "  First run:"
echo "  1. Click 'Create account' to run the onboarding flow"
echo "  2. The first account is the owner"
echo "  3. Add your AI API key in Settings → AI Preferences"
echo "     (or use a local model — Ollama, LM Studio)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
