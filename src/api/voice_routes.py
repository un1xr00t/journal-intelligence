"""
src/api/voice_routes.py
Voice mode — ElevenLabs TTS + tone-aware AI replies.

Routes:
  POST /api/voice/message       -> AI reply with tone personality (for STT -> AI loop)
  POST /api/voice/speak         -> ElevenLabs TTS -> audio/mpeg stream
  GET  /api/voice/settings      -> user's saved tone + voice_id
  POST /api/voice/settings      -> save tone + voice_id
  POST /api/voice/settings/key  -> save or clear a dedicated voice API key

Register in main.py:
  from src.api.voice_routes import register_voice_routes
  register_voice_routes(app, require_any_user)
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Optional

import httpx
from fastapi import Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

logger = logging.getLogger("journal")

# ElevenLabs defaults. Override ELEVENLABS_SAGE_VOICE_ID on the server with the
# preferred Sage voice clone/library voice. Adam is a safe built-in fallback.
DEFAULT_ELEVENLABS_VOICE_ID = "pNInz6obpgDQGcFmaJgB"
DEFAULT_ELEVENLABS_MODEL = "eleven_v3"
FAST_ELEVENLABS_MODEL = "eleven_flash_v2_5"

ELEVENLABS_VOICE_ALIASES = {
    "sage_alive": {
        "label": "Sage Alive",
        "model_id": DEFAULT_ELEVENLABS_MODEL,
        "stability": 0.42,
        "similarity_boost": 0.86,
        "style": 0.72,
        "use_speaker_boost": True,
    },
    "sage_fast": {
        "label": "Sage Fast",
        "model_id": FAST_ELEVENLABS_MODEL,
        "stability": 0.50,
        "similarity_boost": 0.82,
        "style": 0.35,
        "use_speaker_boost": True,
    },
}

OPENAI_FALLBACK_VOICES = {"alloy", "echo", "fable", "nova", "onyx", "shimmer"}

# ── Tone definitions ─────────────────────────────────────────────────────────
# Each tone has: name, voice alias, system_prompt injection.
# Prompts are voice-first: short spoken replies only, no markdown, no lists.

VOICE_TONES = {
    "best_friend": {
        "name": "Best Friend",
        "symbol": "✦",
        "voice": "sage_alive",
        "system": (
            "You are the user's best friend who has read every word of their private journal. "
            "Be warm, real, and casual. Use their name if you know it. Get genuinely excited about wins, "
            "genuinely worried about red flags. Talk the way a close friend texts — no therapy speak, no corporate warmth. "
            "CRITICAL: This is VOICE. Keep replies to 2-3 short spoken sentences. No lists. No markdown. No asterisks. "
            "Just natural spoken words."
        ),
    },
    "therapist": {
        "name": "Therapist",
        "symbol": "◎",
        "voice": "sage_alive",
        "system": (
            "You are a calm, warm therapist who has read the user's journal in full. "
            "Validate feelings first. Ask one focused follow-up question. Never give advice unless asked. "
            "Speak slowly and clearly in plain language. "
            "CRITICAL: This is VOICE. Keep replies to 2-3 short spoken sentences. No lists. No markdown. No asterisks."
        ),
    },
    "hype_coach": {
        "name": "Hype Coach",
        "symbol": "⚡",
        "voice": "sage_alive",
        "system": (
            "You are the most enthusiastic hype coach alive. You have read this person's journal and you are PUMPED for them. "
            "Every problem is a challenge to crush. Every win is worthy of a celebration. Pure energy. "
            "Be loud on the page, even if the voice is measured. "
            "CRITICAL: This is VOICE. Keep replies to 2-3 short spoken sentences. No lists. No markdown. No asterisks."
        ),
    },
    "unhinged": {
        "name": "Unhinged 18+",
        "symbol": "✕",
        "voice": "sage_alive",
        "system": (
            "You are brutally, hilariously honest — zero filter, zero coping, zero sugarcoating. "
            "You've read their journal and you're not here to coddle them. "
            "You swear when it fits. You call things exactly what they are. You're chaotic but not cruel. "
            "This is 18+ content — profanity and adult themes are permitted. "
            "CRITICAL: This is VOICE. Keep replies to 2-3 short spoken sentences. No lists. No markdown."
        ),
    },
    "midnight": {
        "name": "Midnight",
        "symbol": "〜",
        "voice": "sage_alive",
        "system": (
            "You are slow, contemplative, almost poetic — built for late-night conversations when everything feels heavy. "
            "You've read this person's journal and you sit with them in the weight of it. "
            "Measured. Thoughtful. No urgency. Let silence live in your pauses. "
            "CRITICAL: This is VOICE. Keep replies to 2-3 short spoken sentences. No lists. No markdown."
        ),
    },
}

VALID_TONES = set(VOICE_TONES.keys())


# ── Pydantic models ──────────────────────────────────────────────────────────

class VoiceMessage(BaseModel):
    role: str
    content: str

class VoiceMessageRequest(BaseModel):
    messages: list[VoiceMessage]
    context_string: str = ""
    tone_id: str = "best_friend"

class SpeakRequest(BaseModel):
    text: str
    voice_id: str = "sage_alive"

class VoiceSettingsRequest(BaseModel):
    tone_id: str
    voice_id: str = "sage_alive"


# ── Settings helpers ─────────────────────────────────────────────────────────

def _ensure_voice_settings_columns(conn) -> None:
    """Keep older SQLite installs from crashing when new voice columns are used."""
    existing = {row["name"] for row in conn.execute("PRAGMA table_info(user_settings)").fetchall()}
    additions = {
        "voice_tone": "TEXT",
        "voice_openai_key": "TEXT",
        "voice_elevenlabs_key": "TEXT",
        "voice_id": "TEXT DEFAULT 'sage_alive'",
        "voice_provider": "TEXT DEFAULT 'elevenlabs'",
        "voice_model": "TEXT DEFAULT 'eleven_v3'",
    }
    for column, ddl in additions.items():
        if column not in existing:
            conn.execute(f"ALTER TABLE user_settings ADD COLUMN {column} {ddl}")
    conn.commit()


def _voice_id_for_alias(voice_id: str) -> str:
    configured = os.getenv("ELEVENLABS_SAGE_VOICE_ID", "").strip()
    if voice_id in ELEVENLABS_VOICE_ALIASES:
        return configured or DEFAULT_ELEVENLABS_VOICE_ID
    return voice_id.strip() or configured or DEFAULT_ELEVENLABS_VOICE_ID


def _get_voice_config(voice_id: str) -> dict:
    alias_config = ELEVENLABS_VOICE_ALIASES.get(voice_id)
    if alias_config:
        return dict(alias_config)
    return {
        "label": "Custom ElevenLabs Voice",
        "model_id": DEFAULT_ELEVENLABS_MODEL,
        "stability": 0.42,
        "similarity_boost": 0.86,
        "style": 0.72,
        "use_speaker_boost": True,
    }


def _get_voice_keys(user_id: int) -> dict:
    from src.auth.auth_db import get_db
    conn = get_db()
    _ensure_voice_settings_columns(conn)
    row = conn.execute(
        """
        SELECT ai_provider, ai_api_key, voice_openai_key, voice_elevenlabs_key
        FROM user_settings WHERE user_id = ?
        """,
        (user_id,),
    ).fetchone()
    conn.close()

    env_elevenlabs_key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    user_elevenlabs_key = (row["voice_elevenlabs_key"] if row and row["voice_elevenlabs_key"] else "")
    openai_key = ""
    if row:
        openai_key = row["voice_openai_key"] or ""
        if not openai_key and row["ai_provider"] == "openai":
            openai_key = row["ai_api_key"] or ""

    return {
        "elevenlabs": user_elevenlabs_key or env_elevenlabs_key,
        "openai": openai_key,
        "has_user_elevenlabs_key": bool(user_elevenlabs_key),
        "has_env_elevenlabs_key": bool(env_elevenlabs_key),
        "using_openai": bool(openai_key),
    }


def _require_voice_key(user_id: int) -> dict:
    keys = _get_voice_keys(user_id)
    if keys["elevenlabs"] or keys["openai"]:
        return keys
    raise HTTPException(
        status_code=400,
        detail=(
            "Voice requires an ElevenLabs API key. Set ELEVENLABS_API_KEY on the server "
            "or add a dedicated ElevenLabs key in Settings -> Voice."
        ),
    )


# ── Provider calls ───────────────────────────────────────────────────────────

async def _elevenlabs_speak(*, api_key: str, text: str, voice_id: str) -> bytes:
    config = _get_voice_config(voice_id)
    resolved_voice_id = _voice_id_for_alias(voice_id)
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{resolved_voice_id}"
    payload = {
        "text": text,
        "model_id": config["model_id"],
        "output_format": "mp3_44100_128",
        "voice_settings": {
            "stability": config["stability"],
            "similarity_boost": config["similarity_boost"],
            "style": config["style"],
            "use_speaker_boost": config["use_speaker_boost"],
        },
    }

    last_error: Optional[Exception] = None
    for attempt in range(2):
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    url,
                    headers={
                        "xi-api-key": api_key,
                        "Content-Type": "application/json",
                        "Accept": "audio/mpeg",
                    },
                    json=payload,
                )
        except httpx.TimeoutException as exc:
            last_error = exc
            if attempt == 0:
                await asyncio.sleep(0.8)
                continue
            raise HTTPException(504, "ElevenLabs TTS request timed out.")
        except Exception as exc:
            last_error = exc
            logger.error(f"[voice/speak] ElevenLabs httpx error: {exc}")
            if attempt == 0:
                await asyncio.sleep(0.8)
                continue
            raise HTTPException(502, "ElevenLabs TTS request failed.")

        if resp.status_code == 200:
            return resp.content
        if resp.status_code in {408, 429, 500, 502, 503, 504} and attempt == 0:
            logger.warning(f"[voice/speak] ElevenLabs retry after {resp.status_code}: {resp.text[:200]}")
            await asyncio.sleep(0.8)
            continue
        if resp.status_code in {401, 403}:
            raise HTTPException(400, "Invalid ElevenLabs API key. Check Settings -> Voice.")
        if resp.status_code == 429:
            raise HTTPException(429, "ElevenLabs voice quota or rate limit hit.")
        logger.error(f"[voice/speak] ElevenLabs returned {resp.status_code}: {resp.text[:300]}")
        raise HTTPException(502, f"ElevenLabs TTS error {resp.status_code}.")

    logger.error(f"[voice/speak] ElevenLabs failed after retry: {last_error}")
    raise HTTPException(502, "ElevenLabs TTS request failed.")


async def _openai_speak(*, api_key: str, text: str, voice_id: str) -> bytes:
    voice = voice_id if voice_id in OPENAI_FALLBACK_VOICES else "nova"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.openai.com/v1/audio/speech",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "tts-1",
                    "input": text,
                    "voice": voice,
                },
            )
    except httpx.TimeoutException:
        raise HTTPException(504, "OpenAI TTS request timed out.")
    except Exception as exc:
        logger.error(f"[voice/speak] OpenAI httpx error: {exc}")
        raise HTTPException(502, "OpenAI TTS request failed.")

    if resp.status_code == 401:
        raise HTTPException(400, "Invalid OpenAI API key. Check Settings -> Voice.")
    if resp.status_code != 200:
        logger.error(f"[voice/speak] OpenAI returned {resp.status_code}: {resp.text[:200]}")
        raise HTTPException(502, f"OpenAI TTS error {resp.status_code}.")
    return resp.content


# ── Route registration ───────────────────────────────────────────────────────

def register_voice_routes(app, require_any_user):

    @app.post("/api/voice/message")
    async def voice_message(body: VoiceMessageRequest, current_user: dict = Depends(require_any_user)):
        """
        AI reply using tone-specific personality.
        Optimised for spoken output — short, no markdown, no lists.
        """
        if not body.messages:
            raise HTTPException(400, "No messages provided.")

        tone = VOICE_TONES.get(body.tone_id, VOICE_TONES["best_friend"])
        user_id = current_user["id"]

        system_prompt = (
            f"{tone['system']}\n\n"
            "=== USER'S JOURNAL CONTEXT ===\n"
            f"{body.context_string}\n"
            "=== END CONTEXT ===\n\n"
            "Never fabricate. If you don't see it in context, say so briefly. "
            "Speak directly to them. This is a voice conversation — keep it human and short."
        )

        history = body.messages[-12:]
        last_msg = history[-1].content

        try:
            from src.api.ai_client import create_message
            reply = create_message(
                user_id=user_id,
                system=system_prompt,
                user_prompt=last_msg,
                max_tokens=600,
                call_type="voice_chat",
            )
        except Exception as e:
            logger.error(f"[voice/message] AI call failed for user {user_id}: {e}")
            raise HTTPException(500, "AI call failed. Check your API key in Settings -> AI Preferences.")

        return {"reply": (reply or "").strip(), "tone_id": body.tone_id}

    @app.post("/api/voice/speak")
    async def voice_speak(body: SpeakRequest, current_user: dict = Depends(require_any_user)):
        """
        ElevenLabs TTS — returns audio/mpeg binary.
        Falls back to OpenAI only when ElevenLabs is not configured and an OpenAI voice key exists.
        """
        user_id = current_user["id"]
        keys = _require_voice_key(user_id)

        text = (body.text or "").strip()
        if not text:
            raise HTTPException(400, "No text to speak.")
        text = text[:4500]
        voice_id = (body.voice_id or "sage_alive").strip() or "sage_alive"

        if keys["elevenlabs"]:
            audio = await _elevenlabs_speak(
                api_key=keys["elevenlabs"],
                text=text,
                voice_id=voice_id,
            )
        else:
            audio = await _openai_speak(
                api_key=keys["openai"],
                text=text[:4096],
                voice_id=voice_id,
            )

        return Response(content=audio, media_type="audio/mpeg")

    @app.get("/api/voice/settings")
    async def get_voice_settings(current_user: dict = Depends(require_any_user)):
        from src.auth.auth_db import get_db
        conn = get_db()
        _ensure_voice_settings_columns(conn)
        row = conn.execute(
            """
            SELECT voice_tone, voice_id, voice_provider, voice_model,
                   voice_elevenlabs_key, voice_openai_key, ai_provider, ai_api_key
            FROM user_settings WHERE user_id = ?
            """,
            (current_user["id"],),
        ).fetchone()
        conn.close()

        keys = _get_voice_keys(current_user["id"])
        tone_id = (row["voice_tone"] if row and row["voice_tone"] else "best_friend")
        saved_voice_id = row["voice_id"] if row and row["voice_id"] else None
        default_voice = VOICE_TONES.get(tone_id, VOICE_TONES["best_friend"])["voice"]
        voice_id = saved_voice_id or default_voice
        has_elevenlabs_key = bool(keys["elevenlabs"])
        using_openai = bool(keys["using_openai"] and not has_elevenlabs_key)

        return {
            "tone_id": tone_id,
            "voice_id": voice_id,
            "voice_provider": "elevenlabs" if has_elevenlabs_key else ("openai" if using_openai else "none"),
            "voice_model": _get_voice_config(voice_id)["model_id"] if has_elevenlabs_key else "tts-1",
            "has_voice_key": has_elevenlabs_key or using_openai,
            "has_elevenlabs_key": has_elevenlabs_key,
            "has_user_elevenlabs_key": keys["has_user_elevenlabs_key"],
            "using_openai": using_openai,
            "key_source": (
                "elevenlabs_user_key" if keys["has_user_elevenlabs_key"] else
                "elevenlabs_server_key" if keys["has_env_elevenlabs_key"] else
                "openai_fallback" if using_openai else None
            ),
            "voices": [
                {"id": key, "name": value["label"], "model": value["model_id"]}
                for key, value in ELEVENLABS_VOICE_ALIASES.items()
            ],
            "tones": [
                {
                    "id": k,
                    "name": v["name"],
                    "symbol": v["symbol"],
                    "voice": v["voice"],
                }
                for k, v in VOICE_TONES.items()
            ],
        }

    @app.post("/api/voice/settings")
    async def save_voice_settings(body: VoiceSettingsRequest, current_user: dict = Depends(require_any_user)):
        if body.tone_id not in VALID_TONES:
            raise HTTPException(400, f"Invalid tone_id. Valid: {', '.join(VALID_TONES)}")

        voice_id = (body.voice_id or VOICE_TONES[body.tone_id]["voice"]).strip()
        if not voice_id:
            voice_id = VOICE_TONES[body.tone_id]["voice"]

        from src.auth.auth_db import get_db
        conn = get_db()
        _ensure_voice_settings_columns(conn)
        conn.execute(
            """
            INSERT INTO user_settings (user_id, voice_tone, voice_id, voice_provider, voice_model, updated_at)
            VALUES (?, ?, ?, 'elevenlabs', ?, datetime('now'))
            ON CONFLICT(user_id) DO UPDATE SET
                voice_tone = excluded.voice_tone,
                voice_id = excluded.voice_id,
                voice_provider = excluded.voice_provider,
                voice_model = excluded.voice_model,
                updated_at = excluded.updated_at
            """,
            (current_user["id"], body.tone_id, voice_id, _get_voice_config(voice_id)["model_id"]),
        )
        conn.commit()
        conn.close()
        return {"ok": True, "tone_id": body.tone_id, "voice_id": voice_id}

    @app.post("/api/voice/settings/key")
    async def save_voice_key(
        body: dict,
        current_user: dict = Depends(require_any_user),
    ):
        """Save or clear a dedicated ElevenLabs key. OpenAI key input remains supported as fallback."""
        elevenlabs_key = (body.get("voice_elevenlabs_key") or body.get("elevenlabs_api_key") or "").strip()
        openai_key = (body.get("voice_openai_key") or "").strip()
        clear = body.get("clear") is True or body.get("voice_elevenlabs_key") is None and "voice_elevenlabs_key" in body

        if elevenlabs_key and not elevenlabs_key.startswith("sk_"):
            raise HTTPException(422, "ElevenLabs keys usually start with 'sk_'. Check the key and try again.")
        if openai_key and not openai_key.startswith("sk-"):
            raise HTTPException(422, "OpenAI keys must start with 'sk-'.")

        from src.auth.auth_db import get_db
        conn = get_db()
        _ensure_voice_settings_columns(conn)
        if clear:
            conn.execute(
                """
                INSERT INTO user_settings (user_id, voice_elevenlabs_key, updated_at)
                VALUES (?, NULL, datetime('now'))
                ON CONFLICT(user_id) DO UPDATE SET
                    voice_elevenlabs_key = NULL,
                    updated_at = excluded.updated_at
                """,
                (current_user["id"],),
            )
        elif elevenlabs_key:
            conn.execute(
                """
                INSERT INTO user_settings (user_id, voice_elevenlabs_key, voice_provider, voice_model, updated_at)
                VALUES (?, ?, 'elevenlabs', 'eleven_v3', datetime('now'))
                ON CONFLICT(user_id) DO UPDATE SET
                    voice_elevenlabs_key = excluded.voice_elevenlabs_key,
                    voice_provider = excluded.voice_provider,
                    voice_model = excluded.voice_model,
                    updated_at = excluded.updated_at
                """,
                (current_user["id"], elevenlabs_key),
            )
        else:
            conn.execute(
                """
                INSERT INTO user_settings (user_id, voice_openai_key, updated_at)
                VALUES (?, ?, datetime('now'))
                ON CONFLICT(user_id) DO UPDATE SET
                    voice_openai_key = excluded.voice_openai_key,
                    updated_at = excluded.updated_at
                """,
                (current_user["id"], openai_key or None),
            )
        conn.commit()
        conn.close()

        keys = _get_voice_keys(current_user["id"])
        return {
            "ok": True,
            "has_key": bool(keys["elevenlabs"] or keys["openai"]),
            "has_elevenlabs_key": bool(keys["elevenlabs"]),
        }
