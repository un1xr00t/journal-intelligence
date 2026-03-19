#!/bin/bash
# deploy_2fa.sh
# Full deploy for TOTP 2FA feature.
# Run from your Mac after SCPing all files to the server.
#
# Usage:
#   bash deploy_2fa.sh

set -e

echo "=== 1. SCP files to server ==="
scp install_2fa_deps.py journal:/opt/journal-dashboard/
scp migration_2fa.sql journal:/opt/journal-dashboard/
scp totp_routes.py journal:/opt/journal-dashboard/src/api/
scp patch_main_2fa.py journal:/opt/journal-dashboard/
scp patch_authcontext_2fa.py journal:/opt/journal-dashboard/
scp patch_settings_2fa.py journal:/opt/journal-dashboard/
scp Login.jsx journal:/opt/journal-dashboard/frontend/src/pages/

echo ""
echo "=== 2. Install Python deps ==="
ssh journal "cd /opt/journal-dashboard && source venv/bin/activate && python3 install_2fa_deps.py"

echo ""
echo "=== 3. Run DB migration ==="
ssh journal "cd /opt/journal-dashboard && sqlite3 db/journal.db < migration_2fa.sql && echo 'Migration OK'"

echo ""
echo "=== 4. Patch backend ==="
ssh journal "cd /opt/journal-dashboard && source venv/bin/activate && python3 patch_main_2fa.py"

echo ""
echo "=== 5. Patch frontend ==="
ssh journal "cd /opt/journal-dashboard && python3 patch_authcontext_2fa.py"
ssh journal "cd /opt/journal-dashboard && python3 patch_settings_2fa.py"

echo ""
echo "=== 6. Build frontend ==="
ssh journal "cd /opt/journal-dashboard/frontend && npm run build"

echo ""
echo "=== 7. Restart API ==="
ssh journal "systemctl restart journal-dashboard"
sleep 2
ssh journal "systemctl status journal-dashboard --no-pager | head -6"

echo ""
echo "=== 8. Smoke test ==="
ssh journal "curl -s http://127.0.0.1:8000/health | python3 -m json.tool"

echo ""
echo "=== Deploy complete ==="
echo "Test flow:"
echo "  1. Log in -> Settings -> Account -> enable 2FA"
echo "  2. Scan QR with Authenticator app, save backup codes"
echo "  3. Enter 6-digit code to activate"
echo "  4. Log out -> log back in -> TOTP step appears"
