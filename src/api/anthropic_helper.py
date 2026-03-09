"""
src/api/anthropic_helper.py
Central helper for Anthropic client instantiation.

Every AI call site should use get_anthropic_client(user_id) instead of
reading config.yaml directly. Falls back to config.yaml key if the user
has not set their own key — preserves backward compatibility for admin.
"""

from __future__ import annotations
from pathlib import Path
from typing import Optional

import anthropic
import yaml

from src.config import CONFIG_PATH, load_config


def _load_config() -> dict:
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


def get_anthropic_key(user_id: Optional[int] = None) -> str:
    """
    Return the Anthropic API key to use for a given user.
    Lookup order:
      1. user_settings.anthropic_api_key for this user_id (if set)
      2. config.yaml anthropic.api_key (fallback / admin)
    """
    if user_id is not None:
        try:
            from src.auth.auth_db import get_db
            conn = get_db()
            row = conn.execute(
                "SELECT anthropic_api_key FROM user_settings WHERE user_id = ?",
                (user_id,)
            ).fetchone()
            conn.close()
            if row and row["anthropic_api_key"]:
                return row["anthropic_api_key"]
        except Exception:
            pass

    cfg = _load_config()
    return cfg["anthropic"]["api_key"]


def get_anthropic_client(user_id: Optional[int] = None) -> anthropic.Anthropic:
    """Return an Anthropic client initialised with the correct key for this user."""
    return anthropic.Anthropic(api_key=get_anthropic_key(user_id))


def get_model(cfg: Optional[dict] = None) -> str:
    """Return the configured model name."""
    if cfg is None:
        cfg = _load_config()
    return cfg.get("anthropic", {}).get("model", "claude-sonnet-4-5")
