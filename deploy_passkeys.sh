#!/usr/bin/env bash
# deploy_passkeys.sh
# Deploy WebAuthn passkey support.
# Run from your Mac — requires `journal` SSH alias configured.
set -e

echo "==> Copying files to server..."
scp migration_passkeys.sql    journal:/opt/journal-dashboard/
scp install_passkey_deps.py   journal:/opt/journal-dashboard/
scp passkey_routes.py         journal:/opt/journal-dashboard/src/api/
scp patch_main_passkeys.py    journal:/opt/journal-dashboard/
scp patch_settings_passkeys.py journal:/opt/journal-dashboard/
scp patch_login_passkeys.py   journal:/opt/journal-dashboard/

echo "==> Running server-side deploy..."
ssh journal "
  set -e
  cd /opt/journal-dashboard
  source venv/bin/activate

  echo '-- Installing py_webauthn...'
  python3 install_passkey_deps.py

  echo '-- Running DB migration...'
  sqlite3 db/journal.db < migration_passkeys.sql
  echo '   Migration OK.'

  echo '-- Patching main.py...'
  python3 patch_main_passkeys.py

  echo '-- Patching Settings.jsx...'
  python3 patch_settings_passkeys.py

  echo '-- Patching Login.jsx...'
  python3 patch_login_passkeys.py

  echo '-- Building frontend...'
  cd frontend && npm run build
  cd ..

  echo '-- Restarting API...'
  systemctl restart journal-dashboard
  sleep 2
  systemctl status journal-dashboard --no-pager | head -6

  echo '-- Smoke test passkey routes...'
  curl -s -o /dev/null -w 'POST /auth/passkey/authenticate-begin -> %{http_code}\n' \
    -X POST http://127.0.0.1:8000/auth/passkey/authenticate-begin \
    -H 'Content-Type: application/json' -d '{}'

  echo '==> Deploy complete.'
"
