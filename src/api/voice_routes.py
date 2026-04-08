"""
src/api/voice_routes.py
Voice mode — OpenAI TTS + tone-aware AI replies.

Routes:
  POST /api/voice/message   → AI reply with tone personality (for STT → AI loop)
  POST /api/voice/speak     → OpenAI TTS → audio/mpeg stream
  GET  /api/voice/settings  → user's saved tone + voice_id
  POST /api/voice/settings  → save tone + voice_id

Register in main.py:
  from src.api.voice_routes import register_voice_routes
  register_voice_routes(app, require_any_user)
"""

from __future__ import annotations
import logging
from typing import Optional

import httpx
from fastapi import Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

logger = logging.getLogger("journal")

# ── Tone definitions ──────────────────────────────────────────────────────────
# Each tone has: name, openai_voice, system_prompt injection
# Prompts are voice-first: short spoken replies only, no markdown, no lists.

VOICE_TONES = {
    "best_friend": {
        "name": "Best Friend",
        "symbol": "✦",
        "voice": "nova",
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
        "voice": "shimmer",
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
        "voice": "fable",
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
        "voice": "onyx",
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
        "voice": "echo",
        "system": (
            "You are slow, contemplative, almost poetic — built for late-night conversations when everything feels heavy. "
            "You've read this person's journal and you sit with them in the weight of it. "
            "Measured. Thoughtful. No urgency. Let silence live in your pauses. "
            "CRITICAL: This is VOICE. Keep replies to 2-3 short spoken sentences. No lists. No markdown."
        ),
    },
}

VALID_TONES = set(VOICE_TONES.keys())


# ── Pydantic models ───────────────────────────────────────────────────────────

class VoiceMessage(BaseModel):
    role: str
    content: str

class VoiceMessageRequest(BaseModel):
    messages: list[VoiceMessage]
    context_string: str = ""
    tone_id: str = "best_friend"

class SpeakRequest(BaseModel):
    text: str
    voice_id: str = "nova"

class VoiceSettingsRequest(BaseModel):
    tone_id: str
    voice_id: str


# ── Helper: get OpenAI key for TTS ────────────────────────────────────────────

def _get_openai_key_for_tts(user_id: int) -> str:
    """
    Priority: voice_openai_key → ai_api_key if provider is openai.
    Raises 400 if neither is set.
    """
    from src.auth.auth_db import get_db
    conn = get_db()
    row = conn.execute(
        "SELECT ai_provider, ai_api_key, voice_openai_key FROM user_settings WHERE user_id = ?",
        (user_id,)
    ).fetchone()
    conn.close()

    if row:
        # Prefer dedicated voice key
        if row["voice_openai_key"]:
            return row["voice_openai_key"]
        # Fall back to main key if provider is openai
        if row["ai_provider"] == "openai" and row["ai_api_key"]:
            return row["ai_api_key"]

    raise HTTPException(
        status_code=400,
        detail=(
            "Voice requires an OpenAI API key. "
            "Go to Settings → Voice and add your OpenAI key, "
            "or switch your AI provider to OpenAI in Settings → AI Preferences."
        ),
    )


# ── Route registration ─────────────────────────────────────────────────────────

