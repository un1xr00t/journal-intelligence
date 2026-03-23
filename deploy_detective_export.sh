#!/bin/bash
# deploy_detective_export.sh
# Deploys the "Export Case Report" feature for Detective Mode.
#
# Files deployed:
#   - detective_case_export.py  → src/nlp/
#   - patch_detective_export_route.py → runs to patch detective_routes.py
#   - patch_detective_export_tab.py   → runs to patch DetectiveFull.jsx

set -e
APP=/opt/journal-dashboard

echo "=== Checking PDF backend ==="
cd $APP && source venv/bin/activate
python3 -c "
try:
    import weasyprint; print('weasyprint: OK')
except ImportError:
    print('WARNING: weasyprint not found.')
    print('  Run: pip install weasyprint --break-system-packages')
"

echo ""
echo "=== Installing detective_case_export.py ==="
cp $APP/detective_case_export.py $APP/src/nlp/detective_case_export.py
echo "OK"

echo ""
echo "=== Patching detective_routes.py (export routes) ==="
python3 $APP/patch_detective_export_route.py

echo ""
echo "=== Restarting API ==="
systemctl restart journal-dashboard
sleep 2
systemctl status journal-dashboard --no-pager | head -8

echo ""
echo "=== Patching DetectiveFull.jsx ==="
python3 $APP/patch_detective_export_tab.py

echo ""
echo "=== Rebuilding frontend ==="
cd $APP/frontend && npm run build

echo ""
echo "=== All done ==="
echo ""
echo "Test checklist:"
echo "  1. Open Detective Mode → Full Workspace"
echo "  2. Select any case with entries + photos"
echo "  3. Click 'Export Report' tab"
echo "  4. Click 'Generate & Download PDF'"
echo "  5. Verify PDF downloads and opens correctly"
echo "  6. tail -f $APP/logs/api.log to watch for errors"
