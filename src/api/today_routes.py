"""
src/api/today_routes.py
GET  /api/today          — daily intelligence brief (cached per user per day)
POST /api/today/refresh  — force regenerate today's brief
"""

from __future__ import annotations
import json
import logging
from datetime import date, timedelta

from fastapi import Depends

logger = logging.getLogger("journal")

CONFLICT_KEYWORDS = [
    "argument", "fight", "yelled", "screamed", "confrontation", "conflict",
    "anger", "angry", "furious", "blame", "blamed", "accused", "accusation",
    "ignored", "dismissed", "disrespect", "controlling", "manipulation",
    "threatening", "intimidation", "abuse", "abusive", "toxic",
]
STRESS_KEYWORDS = [
    "overwhelmed", "anxious", "anxiety", "panic", "exhausted", "burnout",
    "stressed", "stress", "tension", "dread", "afraid", "scared", "nervous",
    "hopeless", "helpless", "trapped", "stuck", "can't cope", "breaking down",
    "sleepless", "can't sleep", "numb", "shutting down",
]
POSITIVE_KEYWORDS = [
    "grateful", "hopeful", "peaceful", "calm", "happy", "proud", "strong",
    "relieved", "better", "progress", "clarity", "connected", "support",
    "good day", "improvement", "healing", "confident", "energized",
]
FINANCIAL_KEYWORDS = [
    "money", "financial", "finances", "income", "bills", "debt", "savings",
    "afford", "broke", "paycheck", "job", "work", "salary", "expenses",
    "rent", "mortgage", "independent", "independence",
]

_SYSTEM = """You are a private intelligence system analyzing someone's personal journal data.
Your role is to describe observable patterns, behaviors, trends, and risks — not to diagnose,
label, or make psychological judgments about the person.

CRITICAL LANGUAGE RULES:
- Describe what the DATA shows, not what the person IS or FEELS
- NEVER: "you're spiraling", "you're paranoid", "you're losing grip on reality"
- ALWAYS: "your recent entries show a pattern of...", "journal data indicates rising...",
  "entries from the past 14 days reflect increasing..."
- You analyze patterns. You do not diagnose people.
- Second person ("you"), direct, grounded in data
- Brief fields: 1-2 sentences, specific, tied to observable journal patterns
- time_horizons: concrete and actionable for their specific situation
- trajectory.changes_if: 3-4 realistic levers grounded in the data
- Return ONLY valid JSON, no markdown, no preamble

OUTPUT FORMAT:
{
  "emotional_state": "data-based description of current emotional patterns",
  "getting_worse": "specific patterns that have been deteriorating in the data",
  "getting_better": "specific patterns improving — if none visible, say so honestly",
  "biggest_risk": "the single biggest risk visible in journal patterns",
  "most_important_decision": "the decision pattern that most needs resolution based on data",
  "avoiding": "avoidance patterns visible across journal entries",
  "do_today": "one concrete, specific action grounded in their situation",
  "stop_doing": "one specific behavioral pattern to interrupt, named clearly",
  "independence_note": "one data-based sentence on independence trajectory",
  "time_horizons": {
    "today": "one specific concrete thing to do today",
    "this_week": "main focus for this week based on patterns",
    "this_month": "the big objective for this month",
    "long_term": "the direction this trajectory points toward"
  },
  "trajectory": {
    "mood": "rising|falling|stable",
    "conflict": "rising|falling|stable",
    "independence": "rising|falling|stable",
    "stress": "rising|falling|stable",
    "overall": "positive|negative|neutral",
    "summary": "1 sentence data-based summary of overall trajectory",
    "changes_if": ["specific realistic lever 1", "specific lever 2", "specific lever 3"]
  }
}"""


