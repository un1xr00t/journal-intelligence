#!/bin/bash
# deploy_entry_attachments.sh
# Deploys the entry image attachments feature end-to-end.
# Run from your Mac after SCPing all files.

set -e
APP=/opt/journal-dashboard

echo "=== 1. DB migration ==="
sqlite3 $APP/db/journal.db < $APP/migration_entry_attachments.sql

echo ""
echo "=== 2. Install backend route file ==="
cp $APP/entry_attachments_routes.py $APP/src/api/entry_attachments_routes.py
echo "OK"

echo ""
echo "=== 3. Register routes in main.py ==="
cd $APP && source venv/bin/activate
python3 $APP/patch_register_entry_attachments.py

echo ""
echo "=== 4. Restart API ==="
systemctl restart journal-dashboard
sleep 2
systemctl status journal-dashboard --no-pager | head -8

echo ""
echo "=== 5. Patch JournalWrite.jsx ==="
python3 $APP/patch_journalwrite_attachments.py

echo ""
echo "=== 6. Patch Timeline.jsx ==="
python3 $APP/patch_timeline_entry_images.py

echo ""
echo "=== 7. Frontend build ==="
cd $APP/frontend && npm run build

echo ""
echo "=== Done ==="
echo "Test checklist:"
echo "  1. /write — 📷 button visible in editor footer"
echo "  2. Select a JPEG/PNG — thumbnail strip appears below editor"
echo "  3. Save entry — images upload automatically after save"
echo "  4. Timeline — expand the entry — thumbnail strip shows with 72px thumbs"
echo "  5. Click a thumb — lightbox opens with auth-gated image"
echo "  6. Lightbox delete button removes the image"
echo "  7. Try uploading a .pdf or .exe — should get 415 rejected"
echo "  8. Try uploading a file over 8 MB — should get 413 rejected"
echo "  tail -f $APP/logs/api.log to watch for errors"
