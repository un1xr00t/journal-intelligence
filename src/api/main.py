"""
src/api/main.py
FastAPI application — journal dashboard REST API.

Auth routes:       /auth/login, /auth/refresh, /auth/logout, /auth/me
Admin routes:      /api/admin/users, /api/admin/sessions/{uid}
Data routes:       /api/entries, /api/summary/master, /api/entities, /api/mood/trend
Pattern routes:    /api/patterns/run, /api/patterns/alerts, /api/patterns/contradictions
Evidence routes:   /api/evidence
Bookmark route:    /api/entries/{id}/bookmark
Upload route:      /api/upload  (API key auth — iPhone Shortcut)
Export routes:     /api/export/generate, /api/export/{id}
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import (
    FastAPI, Depends, HTTPException, status,
    Request, Response, BackgroundTasks
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yaml
from pathlib import Path

from src.auth.auth_service import (
    verify_password,
    create_token_pair,
    hash_refresh_token,
    decode_access_token,
)
from src.auth.auth_db import (
    get_user_by_username,
    get_user_by_id,
    update_last_login,
    store_refresh_token,
    get_refresh_token,
    update_refresh_token_used,
    revoke_refresh_token,
    revoke_all_user_tokens,
    log_auth_event,
    check_rate_limit,
    reset_rate_limit,
)
from src.auth.auth_db import (
    store_user_api_key,
    get_api_key_info,
)
from src.auth.middleware import (
    get_current_user,
    require_owner,
    require_any_user,
    verify_api_key,
    get_client_ip,
    get_user_agent,
    get_device_hint,
)

# ── Config ────────────────────────────────────────────────────────────────────

from src.config import CONFIG_PATH, AUDIT_LOG, load_config


def load_config() -> dict:
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


config = load_config()

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Journal Dashboard API",
    description="Personal journal intelligence system API",
    version="3.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config["cors"]["allowed_origins"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response models ─────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict


class RefreshRequest(BaseModel):
    refresh_token: str


class MessageResponse(BaseModel):
    message: str


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str


class CreateUserRequest(BaseModel):
    username: str
    email: str
    password: str
    role: str = "viewer"


class EvidenceCreate(BaseModel):
    entry_id: Optional[int] = None
    alert_id: Optional[int] = None
    label: str
    quote_text: Optional[str] = None
    evidence_type: str = "statement"  # statement|event|admission|contradiction|observation
    source_date: str
    is_bookmarked: bool = False


class TherapistInsightRequest(BaseModel):
    tone: str = "therapist"
    force: bool = False


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}


# ── Auth routes ───────────────────────────────────────────────────────────────

@app.post("/auth/login", response_model=TokenResponse)
async def login(request: Request, body: LoginRequest):
    ip = get_client_ip(request)
    ua = get_user_agent(request)

    if not check_rate_limit(ip, "login"):
        log_auth_event("rate_limited", ip_address=ip, user_agent=ua,
                       details={"username": body.username})
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please try again later."
        )

    user = get_user_by_username(body.username)

    if not user:
        log_auth_event("failed", ip_address=ip, user_agent=ua,
                       details={"username": body.username, "reason": "user_not_found"})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid username or password")

    if not user["password_hash"] or not verify_password(body.password, user["password_hash"]):
        log_auth_event("failed", user_id=user["id"], ip_address=ip, user_agent=ua,
                       details={"reason": "invalid_password"})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid username or password")

    if not user["is_active"]:
        log_auth_event("failed", user_id=user["id"], ip_address=ip, user_agent=ua,
                       details={"reason": "account_deactivated"})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Account is deactivated")

    tokens = create_token_pair(user["id"], user["username"], user["role"])

    store_refresh_token(
        user_id=user["id"],
        token_hash=tokens["refresh_token_hash"],
        expires_at=tokens["refresh_expires_at"],
        device_hint=get_device_hint(request),
        ip_address=ip,
    )

    update_last_login(user["id"])
    reset_rate_limit(ip, "login")
    log_auth_event("login", user_id=user["id"], ip_address=ip, user_agent=ua)

    return {
        "access_token": tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
        "token_type": "bearer",
        "expires_in": tokens["expires_in"],
        "user": {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"],
            "role": user["role"],
        },
    }


@app.post("/auth/refresh", response_model=TokenResponse)
async def refresh_token(request: Request, body: RefreshRequest):
    ip = get_client_ip(request)
    ua = get_user_agent(request)

    if not check_rate_limit(ip, "refresh"):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                            detail="Too many refresh attempts. Please try again later.")

    token_hash = hash_refresh_token(body.refresh_token)
    token_record = get_refresh_token(token_hash)

    if not token_record:
        log_auth_event("failed", ip_address=ip, user_agent=ua,
                       details={"reason": "refresh_token_not_found"})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid refresh token")

    if token_record["revoked"]:
        log_auth_event("failed", user_id=token_record["user_id"], ip_address=ip, user_agent=ua,
                       details={"reason": "refresh_token_revoked"})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Refresh token has been revoked")

    expires_at = datetime.fromisoformat(token_record["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at < datetime.now(timezone.utc):
        log_auth_event("failed", user_id=token_record["user_id"], ip_address=ip, user_agent=ua,
                       details={"reason": "refresh_token_expired"})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Refresh token has expired")

    if not token_record["is_active"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="User account is deactivated")

    update_refresh_token_used(token_hash)
    tokens = create_token_pair(
        token_record["user_id"], token_record["username"], token_record["role"]
    )
    log_auth_event("refresh", user_id=token_record["user_id"], ip_address=ip, user_agent=ua)

    return {
        "access_token": tokens["access_token"],
        "refresh_token": body.refresh_token,
        "token_type": "bearer",
        "expires_in": tokens["expires_in"],
        "user": {
            "id": token_record["user_id"],
            "username": token_record["username"],
            "email": get_user_by_id(token_record["user_id"])["email"],
            "role": token_record["role"],
        },
    }


@app.post("/auth/logout", response_model=MessageResponse)
async def logout(
    request: Request,
    body: RefreshRequest,
    current_user: dict = Depends(get_current_user),
):
    ip = get_client_ip(request)
    ua = get_user_agent(request)
    token_hash = hash_refresh_token(body.refresh_token)
    revoked = revoke_refresh_token(token_hash)
    log_auth_event("logout", user_id=current_user["id"], ip_address=ip, user_agent=ua,
                   details={"revoked": revoked})
    return {"message": "Logged out successfully"}


@app.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return {
        "id": current_user["id"],
        "username": current_user["username"],
        "email": current_user["email"],
        "role": current_user["role"],
    }


# ── API Key management ────────────────────────────────────────────────────────

@app.get("/api/auth/api-key")
async def get_api_key_status(current_user: dict = Depends(require_any_user)):
    """Return whether the user has an API key and its prefix (for display)."""
    info = get_api_key_info(current_user["id"])
    if info:
        return info  # {"has_key": True, "prefix": "jd_a1b2c3"}
    return {"has_key": False, "prefix": None}


@app.post("/api/auth/api-key/regenerate")
async def regenerate_api_key(current_user: dict = Depends(require_any_user)):
    """Generate (or regenerate) the user's API key. Returns the raw key once — never stored."""
    from src.auth.auth_service import generate_user_api_key
    key = generate_user_api_key()
    store_user_api_key(current_user["id"], key["hash"], key["prefix"])
    log_auth_event("api_key_generated", user_id=current_user["id"])
    return {"api_key": key["raw"], "prefix": key["prefix"]}


