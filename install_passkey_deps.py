#!/usr/bin/env python3
"""install_passkey_deps.py — install py_webauthn into the venv."""
import subprocess, sys

DEPS = ["py_webauthn"]

for dep in DEPS:
    print(f"Installing {dep}...")
    r = subprocess.run(
        [sys.executable, "-m", "pip", "install", dep, "--break-system-packages"],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        print(r.stderr)
        sys.exit(1)
    print(f"  OK")

print("\nAll passkey deps installed.")
