"""
src/api/settings_routes.py
Per-user AI provider settings — provider-agnostic key management.

Routes:
  GET    /api/settings/ai-provider          → {provider, has_key, preview, base_url, model}
  PUT    /api/settings/ai-provider          → save settings
  DELETE /api/settings/ai-provider          → clear key (keeps provider/url)

Wire up in main.py:
  from src.api.settings_routes import register_settings_routes
  register_settings_routes(app, require_any_user)
"""

from __future__ import annotations
import logging
from typing import Optional

from fastapi import Depends, HTTPException
from pydantic import BaseModel

logger = logging.getLogger("journal")

VALID_PROVIDERS = {"anthropic", "openai", "openai_compat", "local"}


class SaveAISettingsRequest(BaseModel):
    provider:  str
    api_key:   Optional[str] = None
    base_url:  Optional[str] = None
    model:     Optional[str] = None


def register_settings_routes(app, require_any_user):

    @app.get("/api/settings/ai-provider")
    async def get_ai_provider(current_user: dict = Depends(require_any_user)):
        """Return the user's current AI provider settings (key masked)."""
        from src.auth.auth_db import get_db
        conn = get_db()
        row = conn.execute(
            "SELECT ai_provider, ai_api_key, ai_base_url, ai_model "
            "FROM user_settings WHERE user_id = ?",
            (current_user["id"],)
        ).fetchone()
        conn.close()

        if not row:
            return {"provider": "anthropic", "has_key": False, "preview": None,
                    "base_url": None, "model": None}

        key = row["ai_api_key"]
        if key and len(key) > 18:
            preview = key[:10] + "..." + key[-4:]
        elif key:
            preview = key[:4] + "..." + key[-2:]
        else:
            preview = None

        return {
            "provider": row["ai_provider"] or "anthropic",
            "has_key":  bool(key),
            "preview":  preview,
            "base_url": row["ai_base_url"],
            "model":    row["ai_model"],
        }

    @app.put("/api/settings/ai-provider")
    async def save_ai_provider(
        body: SaveAISettingsRequest,
        current_user: dict = Depends(require_any_user),
    ):
        """Save AI provider settings. Validates key for anthropic/openai."""
        provider = body.provider.lower().strip()
        if provider not in VALID_PROVIDERS:
            raise HTTPException(400, f"Provider must be one of: {', '.join(sorted(VALID_PROVIDERS))}")

        api_key  = (body.api_key  or "").strip() or None
        base_url = (body.base_url or "").strip() or None
        model    = (body.model    or "").strip() or None

        # Require base_url for local / openai_compat
        if provider in ("local", "openai_compat") and not base_url:
            raise HTTPException(400, f"base_url is required for provider '{provider}'")

        # Validate key format + live test for known providers
        if api_key:
            if provider == "anthropic":
                if not api_key.startswith("sk-"):
                    raise HTTPException(422, "Anthropic keys must start with 'sk-'")
                _validate_anthropic_key(api_key)

            elif provider == "openai":
                if not api_key.startswith("sk-"):
                    raise HTTPException(422, "OpenAI keys must start with 'sk-'")
                # Don't do a live test for openai to avoid costs; format check is enough

        from src.auth.auth_db import get_db
        conn = get_db()
        conn.execute("""
            INSERT INTO user_settings (user_id, ai_provider, ai_api_key, ai_base_url, ai_model, updated_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(user_id) DO UPDATE SET
                ai_provider = excluded.ai_provider,
                ai_api_key  = excluded.ai_api_key,
                ai_base_url = excluded.ai_base_url,
                ai_model    = excluded.ai_model,
                updated_at  = excluded.updated_at
        """, (current_user["id"], provider, api_key, base_url, model))
        conn.commit()
        conn.close()

        logger.info(f"[settings] AI provider '{provider}' saved for user {current_user['id']}")
        return {"status": "saved", "provider": provider}

    @app.delete("/api/settings/ai-provider")
    async def clear_ai_key(current_user: dict = Depends(require_any_user)):
        """Clear just the API key (keep provider/url preferences)."""
        from src.auth.auth_db import get_db
        conn = get_db()
        conn.execute("""
            UPDATE user_settings
            SET ai_api_key = NULL, updated_at = datetime('now')
            WHERE user_id = ?
        """, (current_user["id"],))
        conn.commit()
        conn.close()
        return {"status": "cleared"}


def _validate_anthropic_key(key: str):
    """Make a cheap test call to verify the Anthropic key is valid."""
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=key)
        client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=5,
            messages=[{"role": "user", "content": "hi"}],
        )
    except anthropic.AuthenticationError:
        raise HTTPException(422, "Invalid Anthropic key — authentication failed")
    except Exception as e:
        # Non-auth errors (rate limits, network) — save anyway
        logger.warning(f"[settings] Anthropic key validation non-auth error (saving anyway): {e}")