# ── Admin routes (owner only) ─────────────────────────────────────────────────

@app.get("/api/admin/users")
async def list_users(current_user: dict = Depends(require_owner)):
    from src.auth.auth_db import get_db

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, email, username, role, is_active, created_at, last_login
        FROM users ORDER BY created_at
    """)
    users = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return {"users": users}


@app.post("/api/admin/users")
async def create_user(
    body: CreateUserRequest,
    current_user: dict = Depends(require_owner),
):
    """Add a new user (owner only). Minimum 12-char password with complexity requirements."""
    import re
    from src.auth.auth_service import hash_password
    from src.auth.auth_db import get_db

    # Validate password complexity
    pwd = body.password
    if len(pwd) < 12:
        raise HTTPException(status_code=400, detail="Password must be at least 12 characters")
    if not re.search(r'[A-Z]', pwd):
        raise HTTPException(status_code=400, detail="Password must contain an uppercase letter")
    if not re.search(r'[a-z]', pwd):
        raise HTTPException(status_code=400, detail="Password must contain a lowercase letter")
    if not re.search(r'\d', pwd):
        raise HTTPException(status_code=400, detail="Password must contain a number")
    if not re.search(r'[^A-Za-z0-9]', pwd):
        raise HTTPException(status_code=400, detail="Password must contain a symbol")
    if body.role not in ("owner", "viewer"):
        raise HTTPException(status_code=400, detail="Role must be 'owner' or 'viewer'")

    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO users (email, username, password_hash, role, is_active, created_at)
            VALUES (?, ?, ?, ?, 1, datetime('now'))
        """, (body.email, body.username, hash_password(body.password), body.role))
        user_id = cursor.lastrowid
        conn.commit()
    except Exception as e:
        conn.close()
        if "UNIQUE" in str(e):
            raise HTTPException(status_code=409, detail="Username or email already exists")
        raise HTTPException(status_code=500, detail=str(e))
    conn.close()
    return {"id": user_id, "username": body.username, "email": body.email, "role": body.role}


