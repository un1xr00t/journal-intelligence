"""
src/config.py
─────────────────────────────────────────────────────────────────────────────
Central path and config resolver for Journal Intelligence Dashboard.

All modules import from here instead of hardcoding /opt/journal-dashboard.

Usage:
    from src.config import APP_ROOT, CONFIG_PATH, DB_PATH, get_config

Environment variable:
    JOURNAL_HOME  — path to the app root directory
                    defaults to the parent of this file's package root

    Example VPS:   export JOURNAL_HOME=/opt/journal-dashboard
    Example local: export JOURNAL_HOME=/Users/you/journal-dashboard
    Example Docker: set in docker-compose.yml or Dockerfile ENV
"""

import os
import yaml
from pathlib import Path
from functools import lru_cache

# ── Root resolution ───────────────────────────────────────────────────────────

def _resolve_root() -> Path:
    """
    Resolve app root. Preference order:
      1. JOURNAL_HOME env var (explicit override)
      2. Two levels up from this file (src/config.py → project root)
    """
    env_home = os.environ.get("JOURNAL_HOME", "").strip()
    if env_home:
        return Path(env_home).resolve()
    # Fallback: infer from file location (works for local dev)
    return Path(__file__).resolve().parent.parent


APP_ROOT = _resolve_root()

# ── Standard paths ────────────────────────────────────────────────────────────

CONFIG_PATH  = APP_ROOT / "config" / "config.yaml"
PROMPTS_PATH = APP_ROOT / "config" / "prompts.yaml"
TOPICS_PATH  = APP_ROOT / "config" / "topics.yaml"
THEME_PATH   = APP_ROOT / "config" / "theme.yaml"

DB_PATH      = APP_ROOT / "db" / "journal.db"

DATA_DIR         = APP_ROOT / "data"
RAW_DIR          = DATA_DIR / "raw"
INGEST_DIR       = DATA_DIR / "ingest"
DERIVED_DIR      = DATA_DIR / "derived"
EXPORTS_DIR      = DERIVED_DIR / "exports"
MASTER_SUMMARY_DIR = DERIVED_DIR / "master_summary"
USER_MEMORY_DIR  = DERIVED_DIR / "user_memory"
EXIT_PLAN_DIR    = DATA_DIR / "exit_plan"

LOGS_DIR     = APP_ROOT / "logs"
AUDIT_LOG    = LOGS_DIR / "reflection_audit.jsonl"

# ── Config loader ─────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def get_config() -> dict:
    """Load and cache config.yaml. Call get_config.cache_clear() to reload."""
    if not CONFIG_PATH.exists():
        raise FileNotFoundError(
            f"config.yaml not found at {CONFIG_PATH}\n"
            f"Copy config/config.example.yaml to config/config.yaml and fill in your values.\n"
            f"Set JOURNAL_HOME env var if your app root is not {APP_ROOT}"
        )
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


# Convenience shim — matches existing usage pattern across the codebase
def load_config() -> dict:
    return get_config()
