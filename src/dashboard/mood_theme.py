"""
src/dashboard/mood_theme.py

AI-generated adaptive theme engine.

- Buckets mood scores into 5 emotional states
- Calls Claude API ONCE per bucket (cached to disk forever until manually cleared)
- Returns a full CSS-variable dict + background image URL
- Designed to be called at app startup with zero latency on cache hit

Cache location: /opt/journal-dashboard/data/derived/mood_theme_cache.json
"""

from __future__ import annotations
import json
import os
from pathlib import Path

import yaml

# ── Paths ──────────────────────────────────────────────────────────────────────

from src.config import APP_ROOT as _BASE
_CACHE  = _BASE / "data" / "derived" / "mood_theme_cache.json"
_CFG    = _BASE / "config" / "config.yaml"

# ── Mood buckets ───────────────────────────────────────────────────────────────

_BUCKETS: list[tuple[float, float, str]] = [
    (0.0,  2.0, "desolate"),
    (2.0,  4.0, "melancholy"),
    (4.0,  6.5, "grounded"),
    (6.5,  8.0, "hopeful"),
    (8.0, 10.1, "luminous"),
]


def score_to_bucket(score: float | None) -> str:
    if score is None:
        return "grounded"
    for lo, hi, name in _BUCKETS:
        if lo <= score < hi:
            return name
    return "grounded"


# ── Cache helpers ──────────────────────────────────────────────────────────────

def _read_cache() -> dict:
    try:
        return json.loads(_CACHE.read_text())
    except Exception:
        return {}


def _write_cache(cache: dict) -> None:
    _CACHE.parent.mkdir(parents=True, exist_ok=True)
    _CACHE.write_text(json.dumps(cache, indent=2))


# ── Config / API key ───────────────────────────────────────────────────────────

def _api_key() -> str:
    try:
        cfg = yaml.safe_load(_CFG.read_text())
        return cfg["anthropic"]["api_key"]
    except Exception:
        return os.environ.get("ANTHROPIC_API_KEY", "")


# ── Fallback themes (no API needed) ───────────────────────────────────────────

