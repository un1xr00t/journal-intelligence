"""
src/api/mental_health_routes.py
My Mental Health — AI-powered dashboard

Cache strategy:
  - Stats cache: keyed by user_id + last_entry_id. Recomputed only when new entries arrive.
  - Narrative cache: keyed by user_id + ISO week. One AI call per user per week.
  - Force-refresh narrative: POST /api/mental-health/narrative/refresh
"""

import json
import logging
import math
import re
from collections import defaultdict
from datetime import datetime, timedelta, date
from fastapi import Depends

logger = logging.getLogger(__name__)

# ── Emotional keyword list ────────────────────────────────────────────────────
EMOTIONAL_KEYWORDS = [
    "exhausted", "scared", "hopeless", "angry", "grateful", "hopeful",
    "overwhelmed", "happy", "proud", "sad", "anxious", "calm", "tired",
    "frustrated", "loved", "alone", "ashamed", "strong", "stuck",
    "relieved", "confused", "numb", "rage", "peace",
]

# ── AI narrative system prompt ────────────────────────────────────────────────
_NARRATIVE_SYSTEM = """You are a compassionate, honest mental health companion reviewing someone's journal data.
Write a 3-4 paragraph personal narrative for this person based on their computed journal statistics.

Rules:
- Second person ("you"), warm and direct, not clinical
- NEVER diagnose, label, or use clinical terms
- Reference the actual numbers and patterns naturally — don't just list them
- Acknowledge what's hard AND what's working
- End with one specific, actionable observation they might not have noticed
- No headers, no bullet points — flowing paragraphs only
- 200-280 words total"""


def _get_iso_week(dt: date) -> str:
    return f"{dt.isocalendar()[0]}-W{dt.isocalendar()[1]:02d}"


