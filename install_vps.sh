#!/usr/bin/env bash
# install_vps.sh
# Journal Intelligence — VPS installer (Ubuntu 22.04 / 24.04)
#
# Usage:
#   sudo ./install_vps.sh --domain journal.yourdomain.com
#   sudo ./install_vps.sh --domain journal.yourdomain.com --user myuser
#
# What this does:
#   1. Installs system dependencies (Python 3.11+, Node 20, nginx, certbot, sqlite3)
#   2. Creates app directory at /opt/journal-dashboard
#   3. Sets up Python virtualenv + installs pip requirements
#   4. Builds the React frontend
#   5. Creates config/config.yaml with your domain + a random JWT secret
#   6. Initialises the SQLite database
#   7. Installs and enables the systemd service
#   8. Configures nginx reverse proxy
#   9. Obtains a Let's Encrypt SSL certificate
#  10. Runs security_hardening.sh

set -euo pipefail

# ── Parse args ────────────────────────────────────────────────────────────────
DOMAIN=""
APP_USER="www-data"
APP_ROOT="/opt/journal-dashboard"

print_usage() {
    echo "Usage: sudo $0 --domain <your-domain.com> [--user <system-user>]"
    exit 1
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --domain) DOMAIN="$2"; shift 2 ;;
        --user)   APP_USER="$2"; shift 2 ;;
        *)        print_usage ;;
    esac
done

[[ -z "$DOMAIN" ]] && print_usage
[[ "$EUID" -ne 0 ]] && { echo "Run as root (sudo)."; exit 1; }

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Journal Intelligence — VPS Installer"
echo "  Domain: $DOMAIN"
echo "  App root: $APP_ROOT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 1. System dependencies ────────────────────────────────────────────────────
echo "[1/10] Installing system packages..."
apt-get update -qq
apt-get install -y -qq \
    python3 python3-pip python3-venv python3-dev \
    build-essential \
    sqlite3 \
    nginx \
    certbot python3-certbot-nginx \
    curl git \
    libpango-1.0-0 libharfbuzz0b libpangoft2-1.0-0 \
    libffi-dev libssl-dev

# Node 20
if ! command -v node &>/dev/null || [[ "$(node --version | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
    echo "  Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - -qq
    apt-get install -y -qq nodejs
fi
echo "  Node $(node --version), npm $(npm --version)"

# ── 2. App directory ──────────────────────────────────────────────────────────
echo "[2/10] Setting up app directory..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$SCRIPT_DIR" != "$APP_ROOT" ]]; then
    mkdir -p "$APP_ROOT"
    cp -r "$SCRIPT_DIR/." "$APP_ROOT/"
fi

# Create required directories
mkdir -p "$APP_ROOT"/{db,logs,data/entries,backups,config,exports}

# ── 3. Python virtualenv ──────────────────────────────────────────────────────
echo "[3/10] Setting up Python virtualenv..."
cd "$APP_ROOT"
python3 -m venv venv
source venv/bin/activate

if [[ -f requirements.txt ]]; then
    pip install -q -r requirements.txt
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

# ── 4. Frontend build ─────────────────────────────────────────────────────────
echo "[4/10] Building React frontend..."
cd "$APP_ROOT/frontend"
npm install --silent
npm run build
cd "$APP_ROOT"

# ── 5. Config file ────────────────────────────────────────────────────────────
echo "[5/10] Generating config/config.yaml..."
JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")

cat > "$APP_ROOT/config/config.yaml" <<EOF
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
    - "https://$DOMAIN"

anthropic:
  api_key: ""
  model: "claude-sonnet-4-5"

server:
  host: 0.0.0.0
  port: 8000
  workers: 2
  log_level: info
EOF
echo "  config.yaml written."

# ── 6. Database init ──────────────────────────────────────────────────────────
echo "[6/10] Initialising database..."
DB_PATH="$APP_ROOT/db/journal.db"

if [[ -f "$DB_PATH" ]]; then
    echo "  Database already exists — skipping init."
else
    sqlite3 "$DB_PATH" < "$APP_ROOT/init_db.sql"
    echo "  Database created at $DB_PATH"
fi

# ── 7. Systemd service ────────────────────────────────────────────────────────
echo "[7/10] Installing systemd service..."
chown -R "$APP_USER":"$APP_USER" "$APP_ROOT"

cat > /etc/systemd/system/journal-dashboard.service <<EOF
[Unit]
Description=Journal Intelligence Dashboard
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_ROOT
Environment="PYTHONPATH=$APP_ROOT"
ExecStart=$APP_ROOT/venv/bin/uvicorn src.api.main:app \\
    --host 0.0.0.0 --port 8000 --workers 2
Restart=always
RestartSec=5
StandardOutput=append:$APP_ROOT/logs/api.log
StandardError=append:$APP_ROOT/logs/api.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable journal-dashboard
systemctl start journal-dashboard
echo "  Service started. Status:"
systemctl is-active journal-dashboard && echo "  ✓ Running" || echo "  ✗ Failed — check: journalctl -u journal-dashboard -n 30"

# ── 8. nginx config ───────────────────────────────────────────────────────────
echo "[8/10] Configuring nginx..."
cat > /etc/nginx/sites-available/"$DOMAIN" <<'NGINX'
server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER;

    # Security headers
    add_header X-Robots-Tag "noindex, nofollow" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;

    # API proxy
    location /api/ {
        proxy_pass         http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
        client_max_body_size 50M;
    }

    # Auth proxy
    location /auth/ {
        proxy_pass         http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }

    # React SPA — serve built files, fall back to index.html
    location / {
        root   APP_ROOT_PLACEHOLDER/frontend/dist;
        index  index.html;
        try_files $uri $uri/ /index.html;

        # Cache static assets aggressively
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}
NGINX

# Substitute placeholders
sed -i "s|DOMAIN_PLACEHOLDER|$DOMAIN|g"    /etc/nginx/sites-available/"$DOMAIN"
sed -i "s|APP_ROOT_PLACEHOLDER|$APP_ROOT|g" /etc/nginx/sites-available/"$DOMAIN"

ln -sf /etc/nginx/sites-available/"$DOMAIN" /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
echo "  nginx configured."

# ── 9. SSL certificate ────────────────────────────────────────────────────────
echo "[9/10] Obtaining SSL certificate..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
    --register-unsafely-without-email --redirect || \
    echo "  WARNING: certbot failed. Run manually: certbot --nginx -d $DOMAIN"

# ── 10. Security hardening ────────────────────────────────────────────────────
echo "[10/10] Running security hardening..."
if [[ -f "$APP_ROOT/security_hardening.sh" ]]; then
    bash "$APP_ROOT/security_hardening.sh"
else
    echo "  security_hardening.sh not found — skipping."
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Install complete!"
echo ""
echo "  URL:     https://$DOMAIN"
echo "  Logs:    tail -f $APP_ROOT/logs/api.log"
echo "  Restart: systemctl restart journal-dashboard"
echo "  Status:  systemctl status journal-dashboard"
echo ""
echo "  Next steps:"
echo "  1. Open https://$DOMAIN in your browser"
echo "  2. Click 'Create account' to run the onboarding flow"
echo "  3. The first account you create is the owner"
echo "  4. Add your AI API key in Settings → AI Preferences"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