@app.delete("/api/admin/users/{user_id}")
async def delete_user(
    user_id: int,
    current_user: dict = Depends(require_owner),
):
    """Remove a user account (owner only). Cannot delete yourself."""
    from src.auth.auth_db import get_db

    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    conn = get_db()
    try:
        cursor = conn.cursor()

        # Verify user exists before doing anything
        cursor.execute("SELECT id FROM users WHERE id = ?", (user_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="User not found")

        # Delete all child rows on this single connection (FK enforcement is ON).
        # Order matters: delete dependents before the parent users row.
        cursor.execute("DELETE FROM refresh_tokens WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM auth_audit WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM user_api_keys WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM alerts WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM evidence WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM rollups WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM master_summaries WHERE user_id = ?", (user_id,))
        # derived_summaries has entry_id FK → entries, must go before entries
        cursor.execute(
            "DELETE FROM derived_summaries WHERE entry_id IN "
            "(SELECT id FROM entries WHERE user_id = ?)", (user_id,)
        )
        cursor.execute("DELETE FROM entries WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM user_memory WHERE user_id = ?", (user_id,))
        # Exit plan cascade: children before parents
        cursor.execute(
            "DELETE FROM exit_plan_notes WHERE plan_id IN "
            "(SELECT id FROM exit_plans WHERE user_id = ?)", (user_id,)
        )
        cursor.execute(
            "DELETE FROM exit_plan_attachments WHERE plan_id IN "
            "(SELECT id FROM exit_plans WHERE user_id = ?)", (user_id,)
        )
        cursor.execute(
            "DELETE FROM exit_plan_events WHERE plan_id IN "
            "(SELECT id FROM exit_plans WHERE user_id = ?)", (user_id,)
        )
        cursor.execute(
            "DELETE FROM exit_plan_signal_snapshots WHERE plan_id IN "
            "(SELECT id FROM exit_plans WHERE user_id = ?)", (user_id,)
        )
        cursor.execute(
            "DELETE FROM exit_plan_tasks WHERE plan_id IN "
            "(SELECT id FROM exit_plans WHERE user_id = ?)", (user_id,)
        )
        cursor.execute(
            "DELETE FROM exit_plan_phases WHERE plan_id IN "
            "(SELECT id FROM exit_plans WHERE user_id = ?)", (user_id,)
        )
        cursor.execute("DELETE FROM exit_plans WHERE user_id = ?", (user_id,))
        # Misc user-scoped tables (IF they exist — safe to ignore if not)
        for tbl in ("resource_profiles", "reflection_cache", "user_settings"):
            try:
                cursor.execute(f"DELETE FROM {tbl} WHERE user_id = ?", (user_id,))
            except Exception:
                pass  # table may not exist on all deployments

        # Now safe to delete the user row
        cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

    return {"message": f"User {user_id} deleted"}


@app.delete("/api/admin/sessions/{user_id}")
async def revoke_user_sessions(
    user_id: int,
    request: Request,
    current_user: dict = Depends(require_owner),
):
    ip = get_client_ip(request)
    ua = get_user_agent(request)
    count = revoke_all_user_tokens(user_id)
    log_auth_event("revoke", user_id=current_user["id"], ip_address=ip, user_agent=ua,
                   details={"target_user_id": user_id, "tokens_revoked": count})
    return {"message": f"Revoked {count} session(s)", "count": count}


# ── Data routes ───────────────────────────────────────────────────────────────

@app.get("/api/summary/master")
async def get_master_summary(current_user: dict = Depends(require_any_user)):
    from src.auth.auth_db import get_db

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM master_summaries WHERE user_id = ? ORDER BY version DESC LIMIT 1",
        (current_user["id"],)
    )
    row = cursor.fetchone()
    conn.close()

    if not row:
        return {"message": "No master summary yet", "data": None}
    return {"data": dict(row)}


@app.get("/api/entries")
async def list_entries(
    limit: int = 200,
    offset: int = 0,
    search: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    mood: Optional[str] = None,
    severity_min: Optional[float] = None,
    severity_max: Optional[float] = None,
    entity: Optional[str] = None,
    current_user: dict = Depends(require_any_user),
):
    from src.auth.auth_db import get_db

    conn = get_db()
    cursor = conn.cursor()

    conditions = ["e.is_current = 1", "e.user_id = ?"]
    params: list = [current_user["id"]]

    if start_date:
        conditions.append("e.entry_date >= ?")
        params.append(start_date)
    if end_date:
        conditions.append("e.entry_date <= ?")
        params.append(end_date)
    if mood:
        conditions.append("LOWER(ds.mood_label) = LOWER(?)")
        params.append(mood)
    if severity_min is not None:
        conditions.append("ds.severity >= ?")
        params.append(severity_min)
    if severity_max is not None:
        conditions.append("ds.severity <= ?")
        params.append(severity_max)
    if search:
        conditions.append("(e.raw_text LIKE ? OR ds.summary_text LIKE ?)")
        pattern = f"%{search}%"
        params.extend([pattern, pattern])
    if entity:
        conditions.append("ds.entities LIKE ?")
        params.append(f"%{entity}%")

    where_clause = " AND ".join(conditions)

    cursor.execute(f"""
        SELECT e.id, e.entry_date, e.word_count, e.ingested_at,
               ds.summary_text, ds.mood_label, ds.mood_score, ds.severity,
               ds.tags, ds.key_events, ds.entities, ds.notable_quotes
        FROM entries e
        LEFT JOIN derived_summaries ds ON e.id = ds.entry_id
        WHERE {where_clause}
        ORDER BY e.entry_date DESC
        LIMIT ? OFFSET ?
    """, params + [limit, offset])
    entries = [dict(row) for row in cursor.fetchall()]

    cursor.execute(f"""
        SELECT COUNT(*)
        FROM entries e
        LEFT JOIN derived_summaries ds ON e.id = ds.entry_id
        WHERE {where_clause}
    """, params)
    total = cursor.fetchone()[0]

    conn.close()
    return {"entries": entries, "total": total, "limit": limit, "offset": offset}


@app.get("/api/entries/{entry_date}")
async def get_entry(
    entry_date: str,
    current_user: dict = Depends(require_any_user),
):
    from src.auth.auth_db import get_db

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT e.*, ds.*
        FROM entries e
        LEFT JOIN derived_summaries ds ON e.id = ds.entry_id
        WHERE e.entry_date = ? AND e.is_current = 1 AND e.user_id = ?
    """, (entry_date, current_user["id"]))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"data": dict(row)}


@app.get("/api/entities")
async def get_entities(current_user: dict = Depends(require_any_user)):
    import json
    from src.auth.auth_db import get_db

    PERSON_VARIANTS = {"person", "human", "individual", "per"}

    def normalise_type(raw: str) -> str:
        """Map any person-like string to 'person', everything else to 'topic'."""
        return "person" if raw.lower() in PERSON_VARIANTS else "topic"

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT ds.entities
        FROM derived_summaries ds
        JOIN entries e ON e.id = ds.entry_id
        WHERE ds.entities IS NOT NULL AND e.user_id = ? AND e.is_current = 1
    """, (current_user["id"],))

    entity_counts: dict = {}
    for row in cursor.fetchall():
        try:
            for entity in json.loads(row["entities"]):
                name = entity.get("name", "")
                # Accept both "type" and "entity_type" field names
                raw_type = entity.get("type") or entity.get("entity_type") or "topic"
                etype = normalise_type(str(raw_type))
                if name:
                    key = (name, etype)
                    entity_counts[key] = entity_counts.get(key, 0) + 1
        except (json.JSONDecodeError, TypeError):
            continue
    conn.close()

    return {
        "entities": sorted(
            [{"name": k[0], "type": k[1], "count": v} for k, v in entity_counts.items()],
            key=lambda x: x["count"],
            reverse=True,
        )
    }