_FALLBACKS: dict[str, dict] = {
    "desolate": {
        "name":              "Desolate",
        "bg_base":           "#050508",
        "bg_surface":        "#08080e",
        "bg_card":           "#0c0c14",
        "sidebar_bg":        "#040407",
        "border":            "rgba(255,255,255,0.05)",
        "border_strong":     "rgba(255,255,255,0.10)",
        "accent":            "#52525b",
        "accent_2":          "#3f3f46",
        "accent_soft":       "rgba(82,82,91,0.15)",
        "accent_glow":       "rgba(82,82,91,0.06)",
        "text_primary":      "#d4d4d8",
        "text_secondary":    "#71717a",
        "text_muted":        "#3f3f46",
        "status_ok":         "#16a34a",
        "status_warn":       "#d97706",
        "status_danger":     "#dc2626",
        "gradient_mesh":     "radial-gradient(ellipse at 20% 50%, rgba(30,27,75,0.4) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(15,15,30,0.6) 0%, transparent 50%)",
        "unsplash_keywords": "dark,foggy,empty,desolate,minimal",
        "bg_img_opacity":    "0.08",
        "emotion":           "Still. Heavy. Quiet.",
    },
    "melancholy": {
        "name":              "Melancholy",
        "bg_base":           "#06060f",
        "bg_surface":        "#0a0a1a",
        "bg_card":           "#0e0e22",
        "sidebar_bg":        "#04040c",
        "border":            "rgba(139,92,246,0.08)",
        "border_strong":     "rgba(139,92,246,0.16)",
        "accent":            "#7c3aed",
        "accent_2":          "#6d28d9",
        "accent_soft":       "rgba(124,58,237,0.12)",
        "accent_glow":       "rgba(124,58,237,0.06)",
        "text_primary":      "#ede9fe",
        "text_secondary":    "#7c6fcd",
        "text_muted":        "#4c3d8f",
        "status_ok":         "#059669",
        "status_warn":       "#d97706",
        "status_danger":     "#dc2626",
        "gradient_mesh":     "radial-gradient(ellipse at 30% 70%, rgba(109,40,217,0.2) 0%, transparent 55%), radial-gradient(ellipse at 70% 20%, rgba(76,29,149,0.15) 0%, transparent 50%)",
        "unsplash_keywords": "purple,rain,moody,atmospheric,dusk",
        "bg_img_opacity":    "0.10",
        "emotion":           "Soft ache. Violet hours.",
    },
    "grounded": {
        "name":              "Grounded",
        "bg_base":           "#07070f",
        "bg_surface":        "#0c0c18",
        "bg_card":           "#10101e",
        "sidebar_bg":        "#05050c",
        "border":            "rgba(99,102,241,0.08)",
        "border_strong":     "rgba(99,102,241,0.15)",
        "accent":            "#6366f1",
        "accent_2":          "#8b5cf6",
        "accent_soft":       "rgba(99,102,241,0.12)",
        "accent_glow":       "rgba(99,102,241,0.06)",
        "text_primary":      "#f0eff8",
        "text_secondary":    "#7a7998",
        "text_muted":        "#45445a",
        "status_ok":         "#10b981",
        "status_warn":       "#f59e0b",
        "status_danger":     "#ef4444",
        "gradient_mesh":     "radial-gradient(ellipse at 25% 60%, rgba(99,102,241,0.12) 0%, transparent 55%), radial-gradient(ellipse at 75% 25%, rgba(139,92,246,0.08) 0%, transparent 50%)",
        "unsplash_keywords": "dark,night,minimal,architecture,blue",
        "bg_img_opacity":    "0.09",
        "emotion":           "Present. Steady. Clear.",
    },
    "hopeful": {
        "name":              "Hopeful",
        "bg_base":           "#04090a",
        "bg_surface":        "#071212",
        "bg_card":           "#0a1818",
        "sidebar_bg":        "#030808",
        "border":            "rgba(16,185,129,0.09)",
        "border_strong":     "rgba(16,185,129,0.18)",
        "accent":            "#10b981",
        "accent_2":          "#059669",
        "accent_soft":       "rgba(16,185,129,0.12)",
        "accent_glow":       "rgba(16,185,129,0.06)",
        "text_primary":      "#ecfdf5",
        "text_secondary":    "#6ee7b7",
        "text_muted":        "#065f46",
        "status_ok":         "#10b981",
        "status_warn":       "#f59e0b",
        "status_danger":     "#ef4444",
        "gradient_mesh":     "radial-gradient(ellipse at 20% 70%, rgba(16,185,129,0.15) 0%, transparent 55%), radial-gradient(ellipse at 80% 20%, rgba(5,150,105,0.10) 0%, transparent 50%)",
        "unsplash_keywords": "forest,dawn,green,light,nature",
        "bg_img_opacity":    "0.10",
        "emotion":           "Something is opening.",
    },
    "luminous": {
        "name":              "Luminous",
        "bg_base":           "#07060a",
        "bg_surface":        "#100d14",
        "bg_card":           "#16111e",
        "sidebar_bg":        "#050408",
        "border":            "rgba(245,158,11,0.09)",
        "border_strong":     "rgba(245,158,11,0.18)",
        "accent":            "#f59e0b",
        "accent_2":          "#ef4444",
        "accent_soft":       "rgba(245,158,11,0.12)",
        "accent_glow":       "rgba(245,158,11,0.06)",
        "text_primary":      "#fffbeb",
        "text_secondary":    "#fcd34d",
        "text_muted":        "#78350f",
        "status_ok":         "#10b981",
        "status_warn":       "#f59e0b",
        "status_danger":     "#ef4444",
        "gradient_mesh":     "radial-gradient(ellipse at 30% 60%, rgba(245,158,11,0.15) 0%, transparent 55%), radial-gradient(ellipse at 70% 20%, rgba(239,68,68,0.08) 0%, transparent 50%)",
        "unsplash_keywords": "golden,sunrise,warmth,sky,light",
        "bg_img_opacity":    "0.09",
        "emotion":           "Alive. Burning bright.",
    },
}


# ── AI theme generation ────────────────────────────────────────────────────────

