#!/usr/bin/env python3
"""
migrate_paths.py
─────────────────────────────────────────────────────────────────────────────
One-shot script to replace all hardcoded /opt/journal-dashboard paths
in Python source files with imports from src.config.

Run from project root:
    python3 migrate_paths.py [--dry-run]

What it does:
  - Adds `from src.config import APP_ROOT, CONFIG_PATH, ...` imports
  - Replaces hardcoded Path("/opt/journal-dashboard/...") with config vars
  - Backs up each file before modifying (file.py.bak)
─────────────────────────────────────────────────────────────────────────────
"""

import re
import sys
import shutil
from pathlib import Path

DRY_RUN = "--dry-run" in sys.argv

# Files and their expected replacements
REPLACEMENTS = {
    "src/auth/auth_db.py": [
        (
            'CONFIG_PATH = Path("/opt/journal-dashboard/config/config.yaml")',
            'from src.config import CONFIG_PATH, DB_PATH, load_config'
        ),
    ],
    "src/auth/auth_service.py": [
        (
            'CONFIG_PATH = Path("/opt/journal-dashboard/config/config.yaml")',
            'from src.config import CONFIG_PATH, load_config'
        ),
    ],
    "src/api/ai_client.py": [
        (
            'CONFIG_PATH = Path("/opt/journal-dashboard/config/config.yaml")',
            'from src.config import CONFIG_PATH, load_config'
        ),
    ],
    "src/api/anthropic_helper.py": [
        (
            'CONFIG_PATH = Path("/opt/journal-dashboard/config/config.yaml")',
            'from src.config import CONFIG_PATH, load_config'
        ),
    ],
    "src/ingest/service.py": [
        (
            'CONFIG_PATH = Path("/opt/journal-dashboard/config/config.yaml")',
            'from src.config import CONFIG_PATH, load_config'
        ),
    ],
    "src/dashboard/mood_theme.py": [
        (
            '_BASE   = Path("/opt/journal-dashboard")',
            'from src.config import APP_ROOT as _BASE'
        ),
    ],
    "src/nlp/extractor.py": [
        (
            'CONFIG_PATH = Path("/opt/journal-dashboard/config/config.yaml")',
            'from src.config import CONFIG_PATH, PROMPTS_PATH, load_config'
        ),
        (
            'PROMPTS_PATH = Path("/opt/journal-dashboard/config/prompts.yaml")',
            '# PROMPTS_PATH imported from src.config'
        ),
    ],
    "src/nlp/master_summary.py": [
        (
            'CONFIG_PATH = Path("/opt/journal-dashboard/config/config.yaml")',
            'from src.config import CONFIG_PATH, PROMPTS_PATH, MASTER_SUMMARY_DIR, load_config'
        ),
        (
            'PROMPTS_PATH = Path("/opt/journal-dashboard/config/prompts.yaml")',
            '# PROMPTS_PATH imported from src.config'
        ),
    ],
    "src/patterns/detectors.py": [
        (
            'DB_PATH = Path("/opt/journal-dashboard/db/journal.db")',
            'from src.config import DB_PATH'
        ),
    ],
    "src/patterns/ai_detector.py": [
        (
            'DB_PATH = Path("/opt/journal-dashboard/db/journal.db")',
            'from src.config import DB_PATH, CONFIG_PATH, PROMPTS_PATH, load_config'
        ),
        (
            'CONFIG_PATH = Path("/opt/journal-dashboard/config/config.yaml")',
            '# CONFIG_PATH imported from src.config'
        ),
        (
            'PROMPTS_PATH = Path("/opt/journal-dashboard/config/prompts.yaml")',
            '# PROMPTS_PATH imported from src.config'
        ),
    ],
    "src/api/export_engine.py": [
        (
            'BASE_DIR       = Path("/opt/journal-dashboard")',
            'from src.config import APP_ROOT as BASE_DIR, CONFIG_PATH, EXPORTS_DIR, load_config'
        ),
    ],
    "src/nlp/export_engine.py": [
        (
            'BASE_DIR   = Path("/opt/journal-dashboard")',
            'from src.config import APP_ROOT as BASE_DIR, CONFIG_PATH, EXPORTS_DIR, load_config'
        ),
    ],
    "src/api/exit_plan_routes.py": [
        (
            'CONFIG_PATH      = Path("/opt/journal-dashboard/config/config.yaml")',
            'from src.config import CONFIG_PATH, EXIT_PLAN_DIR as ATTACHMENT_BASE, load_config'
        ),
        (
            'ATTACHMENT_BASE  = Path("/opt/journal-dashboard/data/exit_plan")',
            '# ATTACHMENT_BASE imported from src.config as EXIT_PLAN_DIR'
        ),
    ],
    "src/api/resources_routes.py": [
        (
            'CONFIG_PATH = Path("/opt/journal-dashboard/config/config.yaml")',
            'from src.config import CONFIG_PATH, load_config'
        ),
    ],
    "src/api/onboarding_routes.py": [
        (
            'CONFIG_PATH   = Path("/opt/journal-dashboard/config/config.yaml")',
            'from src.config import CONFIG_PATH, USER_MEMORY_DIR as MEMORY_DIR, load_config'
        ),
        (
            'MEMORY_DIR    = Path("/opt/journal-dashboard/data/derived/user_memory")',
            '# MEMORY_DIR imported from src.config as USER_MEMORY_DIR'
        ),
    ],
    "src/api/main.py": [
        (
            'CONFIG_PATH = Path("/opt/journal-dashboard/config/config.yaml")',
            'from src.config import CONFIG_PATH, AUDIT_LOG, load_config'
        ),
        (
            '_AUDIT_LOG = "/opt/journal-dashboard/logs/reflection_audit.jsonl"',
            '_AUDIT_LOG = str(AUDIT_LOG)'
        ),
        (
            '_cfg = _yaml.safe_load(open("/opt/journal-dashboard/config/config.yaml"))',
            '_cfg = _yaml.safe_load(open(CONFIG_PATH))'
        ),
    ],
    "src/api/user_memory_routes.py": [
        (
            'CONFIG_PATH = Path("/opt/journal-dashboard/config/config.yaml")',
            'from src.config import CONFIG_PATH, USER_MEMORY_DIR, load_config'
        ),
    ],
}


def apply_replacements(filepath: str, replacements: list) -> int:
    path = Path(filepath)
    if not path.exists():
        print(f"  SKIP (not found): {filepath}")
        return 0

    content = path.read_text()
    original = content
    changed = 0

    for old, new in replacements:
        if old in content:
            content = content.replace(old, new, 1)
            changed += 1
            print(f"  ✓ {filepath}: replaced hardcoded path")
        else:
            print(f"  ~ {filepath}: pattern not found (may already be patched)")

    if changed and not DRY_RUN:
        shutil.copy2(path, path.with_suffix(path.suffix + ".bak"))
        path.write_text(content)

    return changed


def main():
    print(f"{'DRY RUN — ' if DRY_RUN else ''}Migrating hardcoded paths to src.config...\n")
    total = 0
    for filepath, replacements in REPLACEMENTS.items():
        total += apply_replacements(filepath, replacements)

    print(f"\n{'Would change' if DRY_RUN else 'Changed'} {total} occurrences.")
    if not DRY_RUN:
        print("Backups saved as *.bak — delete after verifying the app still starts.")
    print("\nNext: restart the API and run a smoke test.")


if __name__ == "__main__":
    main()
