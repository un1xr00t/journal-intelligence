"""
src/api/ai_client.py
Unified AI client — provider-agnostic message creation.

Supported providers:
  anthropic      — Anthropic Claude API (default)
  openai         — OpenAI API
  openai_compat  — Any OpenAI-compatible endpoint (OpenRouter, Together, Groq…)
  local          — Local model via OpenAI-compatible API (Ollama, LM Studio…)

Usage everywhere AI is called:
    from src.api.ai_client import create_message
    text = create_message(user_id, system="...", user_prompt="...", max_tokens=900)

Falls back to config.yaml anthropic key if the user has no key set.
"""

from __future__ import annotations
import logging
from pathlib import Path
from typing import Optional

import yaml

logger = logging.getLogger("journal")
from src.config import CONFIG_PATH, load_config

# Default models per provider
DEFAULT_MODELS = {
    "anthropic":     "claude-sonnet-4-5",
    "openai":        "gpt-4o-mini",
    "openai_compat": "gpt-4o-mini",
    "local":         "llama3",
}


def _load_config() -> dict:
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


def get_user_ai_settings(user_id: Optional[int]) -> dict:
    """
    Return the AI settings for a user from user_settings table.
    Returns {} if no row exists or user_id is None.
    """
    if user_id is None:
        return {}
    try:
        from src.auth.auth_db import get_db
        conn = get_db()
        row = conn.execute(
            "SELECT ai_provider, ai_api_key, ai_base_url, ai_model "
            "FROM user_settings WHERE user_id = ?",
            (user_id,)
        ).fetchone()
        conn.close()
        if row and row["ai_api_key"]:
            return dict(row)
    except Exception as e:
        logger.warning(f"[ai_client] Failed to load user settings for {user_id}: {e}")
    return {}


def create_message(
    user_id: Optional[int],
    system: str,
    user_prompt: str,
    max_tokens: int = 1000,
    model: Optional[str] = None,
) -> str:
    """
    Send a message to the configured AI provider and return the text response.
    Raises on API errors — callers should wrap in try/except HTTPException.
    """
    cfg = _load_config()
    settings = get_user_ai_settings(user_id)

    provider = settings.get("ai_provider") or "anthropic"
    api_key  = settings.get("ai_api_key")
    base_url = settings.get("ai_base_url")
    mdl      = model or settings.get("ai_model") or None

    if provider == "anthropic":
        return _call_anthropic(cfg, api_key, mdl, system, user_prompt, max_tokens)
    else:
        return _call_openai_compat(provider, api_key, base_url, mdl, system, user_prompt, max_tokens)


# ── Anthropic ─────────────────────────────────────────────────────────────────

def _call_anthropic(cfg, api_key, model, system, user_prompt, max_tokens) -> str:
    import anthropic

    # Fall back to config.yaml key if user has none set
    key = api_key or cfg.get("anthropic", {}).get("api_key", "")
    if not key:
        raise RuntimeError("No Anthropic API key configured. Add one in Settings → AI Preferences.")

    mdl = model or cfg.get("anthropic", {}).get("model", DEFAULT_MODELS["anthropic"])

    client = anthropic.Anthropic(api_key=key)
    msg = client.messages.create(
        model=mdl,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user_prompt}],
    )
    return msg.content[0].text


# ── OpenAI-compatible (covers openai / openai_compat / local) ─────────────────

def _call_openai_compat(provider, api_key, base_url, model, system, user_prompt, max_tokens) -> str:
    try:
        import openai
    except ImportError:
        raise RuntimeError(
            "openai package not installed. Run: pip install openai --break-system-packages"
        )

    if not api_key:
        raise RuntimeError(
            f"No API key configured for provider '{provider}'. Add one in Settings → AI Preferences."
        )

    mdl = model or DEFAULT_MODELS.get(provider, "gpt-4o-mini")

    kwargs = {"api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url
    elif provider == "local":
        kwargs["base_url"] = "http://localhost:11434/v1"  # Ollama default

    client = openai.OpenAI(**kwargs)
    resp = client.chat.completions.create(
        model=mdl,
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user_prompt},
        ],
    )
    return resp.choices[0].message.content


# ── Legacy helpers (backward compat for any code still using these) ───────────

def get_anthropic_key(user_id: Optional[int] = None) -> str:
    """Backward compat shim. Prefer create_message() for new code."""
    settings = get_user_ai_settings(user_id)
    if settings.get("ai_api_key") and settings.get("ai_provider", "anthropic") == "anthropic":
        return settings["ai_api_key"]
    cfg = _load_config()
    return cfg.get("anthropic", {}).get("api_key", "")


def get_anthropic_client(user_id: Optional[int] = None):
    """Backward compat shim. Returns an anthropic.Anthropic instance."""
    import anthropic
    return anthropic.Anthropic(api_key=get_anthropic_key(user_id))


def get_model(cfg: Optional[dict] = None) -> str:
    if cfg is None:
        cfg = _load_config()
    return cfg.get("anthropic", {}).get("model", DEFAULT_MODELS["anthropic"])