def register_mental_health_routes(app, require_any_user):
    from src.auth.auth_db import get_db
    from src.api.ai_client import create_message

    # ── Auto-migrate tables ───────────────────────────────────────────────────

    def _migrate():
        conn = get_db()
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS mental_health_stats_cache (
                user_id       INTEGER PRIMARY KEY,
                stats_json    TEXT    NOT NULL,
                last_entry_id INTEGER NOT NULL DEFAULT 0,
                computed_at   TEXT    NOT NULL
            );
            CREATE TABLE IF NOT EXISTS mental_health_narrative (
                user_id       INTEGER NOT NULL,
                week_key      TEXT    NOT NULL,
                narrative     TEXT    NOT NULL,
                quotes_json   TEXT    NOT NULL DEFAULT '[]',
                generated_at  TEXT    NOT NULL,
                input_tokens  INTEGER DEFAULT 0,
                output_tokens INTEGER DEFAULT 0,
                PRIMARY KEY (user_id, week_key)
            );
        """)
        conn.commit()
        conn.close()

    _migrate()

    # ── Pure-Python stat computation ──────────────────────────────────────────

    def _compute_stats(user_id: int, conn) -> dict:
        today = date.today()
        d30_start = (today - timedelta(days=29)).isoformat()
        d60_start = (today - timedelta(days=59)).isoformat()
        d84_start = (today - timedelta(days=83)).isoformat()

        rows = conn.execute("""
            SELECT e.entry_date, e.normalized_text, e.id,
                   ds.mood_score, ds.severity, ds.tags, ds.entities,
                   ds.notable_quotes
            FROM entries e
            JOIN derived_summaries ds ON ds.entry_id = e.id
            WHERE e.user_id = ? AND e.is_current = 1 AND ds.severity IS NOT NULL
              AND e.entry_date >= ?
            ORDER BY e.entry_date ASC
        """, (user_id, d84_start)).fetchall()

        entries = [dict(r) for r in rows]

        def _parse_tags(raw):
            if not raw:
                return []
            try:
                v = json.loads(raw) if isinstance(raw, str) else raw
                return [str(t).lower().strip() for t in v if t]
            except Exception:
                return []

        def _parse_entities(raw):
            if not raw:
                return []
            try:
                v = json.loads(raw) if isinstance(raw, str) else raw
                persons = []
                for e in v:
                    t = (e.get("type") or e.get("entity_type") or "").lower()
                    if t in ("person", "human", "individual", "per"):
                        n = (e.get("name") or "").strip()
                        if n:
                            persons.append(n)
                return persons
            except Exception:
                return []

        def _parse_quotes(raw):
            if not raw:
                return []
            try:
                return json.loads(raw) if isinstance(raw, str) else raw
            except Exception:
                return []

        # ── Split into periods ────────────────────────────────────────────────
        cur_entries = [e for e in entries if e["entry_date"] >= d30_start]
        prev_entries = [e for e in entries if e["entry_date"] < d30_start and e["entry_date"] >= d60_start]
        cal_entries = entries  # all 84 days for calendar

        def _safe_avg(vals):
            vals = [v for v in vals if v is not None]
            return round(sum(vals) / len(vals), 2) if vals else None

        def _std_dev(vals):
            vals = [float(v) for v in vals if v is not None]
            if len(vals) < 2:
                return 0.0
            m = sum(vals) / len(vals)
            variance = sum((x - m) ** 2 for x in vals) / (len(vals) - 1)
            return round(math.sqrt(variance), 2)

        # ── Core metrics (current 30d) ────────────────────────────────────────
        cur_moods = [e["mood_score"] for e in cur_entries if e["mood_score"] is not None]
        cur_sevs = [float(e["severity"]) for e in cur_entries if e["severity"] is not None]
        prev_moods = [e["mood_score"] for e in prev_entries if e["mood_score"] is not None]
        prev_sevs = [float(e["severity"]) for e in prev_entries if e["severity"] is not None]

        avg_mood = _safe_avg(cur_moods)
        avg_sev = _safe_avg(cur_sevs)
        prev_avg_mood = _safe_avg(prev_moods)
        prev_avg_sev = _safe_avg(prev_sevs)

        mood_delta = round(avg_mood - prev_avg_mood, 2) if avg_mood and prev_avg_mood else None
        sev_delta = round(avg_sev - prev_avg_sev, 2) if avg_sev and prev_avg_sev else None

        # Mood deltas for volatility
        mood_deltas = []
        for i in range(1, len(cur_entries)):
            pm = cur_entries[i - 1].get("mood_score")
            cm = cur_entries[i].get("mood_score")
            if pm is not None and cm is not None:
                mood_deltas.append(cm - pm)

        volatility = _std_dev(mood_deltas) if mood_deltas else 0.0

        # ── Recovery speed ────────────────────────────────────────────────────
        recovery_days = []
        all_sevs = [float(e["severity"]) if e["severity"] is not None else 5.0 for e in entries]
        for i, sev in enumerate(all_sevs):
            if sev >= 7.0:
                for j in range(i + 1, min(i + 21, len(all_sevs))):
                    if all_sevs[j] < 6.0:
                        recovery_days.append(j - i)
                        break
        avg_recovery = round(sum(recovery_days) / len(recovery_days), 1) if recovery_days else None

        # ── Journaling stats ──────────────────────────────────────────────────
        cur_dates = set(e["entry_date"] for e in cur_entries)
        days_journaled = len(cur_dates)
        high_distress_days = sum(1 for e in cur_entries if float(e["severity"] or 0) >= 7.0)
        low_distress_days = sum(1 for e in cur_entries if float(e["severity"] or 0) <= 4.0)
        prev_days_journaled = len(set(e["entry_date"] for e in prev_entries))
        prev_high_distress = sum(1 for e in prev_entries if float(e["severity"] or 0) >= 7.0)

        # ── Current streak ────────────────────────────────────────────────────
        all_dated = set(e["entry_date"] for e in entries)
        streak = 0
        check = today
        while check.isoformat() in all_dated:
            streak += 1
            check -= timedelta(days=1)

        # ── Mood calendar (84 days) ───────────────────────────────────────────
        date_to_sev = {}
        for e in cal_entries:
            d = e["entry_date"]
            sev = float(e["severity"]) if e["severity"] is not None else None
            if sev:
                if d not in date_to_sev:
                    date_to_sev[d] = []
                date_to_sev[d].append(sev)

        calendar = []
        for i in range(83, -1, -1):
            d = (today - timedelta(days=i)).isoformat()
            if d in date_to_sev:
                avg = sum(date_to_sev[d]) / len(date_to_sev[d])
                calendar.append({"date": d, "severity": round(avg, 1)})
            else:
                calendar.append({"date": d, "severity": None})

        # ── Trigger map ───────────────────────────────────────────────────────
        tag_data = defaultdict(list)
        for e in cur_entries:
            sev = float(e["severity"]) if e["severity"] else 5.0
            for tag in _parse_tags(e["tags"]):
                tag_data[tag].append(sev)

        stressors = []
        protectors = []
        for tag, sevs in tag_data.items():
            if len(sevs) < 2:
                continue
            avg = sum(sevs) / len(sevs)
            if avg >= 6.5:
                stressors.append({"topic": tag, "avg_severity": round(avg, 1), "count": len(sevs)})
            elif avg <= 4.5:
                protectors.append({"topic": tag, "avg_severity": round(avg, 1), "count": len(sevs)})

        stressors.sort(key=lambda x: -x["avg_severity"])
        protectors.sort(key=lambda x: x["avg_severity"])

        # ── Emotional keyword frequency ───────────────────────────────────────
        def _count_keywords(entry_list):
            counts = defaultdict(int)
            for e in entry_list:
                text = (e.get("normalized_text") or "").lower()
                for kw in EMOTIONAL_KEYWORDS:
                    counts[kw] += len(re.findall(r'\b' + kw + r'\b', text))
            return counts

        cur_kw = _count_keywords(cur_entries)
        prev_kw = _count_keywords(prev_entries)

        keyword_shifts = []
        for kw in EMOTIONAL_KEYWORDS:
            c = cur_kw[kw]
            p = prev_kw[kw]
            if c == 0 and p == 0:
                continue
            if p == 0:
                pct = 100 if c > 0 else 0
            else:
                pct = round(((c - p) / p) * 100)
            if abs(pct) >= 10 or c >= 2:
                keyword_shifts.append({"keyword": kw, "current": c, "prior": p, "pct_change": pct})

        keyword_shifts.sort(key=lambda x: -abs(x["pct_change"]))

        # ── Day of week ───────────────────────────────────────────────────────
        dow_sums = defaultdict(list)
        for e in cur_entries:
            d_obj = date.fromisoformat(e["entry_date"])
            dow = d_obj.weekday()  # 0=Mon
            dow_sums[dow].append(float(e["severity"] or 5.0))

        dow_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        day_of_week = [
            {"day": dow_labels[i], "avg_severity": round(sum(dow_sums[i]) / len(dow_sums[i]), 1) if dow_sums[i] else None}
            for i in range(7)
        ]

        # ── People impact ─────────────────────────────────────────────────────
        person_data = defaultdict(lambda: {"mentions": 0, "sev_sum": 0.0, "distress": 0, "support": 0})
        for e in cur_entries:
            sev = float(e["severity"] or 5.0)
            for name in _parse_entities(e["entities"]):
                person_data[name]["mentions"] += 1
                person_data[name]["sev_sum"] += sev
                if sev >= 7.0:
                    person_data[name]["distress"] += 1
                elif sev <= 4.0:
                    person_data[name]["support"] += 1

        people_impact = []
        for name, d in person_data.items():
            if d["mentions"] < 2:
                continue
            avg_p_sev = d["sev_sum"] / d["mentions"]
            distress_ratio = d["distress"] / d["mentions"]
            people_impact.append({
                "name": name,
                "mentions": d["mentions"],
                "avg_severity": round(avg_p_sev, 1),
                "distress_ratio": round(distress_ratio, 2),
                "distress_entries": d["distress"],
                "support_entries": d["support"],
            })
        people_impact.sort(key=lambda x: -x["avg_severity"])

        # ── Notable quotes ────────────────────────────────────────────────────
        notable_quotes = []
        for e in sorted(cur_entries, key=lambda x: -(float(x["severity"] or 0))):
            quotes = _parse_quotes(e["notable_quotes"])
            for q in quotes[:1]:
                text = q if isinstance(q, str) else (q.get("text") or "")
                if text and len(text) > 20:
                    notable_quotes.append({"text": text, "date": e["entry_date"]})
            if len(notable_quotes) >= 3:
                break

        return {
            "period_days": 30,
            "avg_mood": avg_mood,
            "avg_severity": avg_sev,
            "mood_delta": mood_delta,
            "sev_delta": sev_delta,
            "volatility": volatility,
            "recovery_speed_days": avg_recovery,
            "days_journaled": days_journaled,
            "streak": streak,
            "high_distress_days": high_distress_days,
            "low_distress_days": low_distress_days,
            "prev_days_journaled": prev_days_journaled,
            "prev_high_distress": prev_high_distress,
            "calendar": calendar,
            "stressors": stressors[:6],
            "protectors": protectors[:6],
            "keyword_shifts": keyword_shifts[:8],
            "day_of_week": day_of_week,
            "people_impact": people_impact[:5],
            "notable_quotes": notable_quotes,
            "total_entries_30d": len(cur_entries),
        }

    # ── AI narrative generator ────────────────────────────────────────────────

    def _generate_narrative(user_id: int, stats: dict, conn) -> dict:
        lines = [
            f"Period: last 30 days",
            f"Wellbeing (mood avg): {stats.get('avg_mood')} (prev period: delta {stats.get('mood_delta')})",
            f"Avg severity: {stats.get('avg_severity')} (delta: {stats.get('sev_delta')})",
            f"Mood volatility: {stats.get('volatility')} (higher = more up-and-down)",
            f"Recovery speed: {stats.get('recovery_speed_days')} days avg to return to baseline after a spike",
            f"Days journaled: {stats.get('days_journaled')}/30",
            f"High-distress days (severity 7+): {stats.get('high_distress_days')}",
            f"Low-distress days (severity 4 or under): {stats.get('low_distress_days')}",
            f"Current journaling streak: {stats.get('streak')} days",
        ]

        stressors = stats.get("stressors", [])
        if stressors:
            lines.append("Top stressors by avg severity when they appear: " +
                         ", ".join(f"{s['topic']} ({s['avg_severity']})" for s in stressors[:4]))

        protectors = stats.get("protectors", [])
        if protectors:
            lines.append("Protective topics (appear in lower-severity entries): " +
                         ", ".join(f"{p['topic']} ({p['avg_severity']})" for p in protectors[:4]))

        dow = stats.get("day_of_week", [])
        worst_day = max((d for d in dow if d["avg_severity"]), key=lambda x: x["avg_severity"], default=None)
        best_day = min((d for d in dow if d["avg_severity"]), key=lambda x: x["avg_severity"], default=None)
        if worst_day:
            lines.append(f"Worst day of week: {worst_day['day']} (avg sev {worst_day['avg_severity']})")
        if best_day:
            lines.append(f"Best day of week: {best_day['day']} (avg sev {best_day['avg_severity']})")

        kw = stats.get("keyword_shifts", [])
        rising_kw = [k for k in kw if k["pct_change"] > 0][:3]
        falling_kw = [k for k in kw if k["pct_change"] < 0][:2]
        if rising_kw:
            lines.append("Emotional words used more this period: " +
                         ", ".join(f"{k['keyword']} (+{k['pct_change']}%)" for k in rising_kw))
        if falling_kw:
            lines.append("Emotional words used less: " +
                         ", ".join(f"{k['keyword']} ({k['pct_change']}%)" for k in falling_kw))

        quotes = stats.get("notable_quotes", [])
        if quotes:
            lines.append("Notable quotes from this period:")
            for q in quotes[:2]:
                lines.append(f'  "{q["text"]}"')

        prompt = "Here is the journal analysis data for this person:\n\n" + "\n".join(lines)
        prompt += "\n\nWrite the narrative now."

        try:
            narrative_text = create_message(
                user_id=user_id,
                system=_NARRATIVE_SYSTEM,
                user_prompt=prompt,
                max_tokens=600,
                call_type="mental_health_narrative",
            )
            input_tokens = 0
            output_tokens = 0
        except Exception as ex:
            logger.warning(f"[mental_health] AI narrative failed: {ex}")
            narrative_text = ""
            input_tokens = 0
            output_tokens = 0

        week_key = _get_iso_week(date.today())
        quotes_json = json.dumps([q["text"] for q in (stats.get("notable_quotes") or [])])

        conn.execute("""
            INSERT OR REPLACE INTO mental_health_narrative
              (user_id, week_key, narrative, quotes_json, generated_at, input_tokens, output_tokens)
            VALUES (?, ?, ?, ?, datetime('now'), ?, ?)
        """, (user_id, week_key, narrative_text, quotes_json, input_tokens, output_tokens))
        conn.commit()

        return {
            "narrative": narrative_text,
            "quotes": stats.get("notable_quotes", []),
            "week_key": week_key,
            "cached": False,
            "generated_at": datetime.utcnow().isoformat(),
        }

    # ── Routes ────────────────────────────────────────────────────────────────

    @app.get("/api/mental-health/dashboard")
    async def get_mental_health_dashboard(
        refresh_narrative: bool = False,
        user: dict = Depends(require_any_user),
    ):
        user_id = user["id"]
        conn = get_db()
        try:
            # ── Get max entry id for cache invalidation ──────────────────────
            max_row = conn.execute(
                "SELECT MAX(id) as max_id FROM entries WHERE user_id = ? AND is_current = 1",
                (user_id,)
            ).fetchone()
            max_entry_id = max_row["max_id"] or 0

            # ── Stats cache check ─────────────────────────────────────────────
            cache_row = conn.execute(
                "SELECT stats_json, last_entry_id, computed_at FROM mental_health_stats_cache WHERE user_id = ?",
                (user_id,)
            ).fetchone()

            if cache_row and int(cache_row["last_entry_id"]) == max_entry_id:
                stats = json.loads(cache_row["stats_json"])
                stats_cached = True
                logger.info(f"[mental_health] stats cache_hit user={user_id}")
            else:
                stats = _compute_stats(user_id, conn)
                stats_json = json.dumps(stats)
                conn.execute("""
                    INSERT OR REPLACE INTO mental_health_stats_cache
                      (user_id, stats_json, last_entry_id, computed_at)
                    VALUES (?, ?, ?, datetime('now'))
                """, (user_id, stats_json, max_entry_id))
                conn.commit()
                stats_cached = False
                logger.info(f"[mental_health] stats recomputed user={user_id} last_entry={max_entry_id}")

            # ── Narrative cache check ─────────────────────────────────────────
            week_key = _get_iso_week(date.today())
            narrative_row = conn.execute(
                "SELECT narrative, quotes_json, generated_at FROM mental_health_narrative WHERE user_id = ? AND week_key = ?",
                (user_id, week_key)
            ).fetchone()

            if narrative_row and not refresh_narrative:
                narrative_data = {
                    "narrative": narrative_row["narrative"],
                    "quotes": json.loads(narrative_row["quotes_json"] or "[]"),
                    "week_key": week_key,
                    "cached": True,
                    "generated_at": narrative_row["generated_at"],
                }
                logger.info(f"[mental_health] narrative cache_hit user={user_id} week={week_key}")
            else:
                # Get user settings for AI call
                settings_row = conn.execute(
                    "SELECT ai_provider, ai_api_key, ai_model FROM user_settings WHERE user_id = ?",
                    (user_id,)
                ).fetchone()
                user_settings = dict(settings_row) if settings_row else {}
                narrative_data = _generate_narrative(user_id, stats, conn)

            return {
                "stats": stats,
                "narrative": narrative_data,
                "stats_cached": stats_cached,
                "computed_at": cache_row["computed_at"] if stats_cached and cache_row else datetime.utcnow().isoformat(),
            }
        finally:
            conn.close()

    @app.post("/api/mental-health/narrative/refresh")
    async def refresh_mental_health_narrative(user: dict = Depends(require_any_user)):
        """Force-regenerate this week's AI narrative."""
        user_id = user["id"]
        conn = get_db()
        try:
            week_key = _get_iso_week(date.today())
            conn.execute(
                "DELETE FROM mental_health_narrative WHERE user_id = ? AND week_key = ?",
                (user_id, week_key)
            )
            conn.commit()

            # Grab stats from cache
            cache_row = conn.execute(
                "SELECT stats_json FROM mental_health_stats_cache WHERE user_id = ?",
                (user_id,)
            ).fetchone()
            stats = json.loads(cache_row["stats_json"]) if cache_row else _compute_stats(user_id, conn)

            settings_row = conn.execute(
                "SELECT ai_provider, ai_api_key, ai_model FROM user_settings WHERE user_id = ?",
                (user_id,)
            ).fetchone()
            user_settings = dict(settings_row) if settings_row else {}

            narrative_data = _generate_narrative(user_id, stats, conn)
            return {"ok": True, "narrative": narrative_data}
        finally:
            conn.close()
