pkill -f streamlit && cd /opt/journal-dashboard && source venv/bin/activate && \
  nohup env PYTHONPATH=/opt/journal-dashboard streamlit run src/dashboard/app.py \
  --server.port 8501 --server.address 0.0.0.0 > logs/dashboard.log 2>&1 &