def register_today_routes(app, require_any_user):
    from src.auth.auth_db import get_db
    from src.api.ai_client import create_message

    def _migrate():
        conn = get_db()
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS today_brief_cache (
                user_id      INTEGER NOT NULL,
                date_key     TEXT    NOT NULL,
                brief_json   TEXT    NOT NULL,
                generated_at TEXT    NOT NULL,
                PRIMARY KEY (user_id, date_key)
            );
        """)
        conn.commit()
        conn.close()

    _migrate()

    def _count_kw(texts, keywords):
        combined = " ".join(texts).lower()
        return sum(1 for kw in keywords if kw in combined)

    def _trend(recent, older):
        if not recent or not older:
            return "stable"
        ra = sum(recent) / len(recent)
        oa = sum(older) / len(older)
        d = ra - oa
        if d > 0.5:  return "rising"
        if d < -0.5: return "falling"
        return "stable"

    def _aggregate(user_id, conn):
        today = date.today()
        d7  = (today - timedelta(days=6)).isoformat()
        d14 = (today - timedelta(days=13)).isoformat()
        d30 = (today - timedelta(days=29)).isoformat()
        d60 = (today - timedelta(days=59)).isoformat()

        rows = conn.execute("""
            SELECT e.entry_date, e.normalized_text,
                   ds.mood_score, ds.severity
            FROM entries e
            JOIN derived_summaries ds ON ds.entry_id = e.id
            WHERE e.user_id = ? AND e.is_current = 1 AND ds.severity IS NOT NULL
              AND e.entry_date >= ?
            ORDER BY e.entry_date DESC
        """, (user_id, d60)).fetchall()

        all_e = [dict(r) for r in rows]
        if not all_e:
            return None

        e30  = [e for e in all_e if e["entry_date"] >= d30]
        if not e30:
            return None
        r7   = [e for e in e30 if e["entry_date"] >= d7]
        o7   = [e for e in e30 if e["entry_date"] >= d14 and e["entry_date"] < d7]
        p30  = [e for e in all_e if e["entry_date"] < d30]

        def moods(lst): return [e["mood_score"] for e in lst if e["mood_score"] is not None]
        def sevs(lst):  return [float(e["severity"]) for e in lst if e["severity"] is not None]
        def txts(lst):  return [e["normalized_text"] or "" for e in lst]

        avg = lambda lst: round(sum(lst)/len(lst), 1) if lst else None

        am7  = avg(moods(r7));  amp = avg(moods(o7))
        as7  = avg(sevs(r7));   asp = avg(sevs(o7))
        am30 = avg(moods(e30)); amp30 = avg(moods(p30))

        mood_trend    = _trend(moods(r7), moods(o7))
        stress_trend  = _trend(sevs(r7),  sevs(o7))

        cr  = _count_kw(txts(r7),  CONFLICT_KEYWORDS)
        co  = _count_kw(txts(o7),  CONFLICT_KEYWORDS)
        c30 = _count_kw(txts(e30), CONFLICT_KEYWORDS)
        sr  = _count_kw(txts(r7),  STRESS_KEYWORDS)
        so  = _count_kw(txts(o7),  STRESS_KEYWORDS)
        pr  = _count_kw(txts(r7),  POSITIVE_KEYWORDS)
        po  = _count_kw(txts(o7),  POSITIVE_KEYWORDS)
        fin = _count_kw(txts(e30), FINANCIAL_KEYWORDS)

        conflict_trend = "rising" if cr > co + 1 else "falling" if co > cr + 1 else "stable"

        ep = conn.execute("""
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
                   MAX(updated_at) as last_updated
            FROM exit_plan_tasks WHERE plan_id IN (
                SELECT id FROM exit_plans WHERE user_id = ?
            )
        """, (user_id,)).fetchone()

        ep_pct  = None
        ep_idle = None
        if ep and ep["total"]:
            ep_pct = round((ep["done"] or 0) / ep["total"] * 100)
            if ep["last_updated"]:
                try:
                    from datetime import datetime
                    last = datetime.fromisoformat(ep["last_updated"].replace("Z", ""))
                    ep_idle = (datetime.now() - last).days
                except Exception:
                    pass

        latest     = e30[0]
        excerpts   = []
        for e in e30[:8]:
            t = (e["normalized_text"] or "").strip()
            if t:
                excerpts.append(f"[{e['entry_date']} | mood:{e['mood_score']} sev:{e['severity']}] {t[:350]}")

        reasoning = {
            "emotional_state": [
                f"{len(e30)} entries analysed (last 30 days)",
                f"7-day avg mood: {am7} (prior week: {amp})",
                f"7-day avg severity: {as7} (prior week: {asp})",
                f"Mood trend: {mood_trend} | Stress trend: {stress_trend}",
            ],
            "getting_worse": [
                f"Conflict keywords: {cr} (recent 7d) vs {co} (prior 7d)",
                f"Stress keywords: {sr} (recent 7d) vs {so} (prior 7d)",
                f"Severity trend: {stress_trend}",
            ],
            "getting_better": [
                f"Positive keywords: {pr} (recent 7d) vs {po} (prior 7d)",
                f"Mood trend: {mood_trend}",
                f"30-day avg mood: {am30} (prior 30d: {amp30})",
            ],
            "biggest_risk": [
                f"7-day avg severity: {as7}/10",
                f"Conflict mentions (30d): {c30}",
                f"Stress trend: {stress_trend}",
            ],
            "most_important_decision": [
                f"Exit plan progress: {ep_pct}%" if ep_pct is not None else "No exit plan created",
                f"Financial mentions (30d): {fin}",
                f"Latest entry: {latest['entry_date']} | severity {latest['severity']}",
            ],
            "avoiding": [
                f"Exit plan idle: {ep_idle} days since last update" if ep_idle else "No exit plan activity tracked",
                f"Conflict trend: {conflict_trend}",
            ],
            "do_today": [
                f"Based on severity trend ({stress_trend}), latest severity {latest['severity']}",
                f"Conflict activity: {cr} keywords in last 7 days",
            ],
            "stop_doing": [
                f"Pattern identified across {len(e30)} entries",
                f"Stress keyword frequency: {sr} per 7 days",
            ],
            "independence_note": [
                f"Exit plan: {ep_pct}% complete" if ep_pct is not None else "No exit plan created yet",
                f"Idle: {ep_idle} days" if ep_idle is not None else "",
                f"Financial mentions: {fin} in last 30 days",
            ],
        }
        reasoning = {k: [b for b in v if b] for k, v in reasoning.items()}

        return {
            "latest_date":       latest["entry_date"],
            "latest_mood":       latest["mood_score"],
            "latest_sev":        float(latest["severity"]) if latest["severity"] else None,
            "avg_mood_7d":       am7,
            "avg_mood_prev":     amp,
            "avg_sev_7d":        as7,
            "avg_sev_prev":      asp,
            "mood_trend":        mood_trend,
            "stress_trend":      stress_trend,
            "conflict_trend":    conflict_trend,
            "conflict_recent":   cr,
            "conflict_older":    co,
            "stress_recent":     sr,
            "stress_older":      so,
            "positive_recent":   pr,
            "positive_older":    po,
            "financial_30d":     fin,
            "exit_plan_pct":     ep_pct,
            "exit_plan_idle_days": ep_idle,
            "total_entries_30d": len(e30),
            "excerpts":          excerpts,
            "reasoning":         reasoning,
        }

    def _generate_brief(user_id, stats):
        excerpt_block = "\n".join(stats["excerpts"]) if stats["excerpts"] else "(no entries)"
        user_prompt = f"""JOURNAL STATISTICS:
