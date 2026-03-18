"""
Patch: add GET /api/people/intelligence to src/api/main.py
Inserts the route just before the existing /api/mood/trend endpoint.
"""
import sys

TARGET = "/opt/journal-dashboard/src/api/main.py"

NEW_ROUTE = chr(10) + '''@app.get("/api/people/intelligence")
async def get_people_intelligence(current_user: dict = Depends(require_any_user)):
    """Per-person impact scores, distress/support rankings, and monthly activity data."""
    import json as _json
    from src.auth.auth_db import get_db as _get_db

    PERSON_VARIANTS = {"person", "human", "individual", "per"}

    conn = _get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT e.entry_date, ds.entities, ds.severity, ds.mood_score
        FROM derived_summaries ds
        JOIN entries e ON e.id = ds.entry_id
        WHERE ds.entities IS NOT NULL AND e.user_id = ? AND e.is_current = 1
        ORDER BY e.entry_date ASC
    """, (current_user["id"],))
    rows = cursor.fetchall()
    conn.close()

    people_data = {}

    for row in rows:
        try:
            entities = _json.loads(row["entities"])
        except (_json.JSONDecodeError, TypeError):
            continue

        severity = float(row["severity"] or 5.0)
        date = row["entry_date"] or ""
        month = date[:7]

        for entity in entities:
            name = (entity.get("name") or "").strip()
            raw_type = entity.get("type") or entity.get("entity_type") or "topic"
            if raw_type.lower() not in PERSON_VARIANTS or not name:
                continue

            if name not in people_data:
                people_data[name] = {
                    "name": name,
                    "mention_count": 0,
                    "severity_sum": 0.0,
                    "distress_entries": 0,
                    "support_entries": 0,
                    "monthly": {},
                    "severity_timeline": [],
                    "first_mention": date,
                    "last_mention": date,
                }

            p = people_data[name]
            p["mention_count"] += 1
            p["severity_sum"] += severity
            if date:
                p["last_mention"] = date
                p["monthly"][month] = p["monthly"].get(month, 0) + 1
                p["severity_timeline"].append({"date": date, "severity": round(severity, 1)})

            if severity >= 7.0:
                p["distress_entries"] += 1
            elif severity <= 4.0:
                p["support_entries"] += 1

    result = []
    for name, p in people_data.items():
        count = p["mention_count"]
        avg_sev = p["severity_sum"] / count if count > 0 else 5.0
        freq_score = min(count / 20.0, 1.0) * 3.0
        sev_score = (avg_sev / 10.0) * 5.0
        distress_ratio = p["distress_entries"] / count if count > 0 else 0.0
        distress_score = distress_ratio * 2.0
        impact_score = round(freq_score + sev_score + distress_score, 1)

        result.append({
            "name": name,
            "mention_count": count,
            "avg_severity": round(avg_sev, 1),
            "distress_entries": p["distress_entries"],
            "support_entries": p["support_entries"],
            "neutral_entries": count - p["distress_entries"] - p["support_entries"],
            "impact_score": impact_score,
            "first_mention": p["first_mention"],
            "last_mention": p["last_mention"],
            "monthly": p["monthly"],
            "severity_timeline": p["severity_timeline"],
        })

    result.sort(key=lambda x: x["impact_score"], reverse=True)
    return {"people": result}


''' + chr(10)

ANCHOR = '@app.get("/api/mood/trend")'

with open(TARGET) as f:
    content = f.read()

assert ANCHOR in content, f"ERROR: anchor not found: {ANCHOR!r}"
assert "/api/people/intelligence" not in content, "ERROR: route already exists — skipping"

patched = content.replace(ANCHOR, NEW_ROUTE + ANCHOR, 1)

with open(TARGET, "w") as f:
    f.write(patched)

print("OK: /api/people/intelligence added to main.py")
