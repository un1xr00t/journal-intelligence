#!/usr/bin/env python3
"""
Debug script: trace why detect_contradictions writes no evidence rows.
Run from /opt/journal-dashboard:
  PYTHONPATH=/opt/journal-dashboard python3 debug_contradictions.py
"""
import re
import sys
from datetime import date

sys.path.insert(0, "/opt/journal-dashboard")

from src.patterns.detectors import (
    _write_evidence_from_alert,
    _upsert_alert,
    _extract_matching_quotes,
    _load_entries_with_summaries,
    get_db,
)

STOPWORDS = {
    "this","that","with","have","from","they","will","been","were",
    "their","what","when","then","than","just","like","very","feel",
    "felt","into","about","said","told","know","think","really",
    "would","could","should","also","even","back","still","more",
    "some","there","here","make","time","again","always","never",
    "every","much","many","over","well","want","need","going",
    "something","anything","nothing","everything","getting","saying",
    "because","though","thought","after","before","being","having",
    "doing","things","people","other","another","where","which",
    "myself","yourself","himself","herself","itself",
}

USER_ID = 1

entries = _load_entries_with_summaries(days_back=365, user_id=USER_ID)
flagged = []
for e in entries:
    quotes = _extract_matching_quotes(e)
    if quotes:
        flagged.append({"entry": e, "quotes": quotes})

print(f"flagged entries: {len(flagged)}")

found = 0
for i in range(len(flagged)):
    for j in range(i + 1, len(flagged)):
        a, b = flagged[i], flagged[j]
        date_a = date.fromisoformat(a["entry"]["entry_date"])
        date_b = date.fromisoformat(b["entry"]["entry_date"])
        gap = (date_b - date_a).days
        if gap < 7 or gap > 180:
            continue
        for q_a in a["quotes"][:3]:
            for q_b in b["quotes"][:3]:
                words_a = set(re.findall(r"\b\w{4,}\b", q_a.lower())) - STOPWORDS
                words_b = set(re.findall(r"\b\w{4,}\b", q_b.lower())) - STOPWORDS
                overlap = words_a & words_b
                if len(overlap) >= 2:
                    print(f"\n--- match found ---")
                    print(f"  dates: {a['entry']['entry_date']} / {b['entry']['entry_date']} (gap={gap}d)")
                    print(f"  overlap: {sorted(overlap)}")
                    print(f"  q_a: {repr(q_a[:100])}")
                    print(f"  q_b: {repr(q_b[:100])}")

                    alert_id = _upsert_alert(
                        alert_type="contradiction",
                        priority_score=round(min(9.0, 4.0 + gap / 30), 1),
                        date_start=a["entry"]["entry_date"],
                        date_end=b["entry"]["entry_date"],
                        supporting_dates=[a["entry"]["entry_date"], b["entry"]["entry_date"]],
                        description="debug test",
                        suggested_packets=[],
                        user_id=USER_ID,
                    )
                    print(f"  alert_id returned: {alert_id}")

                    try:
                        _write_evidence_from_alert(
                            entry_id=a["entry"]["entry_id"],
                            alert_id=alert_id,
                            label="debug",
                            quote_text=q_a,
                            evidence_type="contradiction",
                            source_date=a["entry"]["entry_date"],
                            user_id=USER_ID,
                        )
                        print(f"  _write_evidence_from_alert: OK")
                    except Exception as e:
                        print(f"  _write_evidence_from_alert ERROR: {e}")

                    conn = get_db()
                    cur = conn.cursor()
                    cur.execute(
                        "SELECT COUNT(*) as c FROM evidence WHERE evidence_type='contradiction'"
                    )
                    count = cur.fetchone()["c"]
                    conn.close()
                    print(f"  evidence rows after write: {count}")

                    found += 1
                    if found >= 3:
                        print(f"\nStopped after {found} matches.")
                        sys.exit(0)

print(f"\nDone. Total matches traced: {found}")
