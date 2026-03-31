#!/usr/bin/env python3
"""Print current NAV_GROUPS block then rewrite it cleanly."""

path = '/opt/journal-dashboard/frontend/src/components/Sidebar.jsx'
with open(path, encoding='utf-8') as f:
    src = f.read()

# Print lines 1-70 so we can see exact current state
lines = src.splitlines()
for i, line in enumerate(lines[:70], 1):
    print(f"{i:3}  {line}")
