cd /opt/journal-dashboard
pkill -9 -f uvicorn; sleep 2
lsof -i :8000 | awk 'NR>1 {print $2}' | xargs kill -9 2>/dev/null; sleep 1
nohup env PYTHONPATH=/opt/journal-dashboard uvicorn src.api.main:app \
  --host 0.0.0.0 --port 8000 --workers 2 > logs/api.log 2>&1 &
sleep 2 && tail -20 logs/api.log