def register_voice_routes(app, require_any_user):

    # ── POST /api/voice/message ───────────────────────────────────────────────
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
            raise HTTPException(500, "AI call failed. Check your API key in Settings → AI Preferences.")

        return {"reply": (reply or "").strip(), "tone_id": body.tone_id}


    # ── POST /api/voice/speak ─────────────────────────────────────────────────
    @app.post("/api/voice/speak")
    async def voice_speak(body: SpeakRequest, current_user: dict = Depends(require_any_user)):
        """
        OpenAI TTS — returns audio/mpeg binary.
        Frontend decodes with Web Audio API for Jarvis visualization.
        """
        user_id = current_user["id"]
        openai_key = _get_openai_key_for_tts(user_id)

        text = (body.text or "").strip()
        if not text:
            raise HTTPException(400, "No text to speak.")
        text = text[:4096]  # OpenAI TTS limit

        valid_voices = {"alloy", "echo", "fable", "nova", "onyx", "shimmer"}
        voice_id = body.voice_id if body.voice_id in valid_voices else "nova"

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/audio/speech",
                    headers={
                        "Authorization": f"Bearer {openai_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "tts-1",
                        "input": text,
                        "voice": voice_id,
                    },
                )
        except httpx.TimeoutException:
            raise HTTPException(504, "TTS request timed out.")
        except Exception as e:
            logger.error(f"[voice/speak] httpx error for user {user_id}: {e}")
            raise HTTPException(502, "TTS request failed.")

        if resp.status_code == 401:
            raise HTTPException(400, "Invalid OpenAI API key. Check Settings → Voice.")
        if resp.status_code != 200:
            logger.error(f"[voice/speak] OpenAI returned {resp.status_code}: {resp.text[:200]}")
            raise HTTPException(502, f"OpenAI TTS error {resp.status_code}.")

        return Response(content=resp.content, media_type="audio/mpeg")


    # ── GET /api/voice/settings ───────────────────────────────────────────────
    @app.get("/api/voice/settings")
    async def get_voice_settings(current_user: dict = Depends(require_any_user)):
        from src.auth.auth_db import get_db
        conn = get_db()
        row = conn.execute(
            "SELECT voice_tone, voice_openai_key, ai_provider, ai_api_key FROM user_settings WHERE user_id = ?",
            (current_user["id"],)
        ).fetchone()
        conn.close()

        tone_id  = (row["voice_tone"] if row and row["voice_tone"] else "best_friend")
        has_voice_key = bool(row and row["voice_openai_key"])
        using_openai  = bool(row and row["ai_provider"] == "openai" and row["ai_api_key"])

        return {
            "tone_id":       tone_id,
            "voice_id":      VOICE_TONES.get(tone_id, VOICE_TONES["best_friend"])["voice"],
            "has_voice_key": has_voice_key,
            "using_openai":  using_openai,
            "key_source":    "voice_key" if has_voice_key else ("ai_provider" if using_openai else None),
            "tones": [
                {
                    "id":     k,
                    "name":   v["name"],
                    "symbol": v["symbol"],
                    "voice":  v["voice"],
                }
                for k, v in VOICE_TONES.items()
            ],
        }


    # ── POST /api/voice/settings ──────────────────────────────────────────────
    @app.post("/api/voice/settings")
    async def save_voice_settings(body: VoiceSettingsRequest, current_user: dict = Depends(require_any_user)):
        if body.tone_id not in VALID_TONES:
            raise HTTPException(400, f"Invalid tone_id. Valid: {', '.join(VALID_TONES)}")

        from src.auth.auth_db import get_db
        conn = get_db()
        conn.execute(
            """
            INSERT INTO user_settings (user_id, voice_tone, voice_openai_key)
            VALUES (?, ?, NULL)
            ON CONFLICT(user_id) DO UPDATE SET
                voice_tone = excluded.voice_tone,
                updated_at = datetime('now')
            """,
            (current_user["id"], body.tone_id),
        )
        conn.commit()
        conn.close()
        return {"ok": True, "tone_id": body.tone_id, "voice_id": body.voice_id}


    # ── POST /api/voice/settings/key ─────────────────────────────────────────
    @app.post("/api/voice/settings/key")
    async def save_voice_key(
        body: dict,
        current_user: dict = Depends(require_any_user)
    ):
        """Save (or clear) a dedicated OpenAI key for TTS."""
        from src.auth.auth_db import get_db
        key = (body.get("voice_openai_key") or "").strip() or None
        conn = get_db()
        conn.execute(
            """
            INSERT INTO user_settings (user_id, voice_openai_key)
            VALUES (?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                voice_openai_key = excluded.voice_openai_key,
                updated_at = datetime('now')
            """,
            (current_user["id"], key),
        )
        conn.commit()
        conn.close()
        return {"ok": True, "has_key": key is not None}
