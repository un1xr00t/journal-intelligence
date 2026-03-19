#!/usr/bin/env python3
"""
install_2fa_deps.py
Installs Python dependencies for TOTP 2FA:
  - pyotp     — TOTP generation/verification
  - qrcode    — QR code PNG generation
  - pillow    — required by qrcode for PNG output

Run from server (venv must be active):
  source /opt/journal-dashboard/venv/bin/activate
  python3 install_2fa_deps.py
"""

import subprocess
import sys

PACKAGES = ["pyotp", "qrcode[pil]"]

for pkg in PACKAGES:
    print(f"Installing {pkg}...")
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", pkg, "--break-system-packages", "-q"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"  ERROR: {result.stderr.strip()}")
        sys.exit(1)
    print(f"  OK")

print("\nAll 2FA dependencies installed.")
print("Verify with:")
print("  python3 -c \"import pyotp, qrcode; print('OK')\"")
