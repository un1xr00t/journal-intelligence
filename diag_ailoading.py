#!/usr/bin/env python3
"""
diag_ailoading.py
Finds every reference to aiLoading, aiResources across all JSX files
to locate the file causing the 'Can't find variable: aiLoading' error.
"""

import os
import re

JSX_DIR = "/opt/journal-dashboard/frontend/src"

for root, dirs, files in os.walk(JSX_DIR):
    for fname in files:
        if not fname.endswith(".jsx") and not fname.endswith(".js"):
            continue
        fpath = os.path.join(root, fname)
        with open(fpath) as f:
            try:
                lines = f.readlines()
            except:
                continue
        hits = [(i+1, l.rstrip()) for i, l in enumerate(lines) if "aiLoading" in l or "aiResources" in l]
        if hits:
            print(f"\n{'='*60}")
            print(f"FILE: {fpath}")
            for lineno, line in hits:
                print(f"  line {lineno}: {line.strip()}")