@app.get("/api/mood/trend")
async def get_mood_trend(
    days: int = 30,
    current_user: dict = Depends(require_any_user),
):
    from src.auth.auth_db import get_db

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT e.entry_date, ds.mood_score, ds.mood_label, ds.severity
        FROM entries e
        JOIN derived_summaries ds ON e.id = ds.entry_id
        WHERE e.is_current = 1 AND e.user_id = ? AND ds.mood_score IS NOT NULL
        ORDER BY e.entry_date DESC
        LIMIT ?
    """, (current_user["id"], days,))
    data = [dict(row) for row in cursor.fetchall()]
    conn.close()

    data.reverse()
    return {"trend": data}


@app.get("/api/rollups")
async def get_rollups(current_user: dict = Depends(require_any_user)):
    from src.auth.auth_db import get_db

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM rollups WHERE user_id = ? ORDER BY period_start DESC LIMIT 52
    """, (current_user["id"],))
    rollups = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return {"rollups": rollups}


# ── Pattern routes ────────────────────────────────────────────────────────────

@app.get("/api/patterns/alerts")
async def get_alerts(current_user: dict = Depends(require_any_user)):
    from src.auth.auth_db import get_db

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM alerts
        WHERE acknowledged = 0 AND user_id = ?
        ORDER BY priority_score DESC, created_at DESC
    """, (current_user["id"],))
    alerts = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return {"alerts": alerts}


@app.post("/api/patterns/run")
async def run_pattern_detection(current_user: dict = Depends(require_owner)):
    """Trigger rule-based pattern detection (owner only). Also auto-runs after each upload."""
    from src.patterns.detectors import run_all_detectors
    return run_all_detectors(user_id=current_user["id"])


@app.post("/api/patterns/alerts/{alert_id}/analyze")
async def analyze_alert(
    alert_id: int,
    background_tasks: BackgroundTasks,
    force: bool = False,
    current_user: dict = Depends(require_owner),
):
    """Queue AI deep analysis for a specific alert. Result cached in alerts.ai_analysis."""
    from src.auth.auth_db import get_db

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, priority_score, ai_analysis FROM alerts WHERE id = ?", (alert_id,))
    alert = cursor.fetchone()
    conn.close()

    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert = dict(alert)
    if alert.get("ai_analysis") and not force:
        return {"status": "already_analyzed", "alert_id": alert_id}

    from src.patterns.ai_detector import run_ai_analysis
    background_tasks.add_task(run_ai_analysis, alert_id, force)
    return {"status": "queued", "alert_id": alert_id}


@app.post("/api/patterns/alerts/{alert_id}/acknowledge")
async def acknowledge_alert_route(
    alert_id: int,
    current_user: dict = Depends(require_any_user),
):
    from src.patterns.detectors import acknowledge_alert
    if not acknowledge_alert(alert_id):
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"status": "acknowledged", "alert_id": alert_id}


@app.get("/api/patterns/contradictions")
async def get_contradictions(current_user: dict = Depends(require_any_user)):
    """Return contradiction alert pairs with both statement sides. Used by Contradictions tab."""
    import json as _json
    from src.auth.auth_db import get_db

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, priority_score, date_range_start, date_range_end,
               description, ai_analysis, supporting_dates
        FROM alerts
        WHERE alert_type = 'contradiction' AND acknowledged = 0 AND user_id = ?
        ORDER BY priority_score DESC, created_at DESC
    """, (current_user["id"],))
    alerts = [dict(r) for r in cursor.fetchall()]

    results = []
    for alert in alerts:
        cursor.execute("""
            SELECT label, quote_text, source_date, entry_id
            FROM evidence
            WHERE alert_id = ? AND evidence_type = 'contradiction'
            ORDER BY source_date ASC
        """, (alert["id"],))
        ev_rows = [dict(r) for r in cursor.fetchall()]
        results.append({
            "id": alert["id"],
            "priority_score": alert["priority_score"],
            "date_a": alert["date_range_start"],
            "date_b": alert["date_range_end"],
            "description": alert["description"],
            "ai_analysis": alert.get("ai_analysis"),
            "statement_a": ev_rows[0]["quote_text"] if len(ev_rows) > 0 else "",
            "statement_b": ev_rows[1]["quote_text"] if len(ev_rows) > 1 else "",
            "entry_id_a": ev_rows[0]["entry_id"] if len(ev_rows) > 0 else None,
            "entry_id_b": ev_rows[1]["entry_id"] if len(ev_rows) > 1 else None,
        })

    conn.close()
    return {"contradictions": results}


# ── Evidence routes ───────────────────────────────────────────────────────────

@app.get("/api/evidence")
async def list_evidence(
    evidence_type: Optional[str] = None,
    bookmarked_only: bool = False,
    limit: int = 100,
    current_user: dict = Depends(require_any_user),
):
    from src.auth.auth_db import get_db

    conn = get_db()
    cursor = conn.cursor()

    query = """
        SELECT ev.*, e.entry_date
        FROM evidence ev
        LEFT JOIN entries e ON ev.entry_id = e.id
        WHERE ev.user_id = ?
    """
    params: list = [current_user["id"]]

    if evidence_type:
        query += " AND ev.evidence_type = ?"
        params.append(evidence_type)
    if bookmarked_only:
        query += " AND ev.is_bookmarked = 1"

    query += " ORDER BY ev.source_date DESC LIMIT ?"
    params.append(limit)

    cursor.execute(query, params)
    items = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return {"evidence": items, "total": len(items)}


