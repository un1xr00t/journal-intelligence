#!/usr/bin/env python3
"""
scripts/revoke_sessions.py
CLI tool to revoke refresh tokens (kill sessions).

Usage:
    python revoke_sessions.py --username user        # Revoke all sessions for user
    python revoke_sessions.py --all                  # Revoke ALL sessions (nuclear option)
    python revoke_sessions.py --list --username user # List active sessions for user
    python revoke_sessions.py --list                 # List all active sessions
"""

import argparse
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

# ── Configuration ─────────────────────────────────────────────

DB_PATH = Path("/opt/journal-dashboard/db/journal.db")


# ── Database Operations ───────────────────────────────────────

def get_connection() -> sqlite3.Connection:
    """Get database connection."""
    if not DB_PATH.exists():
        print(f"❌ Database not found: {DB_PATH}")
        sys.exit(1)
    
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_user_id(username: str) -> int | None:
    """Get user ID by username."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
    result = cursor.fetchone()
    conn.close()
    return result['id'] if result else None


def list_sessions(username: str | None = None) -> None:
    """List active refresh tokens."""
    conn = get_connection()
    cursor = conn.cursor()
    
    if username:
        user_id = get_user_id(username)
        if not user_id:
            print(f"❌ User '{username}' not found")
            conn.close()
            sys.exit(1)
        
        cursor.execute("""
            SELECT rt.id, u.username, rt.device_hint, rt.ip_address, 
                   rt.issued_at, rt.expires_at, rt.last_used_at
            FROM refresh_tokens rt
            JOIN users u ON rt.user_id = u.id
            WHERE rt.user_id = ? AND rt.revoked = 0 AND rt.expires_at > datetime('now')
            ORDER BY rt.issued_at DESC
        """, (user_id,))
    else:
        cursor.execute("""
            SELECT rt.id, u.username, rt.device_hint, rt.ip_address,
                   rt.issued_at, rt.expires_at, rt.last_used_at
            FROM refresh_tokens rt
            JOIN users u ON rt.user_id = u.id
            WHERE rt.revoked = 0 AND rt.expires_at > datetime('now')
            ORDER BY rt.issued_at DESC
        """)
    
    sessions = cursor.fetchall()
    conn.close()
    
    if not sessions:
        print("No active sessions found.")
        return
    
    print("\n" + "=" * 100)
    print(f"{'ID':<6} {'User':<15} {'Device':<20} {'IP':<15} {'Issued':<20} {'Last Used':<20}")
    print("=" * 100)
    
    for s in sessions:
        device = (s['device_hint'] or "Unknown")[:18]
        ip = (s['ip_address'] or "Unknown")[:13]
        issued = s['issued_at'][:19] if s['issued_at'] else "Unknown"
        last_used = s['last_used_at'][:19] if s['last_used_at'] else "Never"
        print(f"{s['id']:<6} {s['username']:<15} {device:<20} {ip:<15} {issued:<20} {last_used:<20}")
    
    print("=" * 100)
    print(f"Total: {len(sessions)} active session(s)\n")


def revoke_user_sessions(username: str) -> int:
    """Revoke all sessions for a user."""
    user_id = get_user_id(username)
    if not user_id:
        print(f"❌ User '{username}' not found")
        sys.exit(1)
    
    conn = get_connection()
    cursor = conn.cursor()
    
    # Get count of active sessions
    cursor.execute("""
        SELECT COUNT(*) as count FROM refresh_tokens 
        WHERE user_id = ? AND revoked = 0 AND expires_at > datetime('now')
    """, (user_id,))
    count = cursor.fetchone()['count']
    
    if count == 0:
        print(f"No active sessions for '{username}'")
        conn.close()
        return 0
    
    # Revoke all sessions
    now = datetime.now().isoformat()
    cursor.execute("""
        UPDATE refresh_tokens 
        SET revoked = 1, revoked_at = ?
        WHERE user_id = ? AND revoked = 0
    """, (now, user_id))
    
    # Log the revocation
    cursor.execute("""
        INSERT INTO auth_audit (user_id, event, details, timestamp)
        VALUES (?, 'revoke', ?, ?)
    """, (user_id, f"All sessions revoked via CLI ({count} tokens)", now))
    
    conn.commit()
    conn.close()
    
    return count


def revoke_all_sessions() -> int:
    """Revoke ALL sessions for ALL users."""
    conn = get_connection()
    cursor = conn.cursor()
    
    # Get count
    cursor.execute("""
        SELECT COUNT(*) as count FROM refresh_tokens 
        WHERE revoked = 0 AND expires_at > datetime('now')
    """)
    count = cursor.fetchone()['count']
    
    if count == 0:
        print("No active sessions to revoke.")
        conn.close()
        return 0
    
    # Revoke all
    now = datetime.now().isoformat()
    cursor.execute("""
        UPDATE refresh_tokens 
        SET revoked = 1, revoked_at = ?
        WHERE revoked = 0
    """, (now,))
    
    # Log the revocation
    cursor.execute("""
        INSERT INTO auth_audit (user_id, event, details, timestamp)
        VALUES (NULL, 'revoke', ?, ?)
    """, (f"All sessions revoked via CLI ({count} tokens)", now))
    
    conn.commit()
    conn.close()
    
    return count


def revoke_single_session(session_id: int) -> bool:
    """Revoke a single session by ID."""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT user_id FROM refresh_tokens WHERE id = ?", (session_id,))
    result = cursor.fetchone()
    
    if not result:
        print(f"❌ Session ID {session_id} not found")
        conn.close()
        return False
    
    now = datetime.now().isoformat()
    cursor.execute("""
        UPDATE refresh_tokens 
        SET revoked = 1, revoked_at = ?
        WHERE id = ?
    """, (now, session_id))
    
    cursor.execute("""
        INSERT INTO auth_audit (user_id, event, details, timestamp)
        VALUES (?, 'revoke', ?, ?)
    """, (result['user_id'], f"Session {session_id} revoked via CLI", now))
    
    conn.commit()
    conn.close()
    
    return True


# ── CLI ───────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Manage user sessions (refresh tokens)"
    )
    
    parser.add_argument(
        "--username", "-u",
        help="Target username"
    )
    parser.add_argument(
        "--list", "-l",
        action="store_true",
        help="List active sessions instead of revoking"
    )
    parser.add_argument(
        "--all", "-a",
        action="store_true",
        help="Revoke ALL sessions for ALL users (dangerous)"
    )
    parser.add_argument(
        "--session-id", "-s",
        type=int,
        help="Revoke a specific session by ID"
    )
    parser.add_argument(
        "--force", "-f",
        action="store_true",
        help="Skip confirmation prompts"
    )
    
    args = parser.parse_args()
    
    # List mode
    if args.list:
        list_sessions(args.username)
        return
    
    # Revoke single session
    if args.session_id:
        if revoke_single_session(args.session_id):
            print(f"✓ Session {args.session_id} revoked")
        return
    
    # Revoke all sessions (nuclear)
    if args.all:
        if not args.force:
            confirm = input("⚠️  This will revoke ALL sessions for ALL users. Type 'yes' to confirm: ")
            if confirm.lower() != 'yes':
                print("Cancelled.")
                return
        
        count = revoke_all_sessions()
        print(f"✓ Revoked {count} session(s) for all users")
        return
    
    # Revoke user sessions
    if args.username:
        if not args.force:
            list_sessions(args.username)
            confirm = input(f"\nRevoke all sessions for '{args.username}'? (y/N): ")
            if confirm.lower() != 'y':
                print("Cancelled.")
                return
        
        count = revoke_user_sessions(args.username)
        print(f"✓ Revoked {count} session(s) for '{args.username}'")
        return
    
    # No action specified
    parser.print_help()


if __name__ == "__main__":
    main()
