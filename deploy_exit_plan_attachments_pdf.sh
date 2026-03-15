#!/bin/bash
# deploy_exit_plan_attachments_pdf.sh
# Deploys:
#   - upload_security.py attachment security extension
#   - exit_plan_routes.py attachment routes + PDF export route
#   - exit_plan_pdf_export.py (new file)
#   - ExitPlanFull.jsx (attachments panel + Export tab)
#   - ExitPlan.jsx (attachments in task drawer)
# Then rebuilds frontend.

set -e
APP=/opt/journal-dashboard

echo "=== Checking PDF backend ==="
cd $APP && source venv/bin/activate
python3 -c "
try:
    import weasyprint; print('weasyprint: OK')
except:
    pass
try:
    from reportlab.pdfgen import canvas; print('reportlab: OK')
except:
    print('WARNING: no PDF backend found — install weasyprint or reportlab')
    print('  pip install weasyprint --break-system-packages')
"

echo ""
echo "=== Patching upload_security.py ==="
python3 /opt/journal-dashboard/patch_attachment_security.py

echo ""
echo "=== Patching exit_plan_routes.py (attachment routes) ==="
python3 /opt/journal-dashboard/patch_exit_plan_attachments.py

echo ""
echo "=== Patching exit_plan_routes.py (PDF export route) ==="
python3 /opt/journal-dashboard/patch_exit_plan_pdf_route.py

echo ""
echo "=== Installing exit_plan_pdf_export.py ==="
cp /opt/journal-dashboard/exit_plan_pdf_export.py \
   /opt/journal-dashboard/src/nlp/exit_plan_pdf_export.py
echo "OK"

echo ""
echo "=== Patching ExitPlanFull.jsx ==="
python3 /opt/journal-dashboard/patch_exitplanfull.py

echo ""
echo "=== Patching ExitPlan.jsx ==="
python3 /opt/journal-dashboard/patch_exitplan.py

echo ""
echo "=== Restarting API ==="
systemctl restart journal-dashboard
sleep 2
systemctl status journal-dashboard --no-pager | head -8

echo ""
echo "=== Rebuilding frontend ==="
cd $APP/frontend && npm run build

echo ""
echo "=== All done ==="
echo "Test checklist:"
echo "  1. Open a task in Exit Plan — Attachments section should appear below Notes"
echo "  2. Upload a PDF/image — should accept and list it"
echo "  3. Try uploading a .exe or .sh — should get 415 rejected"
echo "  4. ExitPlanFull → Export tab → Download PDF"
echo "  5. Try HTML export too"
echo "  6. tail -f $APP/logs/api.log to watch for errors"