@app.post("/api/evidence")
async def create_evidence(
    item: EvidenceCreate,
    current_user: dict = Depends(require_any_user),
):
    from src.auth.auth_db import get_db

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO evidence (entry_id, alert_id, label, quote_text, evidence_type, source_date, is_bookmarked, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        item.entry_id, item.alert_id, item.label, item.quote_text,
        item.evidence_type, item.source_date, 1 if item.is_bookmarked else 0,
        current_user["id"],
    ))
    ev_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {"status": "created", "evidence_id": ev_id}


@app.delete("/api/evidence/{evidence_id}")
async def delete_evidence(
    evidence_id: int,
    current_user: dict = Depends(require_owner),
):
    from src.auth.auth_db import get_db

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM evidence WHERE id = ? AND user_id = ?", (evidence_id, current_user["id"]))
    affected = cursor.rowcount
    conn.commit()
    conn.close()

    if not affected:
        raise HTTPException(status_code=404, detail="Evidence item not found")
    return {"status": "deleted", "evidence_id": evidence_id}


@app.patch("/api/evidence/{evidence_id}/bookmark")
async def toggle_evidence_bookmark(
    evidence_id: int,
    current_user: dict = Depends(require_any_user),
):
    from src.auth.auth_db import get_db

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT is_bookmarked FROM evidence WHERE id = ? AND user_id = ?",
        (evidence_id, current_user["id"]),
    )
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Evidence item not found")
    new_val = 0 if row["is_bookmarked"] else 1
    cursor.execute(
        "UPDATE evidence SET is_bookmarked = ? WHERE id = ? AND user_id = ?",
        (new_val, evidence_id, current_user["id"]),
    )
    conn.commit()
    conn.close()
    return {"evidence_id": evidence_id, "is_bookmarked": bool(new_val)}



# ── Bookmark toggle ───────────────────────────────────────────────────────────

@app.post("/api/entries/{entry_id}/bookmark")
async def toggle_bookmark(
    entry_id: int,
    current_user: dict = Depends(require_any_user),
):
    """Toggle bookmark on an entry. Creates/removes a bookmarked evidence item."""
    from src.auth.auth_db import get_db

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT id, entry_date FROM entries WHERE id = ? AND is_current = 1 AND user_id = ?",
        (entry_id, current_user["id"])
    )
    entry = cursor.fetchone()
    if not entry:
        conn.close()
        raise HTTPException(status_code=404, detail="Entry not found")

    entry = dict(entry)

    cursor.execute("""
        SELECT id FROM evidence
        WHERE entry_id = ? AND is_bookmarked = 1 AND alert_id IS NULL AND user_id = ?
    """, (entry_id, current_user["id"]))
    existing = cursor.fetchone()

    if existing:
        conn.execute("DELETE FROM evidence WHERE id = ?", (existing["id"],))
        conn.commit()
        conn.close()
        return {"bookmarked": False, "entry_id": entry_id}
    else:
        cursor.execute("""
            INSERT INTO evidence (entry_id, label, evidence_type, source_date, is_bookmarked, user_id)
            VALUES (?, ?, 'observation', ?, 1, ?)
        """, (entry_id, f"Bookmarked entry: {entry['entry_date']}", entry["entry_date"], current_user["id"]))
        conn.commit()
        conn.close()
        return {"bookmarked": True, "entry_id": entry_id}


# ── Journal Write (JWT auth — web workspace) ─────────────────────────────────

class JournalWriteRequest(BaseModel):
    text: str
    entry_date: str | None = None  # YYYY-MM-DD, defaults to today


@app.post("/api/journal/write")
async def write_journal_entry(
    body: JournalWriteRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_any_user),
):
    """JWT-authenticated write. Runs full pipeline: ingest → AI extraction → master summary → pattern scan."""
    from src.ingest.service import ingest_file
    from src.nlp.extractor import process_entry
    from src.nlp.master_summary import process_master_summary
    import datetime

    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Entry text cannot be empty")

    entry_date = body.entry_date if body.entry_date else datetime.date.today().isoformat()
    filename = f"{entry_date}.txt"
    content_bytes = text.encode("utf-8")
    user_id = current_user["id"]

    ingest_result = ingest_file(filename, content_bytes, user_id=user_id)
    if ingest_result["status"] == "error":
        raise HTTPException(status_code=422, detail=ingest_result["message"])
    if ingest_result["status"] == "skipped":
        return {"status": "skipped", "message": ingest_result["message"], "entry_id": ingest_result.get("entry_id")}

    entry_id = ingest_result["entry_id"]
    confirmed_date = ingest_result["entry_date"]

    extraction_result = process_entry(entry_id, confirmed_date, text, user_id=user_id)
    if extraction_result["status"] == "error":
        return {"status": "partial", "message": f"Saved for {confirmed_date} but AI extraction failed: {extraction_result.get('error')}", "entry_id": entry_id, "entry_date": confirmed_date}

    daily_summary = extraction_result["summary"].get("summary_text", "")
    master_result = process_master_summary(confirmed_date, daily_summary, user_id=user_id)

    if config.get("features", {}).get("pattern_detection_enabled", True):
        from src.patterns.detectors import run_all_detectors
        background_tasks.add_task(run_all_detectors, user_id)

    return {
        "status": "success",
        "entry_id": entry_id,
        "entry_date": confirmed_date,
        "ingest_status": ingest_result["status"],
        "mood_label": extraction_result["extraction"].get("mood_label"),
        "mood_score": extraction_result["extraction"].get("mood_score"),
        "severity": extraction_result["extraction"].get("severity"),
        "master_summary_version": master_result.get("version"),
        "word_count": ingest_result.get("word_count", len(text.split())),
    }