_PROMPT = """You are a creative director designing an adaptive dark UI theme for a personal journal intelligence dashboard.

Mood state: "{mood_label}" | Score: {score:.1f}/10 | Bucket: {bucket}

Create a deeply atmospheric dark theme that emotionally resonates with this state.

REQUIREMENTS:
- All backgrounds must be very dark (bg_base hex brightness < 12)
- Text colors must be readable (text_primary near white, minimum contrast)
- Accent colors should emotionally match the mood bucket
- Include Unsplash search keywords for a beautiful, moody background photo

Return ONLY valid JSON, no markdown fences, no extra text:
{{
  "name": "evocative theme name (2-3 words)",
  "bg_base": "#hex",
  "bg_surface": "#hex",
  "bg_card": "#hex",
  "sidebar_bg": "#hex",
  "border": "rgba(r,g,b,0.07-0.10)",
  "border_strong": "rgba(r,g,b,0.14-0.20)",
  "accent": "#hex",
  "accent_2": "#hex",
  "accent_soft": "rgba(r,g,b,0.12)",
  "accent_glow": "rgba(r,g,b,0.06)",
  "text_primary": "#hex near white",
  "text_secondary": "#hex mid tone",
  "text_muted": "#hex very dim",
  "status_ok": "#hex green variant",
  "status_warn": "#hex amber variant",
  "status_danger": "#hex red variant",
  "gradient_mesh": "radial-gradient(...) CSS for subtle color wash",
  "unsplash_keywords": "comma,separated,2-4,keywords",
  "bg_img_opacity": "0.08 to 0.12",
  "emotion": "short evocative phrase 3-5 words"
}}"""


def _ai_generate(bucket: str, mood_label: str, score: float) -> dict:
    import anthropic as _anthropic
    client = _anthropic.Anthropic(api_key=_api_key())
    resp = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=900,
        messages=[{
            "role": "user",
            "content": _PROMPT.format(
                mood_label=mood_label, score=score, bucket=bucket
            )
        }]
    )
    raw = resp.content[0].text.strip()
    # Strip any accidental markdown fences
    if "```" in raw:
        parts = raw.split("```")
        for part in parts:
            p = part.strip()
            if p.startswith("{"):
                raw = p
                break
    theme = json.loads(raw)
    theme["bucket"] = bucket
    theme["score"]  = score
    # Build bg image URL from Unsplash source
    kw = theme.get("unsplash_keywords", "dark abstract").replace(" ", "")
    theme["bg_url"] = f"https://source.unsplash.com/featured/1920x1080/?{kw}"
    return theme


# ── Public API ─────────────────────────────────────────────────────────────────

def get_theme(mood_score: float | None, mood_label: str = "neutral") -> dict:
    """
    Return the theme dict for the given mood score.
    Hits cache first — only calls AI API once per bucket, ever.
    Falls back to a hardcoded theme if the API call fails.
    """
    bucket = score_to_bucket(mood_score)
    cache  = _read_cache()

    # Cache hit
    if bucket in cache:
        return cache[bucket]

    # Try AI generation
    try:
        theme = _ai_generate(bucket, mood_label, mood_score or 5.0)
        # Build bg_url if AI didn't include it
        if "bg_url" not in theme:
            kw = theme.get("unsplash_keywords", "dark abstract").replace(" ", "")
            theme["bg_url"] = f"https://source.unsplash.com/featured/1920x1080/?{kw}"
        cache[bucket] = theme
        _write_cache(cache)
        return theme
    except Exception:
        # Fallback — don't write to cache so we retry next time
        fallback = dict(_FALLBACKS.get(bucket, _FALLBACKS["grounded"]))
        kw = fallback.get("unsplash_keywords", "dark abstract").replace(" ", "")
        fallback["bg_url"] = f"https://source.unsplash.com/featured/1920x1080/?{kw}"
        fallback["bucket"] = bucket
        return fallback


def invalidate_cache(bucket: str | None = None) -> None:
    """Remove one bucket (or all) from cache so it regenerates next load."""
    cache = _read_cache()
    if bucket:
        cache.pop(bucket, None)
    else:
        cache = {}
    _write_cache(cache)


def get_all_cached() -> dict:
    """Return the full cache dict (for admin display)."""
    return _read_cache()