- Entries: {stats['total_entries_30d']} (last 30 days)
- Latest: {stats['latest_date']} | mood: {stats['latest_mood']} | severity: {stats['latest_sev']}
- 7d avg mood: {stats['avg_mood_7d']} (prior: {stats['avg_mood_prev']}) | trend: {stats['mood_trend']}
- 7d avg severity: {stats['avg_sev_7d']} (prior: {stats['avg_sev_prev']}) | stress trend: {stats['stress_trend']}
- Conflict keywords: {stats['conflict_recent']} recent vs {stats['conflict_older']} prior | trend: {stats['conflict_trend']}
- Stress keywords: {stats['stress_recent']} recent vs {stats['stress_older']} prior
- Positive keywords: {stats['positive_recent']} recent vs {stats['positive_older']} prior
- Financial mentions (30d): {stats['financial_30d']}
- Exit plan: {stats['exit_plan_pct']}% complete | idle: {stats['exit_plan_idle_days']} days

RECENT JOURNAL EXCERPTS:
{excerpt_block}

Describe patterns only. Do not diagnose. Generate the daily brief JSON."""

        try:
            raw = create_message(
                user_id=user_id,
                system=_SYSTEM,
                user_prompt=user_prompt,
                max_tokens=1000,
                call_type="today_brief",
            )
            text = raw.strip()
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            return json.loads(text.strip())
        except Exception as e:
            logger.error(f"today brief AI error: {e}")
            return {
                "emotional_state": "Unable to generate brief — check your API key in Settings.",
                "getting_worse": None, "getting_better": None, "biggest_risk": None,
                "most_important_decision": None, "avoiding": None,
                "do_today": None, "stop_doing": None, "independence_note": None,
                "time_horizons": {"today": None, "this_week": None, "this_month": None, "long_term": None},
                "trajectory": {
                    "mood": stats.get("mood_trend", "stable"),
                    "conflict": stats.get("conflict_trend", "stable"),
                    "independence": "stable", "stress": stats.get("stress_trend", "stable"),
                    "overall": "neutral", "summary": None, "changes_if": [],
                },
            }

    @app.get("/api/today")
    async def get_today_brief(user=Depends(require_any_user)):
        today_key = date.today().isoformat()
        conn = get_db()
        try:
            cached = conn.execute(
                "SELECT brief_json FROM today_brief_cache WHERE user_id = ? AND date_key = ?",
                (user["id"], today_key)
            ).fetchone()
            if cached:
                data = json.loads(cached["brief_json"])
                return {"date": today_key, "cached": True, **data}

            stats = _aggregate(user["id"], conn)
            if not stats:
                return {"date": today_key, "cached": False, "no_data": True,
                        "message": "No journal entries found. Start writing to get your daily brief."}

            brief = _generate_brief(user["id"], stats)

            result = {
                "date": today_key, "cached": False,
                "stats": {
                    "latest_date":       stats["latest_date"],
                    "latest_mood":       stats["latest_mood"],
                    "latest_sev":        stats["latest_sev"],
                    "avg_mood_7d":       stats["avg_mood_7d"],
                    "avg_mood_prev":     stats["avg_mood_prev"],
                    "avg_sev_7d":        stats["avg_sev_7d"],
                    "avg_sev_prev":      stats["avg_sev_prev"],
                    "mood_trend":        stats["mood_trend"],
                    "stress_trend":      stats["stress_trend"],
                    "conflict_trend":    stats["conflict_trend"],
                    "conflict_recent":   stats["conflict_recent"],
                    "conflict_older":    stats["conflict_older"],
                    "stress_recent":     stats["stress_recent"],
                    "stress_older":      stats["stress_older"],
                    "positive_recent":   stats["positive_recent"],
                    "positive_older":    stats["positive_older"],
                    "exit_plan_pct":     stats["exit_plan_pct"],
                    "exit_plan_idle_days": stats["exit_plan_idle_days"],
                    "total_entries_30d": stats["total_entries_30d"],
                },
                "reasoning": stats["reasoning"],
                "brief": brief,
            }

            conn.execute("""
                INSERT OR REPLACE INTO today_brief_cache (user_id, date_key, brief_json, generated_at)
                VALUES (?, ?, ?, datetime('now'))
            """, (user["id"], today_key, json.dumps(result)))
            conn.commit()
            return result
        finally:
            conn.close()

    @app.post("/api/today/refresh")
    async def refresh_today_brief(user=Depends(require_any_user)):
        today_key = date.today().isoformat()
        conn = get_db()
        try:
            conn.execute(
                "DELETE FROM today_brief_cache WHERE user_id = ? AND date_key = ?",
                (user["id"], today_key)
            )
            conn.commit()
        finally:
            conn.close()
        return await get_today_brief(user=user)