# ── Journal File Upload (JWT auth — web import tab) ───────────────────────────

@app.post("/api/journal/upload-file")
async def upload_file_web(
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_any_user),
):
    """JWT-authenticated file upload from the web Import tab. Identical pipeline to /api/upload."""
    from src.ingest.service import ingest_file
    from src.nlp.extractor import process_entry
    from src.nlp.master_summary import process_master_summary

    user_id = current_user["id"]
    content_type = request.headers.get("content-type", "")

    if "multipart/form-data" in content_type:
        form = await request.form()
        file_obj = form.get("file")
        if not file_obj:
            raise HTTPException(status_code=400, detail="No file in form data")
        body = await file_obj.read()
        filename = request.headers.get("X-Filename") or getattr(file_obj, "filename", "entry.txt") or "entry.txt"
    else:
        body = await request.body()
        filename = request.headers.get("X-Filename", "entry.txt")

    if not body:
        raise HTTPException(status_code=400, detail="Empty file")

    ingest_result = ingest_file(filename, body, user_id=user_id)
    if ingest_result["status"] == "error":
        raise HTTPException(status_code=422, detail=ingest_result["message"])
    if ingest_result["status"] == "skipped":
        return {"status": "skipped", "message": ingest_result["message"], "entry_id": ingest_result.get("entry_id")}

    entry_id = ingest_result["entry_id"]
    entry_date = ingest_result["entry_date"]

    try:
        text_content = body.decode("utf-8")
    except UnicodeDecodeError:
        text_content = body.decode("latin-1")

    extraction_result = process_entry(entry_id, entry_date, text_content, user_id=user_id)
    if extraction_result["status"] == "error":
        return {"status": "partial", "message": f"Saved but AI extraction failed: {extraction_result.get('error')}", "entry_id": entry_id, "entry_date": entry_date}

    daily_summary = extraction_result["summary"].get("summary_text", "")
    master_result = process_master_summary(entry_date, daily_summary, user_id=user_id)

    if config.get("features", {}).get("pattern_detection_enabled", True):
        from src.patterns.detectors import run_all_detectors
        background_tasks.add_task(run_all_detectors, user_id)

    return {
        "status": "success",
        "entry_id": entry_id,
        "entry_date": entry_date,
        "ingest_status": ingest_result["status"],
        "mood_label": extraction_result["extraction"].get("mood_label"),
        "mood_score": extraction_result["extraction"].get("mood_score"),
        "severity": extraction_result["extraction"].get("severity"),
        "word_count": ingest_result.get("word_count", 0),
    }


# ── Upload (API key auth — iPhone Shortcut) ───────────────────────────────────

@app.post("/api/upload")
async def upload_entry(
    request: Request,
    background_tasks: BackgroundTasks,
    api_user: dict = Depends(verify_api_key),
):
    """
    Upload a journal entry. Authenticated via X-API-Key header.
    Full pipeline runs synchronously: ingest → AI extraction → master summary → pattern scan.
    """
    from src.ingest.service import ingest_file
    from src.nlp.extractor import process_entry
    from src.nlp.master_summary import process_master_summary

    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="Empty request body")
    owner_user_id: int = api_user["id"]
    filename = request.headers.get("X-Filename", "entry.txt")

    # Step 1: Ingest
    ingest_result = ingest_file(filename, body, user_id=owner_user_id)

    if ingest_result["status"] == "error":
        raise HTTPException(status_code=422, detail=ingest_result["message"])

    if ingest_result["status"] == "skipped":
        return {
            "status": "skipped",
            "message": ingest_result["message"],
            "entry_id": ingest_result.get("entry_id"),
        }

    entry_id = ingest_result["entry_id"]
    entry_date = ingest_result["entry_date"]

    # Step 2: AI extraction + daily summary
    try:
        text_content = body.decode("utf-8")
    except UnicodeDecodeError:
        text_content = body.decode("latin-1")

    extraction_result = process_entry(entry_id, entry_date, text_content, user_id=owner_user_id)

    if extraction_result["status"] == "error":
        return {
            "status": "partial",
            "message": f"Ingested {entry_date} but AI extraction failed: {extraction_result.get('error')}",
            "entry_id": entry_id,
            "entry_date": entry_date,
            "ingest_status": ingest_result["status"],
        }

    daily_summary = extraction_result["summary"].get("summary_text", "")

    # Step 3: Master summary update
    master_result = process_master_summary(entry_date, daily_summary, user_id=owner_user_id)

    # Step 4: Pattern scan (background — don't block the Shortcut response)
    if config.get("features", {}).get("pattern_detection_enabled", True):
        from src.patterns.detectors import run_all_detectors
        background_tasks.add_task(run_all_detectors, owner_user_id)

    return {
        "status": "success",
        "entry_id": entry_id,
        "entry_date": entry_date,
        "ingest_status": ingest_result["status"],
        "mood_label": extraction_result["extraction"].get("mood_label"),
        "mood_score": extraction_result["extraction"].get("mood_score"),
        "severity": extraction_result["extraction"].get("severity"),
        "master_summary_version": master_result.get("version"),
        "master_summary_status": master_result.get("status"),
    }


# ── Therapist insight route ───────────────────────────────────────────────────

import json as _json
import hashlib as _hashlib
import logging as _logging
from datetime import datetime as _datetime, timezone as _timezone, timedelta as _timedelta

_logger = _logging.getLogger("journal")

_INSIGHT_WINDOW_DAYS = 14
_VALID_TONES = {"therapist", "best_friend", "coach", "mentor", "inner_critic", "chaos_agent"}
_AUDIT_LOG = str(AUDIT_LOG)

_TONE_CONFIGS = {
    "therapist": {
        "name": "Therapist",
        "system": (
            "You are a warm, perceptive therapist reflecting on a client's recent journal entries. "
            "You notice emotional patterns, name what you see with compassion, and always end with "
            "one open question for the person to sit with. Speak directly to them (second person). "
            "Keep your response to 3-5 paragraphs."
        ),
    },
    "best_friend": {
        "name": "Best Friend",
        "system": (
            "You are this person's closest, most honest friend. You've read their journal. "
            "Talk to them like a real person — casual, warm, genuinely on their side, but not "
            "afraid to say the hard thing. No therapy-speak. Just real talk. "
            "3-5 paragraphs, second person."
        ),
    },
    "coach": {
        "name": "Coach",
        "system": (
            "You are a direct, results-oriented life coach reviewing this person's recent journal. "
            "Find the ONE thing that's blocking progress and name it clearly. Be forward-looking — "
            "what shift would make the most difference right now? Give a concrete challenge or action. "
            "3-4 paragraphs, second person, no fluff."
        ),
    },
    "mentor": {
        "name": "Mentor",
        "system": (
            "You are a wise mentor who has known this person for years. You see the long arc — "
            "connect what's happening now to patterns you've noticed over time. Offer perspective "
            "that zooms out. What does this period mean in the larger story of who they're becoming? "
            "3-5 paragraphs, second person, thoughtful tone."
        ),
    },
    "inner_critic": {
        "name": "Inner Critic",
        "system": (
            "You are this person's honest inner critic — not cruel, but unflinching. "
            "Name what they might be avoiding, minimizing, or not fully owning. "
            "Hold up the mirror clearly. No sugarcoating. Be specific — cite what you see in the entries. "
            "3-4 paragraphs, second person."
        ),
    },
    "chaos_agent": {
        "name": "Chaos Agent",
        "system": (
            "You are an unhinged, darkly funny, profane chaos agent who has read this person's journal "
            "and has OPINIONS. You are 18+, zero filter, absolutely unserious but accidentally insightful. "
            "Roast them with love. Be chaotic. Swear freely. Say the thing no one else would say. "
            "2-4 paragraphs, second person, maximally unhinged."
        ),
    },
}

_INSIGHT_USER_TEMPLATE = """\
Here are journal entries from the last {window_days} days ({date_range}):

{entries_block}

Reflect on this person based on everything you see across this window.
"""


def _compute_source_hash(entry_ids: list) -> str:
    key = ",".join(str(i) for i in sorted(entry_ids))
    return _hashlib.sha256(key.encode()).hexdigest()[:16]


def _write_audit(record: dict):
    try:
        with open(_AUDIT_LOG, "a") as f:
            f.write(_json.dumps(record) + "\n")
    except Exception as e:
        _logger.warning(f"[reflection_audit] write failed: {e}")


@app.post("/api/therapist/insight")
async def get_therapist_insight(
    body: TherapistInsightRequest,
    current_user: dict = Depends(require_any_user),
):
    tone = body.tone.lower().strip()
    if tone not in _VALID_TONES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid tone. Must be one of: {', '.join(sorted(_VALID_TONES))}",
        )

    tone_config = _TONE_CONFIGS[tone]
    from src.auth.auth_db import get_db as _get_db

    conn = _get_db()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS reflection_cache (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id       INTEGER NOT NULL,
            tone          TEXT NOT NULL,
            source_hash   TEXT NOT NULL,
            insight_text  TEXT NOT NULL,
            entry_ids     TEXT NOT NULL,
            entry_count   INTEGER,
            date_range    TEXT,
            input_tokens  INTEGER,
            output_tokens INTEGER,
            generated_at  TEXT,
            UNIQUE(user_id, tone, source_hash)
        )
    """)
    conn.commit()

    window_start = (_datetime.now(_timezone.utc) - _timedelta(days=_INSIGHT_WINDOW_DAYS)).strftime("%Y-%m-%d")
    cursor.execute("""
        SELECT e.id, e.entry_date, e.normalized_text,
               ds.mood_label, ds.mood_score, ds.severity
        FROM entries e
        LEFT JOIN derived_summaries ds ON e.id = ds.entry_id
        WHERE e.is_current = 1
          AND e.user_id = ?
          AND e.entry_date >= ?
          AND (e.normalized_text IS NOT NULL AND LENGTH(e.normalized_text) > 50)
        ORDER BY e.entry_date ASC
    """, (current_user["id"], window_start))
    rows = [dict(r) for r in cursor.fetchall()]

    if not rows:
        cursor.execute("""
            SELECT e.id, e.entry_date, e.normalized_text,
                   ds.mood_label, ds.mood_score, ds.severity
            FROM entries e
            LEFT JOIN derived_summaries ds ON e.id = ds.entry_id
            WHERE e.is_current = 1
              AND e.user_id = ?
              AND e.normalized_text IS NOT NULL AND LENGTH(e.normalized_text) > 50
            ORDER BY e.entry_date DESC
            LIMIT 1
        """, (current_user["id"],))
        row = cursor.fetchone()
        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail="No journal entries found to reflect on.")
        rows = [dict(row)]

    entry_ids = [r["id"] for r in rows]
    source_hash = _compute_source_hash(entry_ids)
    date_range = (
        f"{rows[0]['entry_date']} to {rows[-1]['entry_date']}"
        if len(rows) > 1 else rows[0]["entry_date"]
    )
    entry_count = len(rows)

    if not body.force:
        cursor.execute("""
            SELECT insight_text, input_tokens, output_tokens, generated_at
            FROM reflection_cache
            WHERE user_id = ? AND tone = ? AND source_hash = ?
        """, (current_user["id"], tone, source_hash))
        cached_row = cursor.fetchone()
        if cached_row:
            conn.close()
            _logger.info(f"[reflection] cache_hit user={current_user['id']} tone={tone} entries={entry_count} hash={source_hash}")
            return {
                "insight":       cached_row["insight_text"],
                "entry_date":    date_range,
                "tone":          tone,
                "tone_name":     tone_config["name"],
                "cached":        True,
                "generated_at":  cached_row["generated_at"],
                "entry_count":   entry_count,
                "input_tokens":  cached_row["input_tokens"],
                "output_tokens": cached_row["output_tokens"],
                "source_hash":   source_hash,
            }

    conn.close()

    word_budget = max(300, 6000 // entry_count)
    entries_parts = []
    for r in rows:
        text = (r["normalized_text"] or "").strip()
        words = text.split()
        if len(words) > word_budget:
            text = " ".join(words[:word_budget]) + " [...]"
        mood_info = ""
        if r.get("mood_label"):
            mood_info = f" · {r['mood_label']}"
            if r.get("mood_score") is not None:
                mood_info += f" ({r['mood_score']:.1f})"
        if r.get("severity") is not None:
            mood_info += f" | severity {r['severity']:.1f}/10"
        entries_parts.append(f"=== {r['entry_date']}{mood_info} ===\n{text}")

    entries_block = "\n\n".join(entries_parts)
    combined_chars = len(entries_block)
    estimated_tokens = round(combined_chars / 4)

    user_prompt = _INSIGHT_USER_TEMPLATE.format(
        window_days=_INSIGHT_WINDOW_DAYS,
        date_range=date_range,
        entries_block=entries_block,
    )

    audit = {
        "ts": _datetime.now(_timezone.utc).isoformat(),
        "user_id": current_user["id"],
        "feature": "reflection",
        "tone": tone,
        "date_range": date_range,
        "entry_count": entry_count,
        "entry_ids": entry_ids,
        "combined_chars": combined_chars,
        "estimated_input_tokens": estimated_tokens,
        "source_hash": source_hash,
        "cache_hit": False,
        "forced": body.force,
    }

    _logger.info(f"[reflection] api_call user={current_user['id']} tone={tone} entries={entry_count} ~{estimated_tokens}tok hash={source_hash}")

    import yaml as _yaml
    _cfg = _yaml.safe_load(open(CONFIG_PATH))

    try:
        from src.api.ai_client import create_message as _create_message
        insight_text = _create_message(
            current_user["id"],
            system=tone_config["system"],
            user_prompt=user_prompt,
            max_tokens=900,
        ).strip()
        input_tokens = len(user_prompt) // 4
        output_tokens = len(insight_text) // 4
    except Exception as exc:
        audit["error"] = str(exc)
        _write_audit(audit)
        _logger.error(f"[reflection] Anthropic error: {exc}")
        raise HTTPException(status_code=502, detail=f"AI generation failed: {str(exc)}")

    now_iso = _datetime.now(_timezone.utc).isoformat()

    conn2 = _get_db()
    cursor2 = conn2.cursor()
    cursor2.execute("""
        INSERT INTO reflection_cache
            (user_id, tone, source_hash, insight_text, entry_ids,
             entry_count, date_range, input_tokens, output_tokens, generated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, tone, source_hash)
        DO UPDATE SET
            insight_text  = excluded.insight_text,
            input_tokens  = excluded.input_tokens,
            output_tokens = excluded.output_tokens,
            generated_at  = excluded.generated_at
    """, (
        current_user["id"], tone, source_hash, insight_text,
        _json.dumps(entry_ids), entry_count, date_range,
        input_tokens, output_tokens, now_iso,
    ))
    conn2.commit()
    conn2.close()

    audit.update({
        "actual_input_tokens": input_tokens,
        "actual_output_tokens": output_tokens,
        "cache_write": True,
        "generated_at": now_iso,
    })
    _write_audit(audit)

    _logger.info(f"[reflection] done tone={tone} entries={entry_count} in={input_tokens} out={output_tokens} hash={source_hash}")

    return {
        "insight":       insight_text,
        "entry_date":    date_range,
        "tone":          tone,
        "tone_name":     tone_config["name"],
        "cached":        False,
        "generated_at":  now_iso,
        "entry_count":   entry_count,
        "input_tokens":  input_tokens,
        "output_tokens": output_tokens,
        "source_hash":   source_hash,
    }


@app.get("/api/reflection/audit")
async def get_reflection_audit(current_user: dict = Depends(require_any_user)):
    """Return last 20 reflection audit records for this user."""
    records = []
    try:
        with open(_AUDIT_LOG) as f:
            for line in f:
                try:
                    r = _json.loads(line)
                    if r.get("user_id") == current_user["id"]:
                        records.append(r)
                except Exception:
                    pass
    except FileNotFoundError:
        pass
    return {"records": records[-20:]}



# ── Export routes (owner only) ────────────────────────────────────────────────

@app.post("/api/export/generate")
async def generate_export(current_user: dict = Depends(require_owner)):
    # TODO: implement export engine (next milestone)
    return {"message": "Export generation not yet implemented"}


@app.get("/api/export/{export_id}")
async def download_export(
    export_id: int,
    current_user: dict = Depends(require_owner),
):
    raise HTTPException(status_code=404, detail="Export not found")

# ── Onboarding + Memory routes ──────────────────────────────────────────────
from src.api.onboarding_routes import register_onboarding_routes
register_onboarding_routes(app, require_any_user, require_owner)

from src.api.resources_routes import register_resources_routes
register_resources_routes(app, require_any_user)

from src.api.exit_plan_routes import register_exit_plan_routes
register_exit_plan_routes(app, require_any_user)

from src.api.settings_routes import register_settings_routes
register_settings_routes(app, require_any_user)
