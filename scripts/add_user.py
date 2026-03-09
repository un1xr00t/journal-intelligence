#!/usr/bin/env python3
"""
scripts/add_user.py
CLI tool to add users or reset passwords.

Usage:
    python add_user.py add --email user@example.com --username user --role owner
    python add_user.py reset --username user
    python add_user.py list
"""

import argparse
import getpass
import re
import secrets
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

import bcrypt

# ── Configuration ─────────────────────────────────────────────

DB_PATH = Path("/opt/journal-dashboard/db/journal.db")
BCRYPT_COST = 12
MIN_PASSWORD_LENGTH = 12

# ── Password Validation ───────────────────────────────────────

def validate_password(password: str) -> tuple[bool, str]:
    """
    Validate password meets requirements:
    - Minimum 12 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit
    - At least one special character
    """
    if len(password) < MIN_PASSWORD_LENGTH:
        return False, f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
    
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter"
    
    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter"
    
    if not re.search(r"\d", password):
        return False, "Password must contain at least one digit"
    
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        return False, "Password must contain at least one special character"
    
    return True, "Password meets requirements"


def hash_password(password: str) -> str:
    """Hash password using bcrypt."""
    salt = bcrypt.gensalt(rounds=BCRYPT_COST)
    return bcrypt.hashpw(password.encode(), salt).decode()


def prompt_password() -> str:
    """Prompt for password with confirmation."""
    while True:
        password = getpass.getpass("Enter password: ")
        valid, message = validate_password(password)
        if not valid:
            print(f"❌ {message}")
            continue
        
        confirm = getpass.getpass("Confirm password: ")
        if password != confirm:
            print("❌ Passwords do not match")
            continue
        
        return password


def generate_password() -> str:
    """Generate a strong random password."""
    # Ensure all character types are present
    password = [
        secrets.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ"),
        secrets.choice("abcdefghijklmnopqrstuvwxyz"),
        secrets.choice("0123456789"),
        secrets.choice("!@#$%^&*"),
    ]
    # Fill remaining with random chars
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*"
    password.extend(secrets.choice(alphabet) for _ in range(12))
    secrets.SystemRandom().shuffle(password)
    return "".join(password)


# ── Database Operations ───────────────────────────────────────

def get_connection() -> sqlite3.Connection:
    """Get database connection."""
    if not DB_PATH.exists():
        print(f"❌ Database not found: {DB_PATH}")
        print("   Run schema.sql first to create the database.")
        sys.exit(1)
    
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def add_user(email: str, username: str, role: str, password: str | None = None) -> None:
    """Add a new user."""
    conn = get_connection()
    cursor = conn.cursor()
    
    # Check if email already exists
    cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
    if cursor.fetchone():
        print(f"❌ User with email '{email}' already exists")
        conn.close()
        sys.exit(1)
    
    # Check if username already exists
    cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
    if cursor.fetchone():
        print(f"❌ User with username '{username}' already exists")
        conn.close()
        sys.exit(1)
    
    # Get or generate password
    if password:
        valid, message = validate_password(password)
        if not valid:
            print(f"❌ {message}")
            conn.close()
            sys.exit(1)
    else:
        print("\nSet password for the new user:")
        password = prompt_password()
    
    password_hash = hash_password(password)
    
    # Insert user
    cursor.execute("""
        INSERT INTO users (email, username, password_hash, role, created_at)
        VALUES (?, ?, ?, ?, ?)
    """, (email, username, password_hash, role, datetime.now().isoformat()))
    
    conn.commit()
    user_id = cursor.lastrowid
    conn.close()
    
    print(f"\n✓ User created successfully")
    print(f"  ID:       {user_id}")
    print(f"  Email:    {email}")
    print(f"  Username: {username}")
    print(f"  Role:     {role}")


def reset_password(username: str, new_password: str | None = None) -> None:
    """Reset a user's password."""
    conn = get_connection()
    cursor = conn.cursor()
    
    # Find user
    cursor.execute("SELECT id, email FROM users WHERE username = ?", (username,))
    user = cursor.fetchone()
    
    if not user:
        print(f"❌ User '{username}' not found")
        conn.close()
        sys.exit(1)
    
    # Get or generate password
    if new_password:
        valid, message = validate_password(new_password)
        if not valid:
            print(f"❌ {message}")
            conn.close()
            sys.exit(1)
    else:
        print(f"\nResetting password for: {user['email']}")
        new_password = prompt_password()
    
    password_hash = hash_password(new_password)
    
    # Update password
    cursor.execute("""
        UPDATE users SET password_hash = ? WHERE id = ?
    """, (password_hash, user['id']))
    
    conn.commit()
    conn.close()
    
    print(f"\n✓ Password reset successfully for '{username}'")


def list_users() -> None:
    """List all users."""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT id, email, username, role, is_active, created_at, last_login
        FROM users
        ORDER BY created_at
    """)
    users = cursor.fetchall()
    conn.close()
    
    if not users:
        print("No users found.")
        return
    
    print("\n" + "=" * 80)
    print(f"{'ID':<4} {'Username':<15} {'Email':<30} {'Role':<8} {'Active':<7} {'Last Login':<20}")
    print("=" * 80)
    
    for user in users:
        active = "✓" if user['is_active'] else "✗"
        last_login = user['last_login'][:19] if user['last_login'] else "Never"
        print(f"{user['id']:<4} {user['username']:<15} {user['email']:<30} {user['role']:<8} {active:<7} {last_login:<20}")
    
    print("=" * 80)
    print(f"Total: {len(users)} user(s)\n")


def deactivate_user(username: str) -> None:
    """Deactivate a user (soft delete)."""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
    user = cursor.fetchone()
    
    if not user:
        print(f"❌ User '{username}' not found")
        conn.close()
        sys.exit(1)
    
    cursor.execute("UPDATE users SET is_active = 0 WHERE id = ?", (user['id'],))
    conn.commit()
    conn.close()
    
    print(f"✓ User '{username}' deactivated")


# ── CLI ───────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Manage journal dashboard users"
    )
    subparsers = parser.add_subparsers(dest="command", help="Commands")
    
    # Add user command
    add_parser = subparsers.add_parser("add", help="Add a new user")
    add_parser.add_argument("--email", "-e", required=True, help="User email")
    add_parser.add_argument("--username", "-u", required=True, help="Username for login")
    add_parser.add_argument(
        "--role", "-r",
        choices=["owner", "viewer"],
        default="viewer",
        help="User role (default: viewer)"
    )
    add_parser.add_argument("--password", "-p", help="Password (will prompt if not provided)")
    add_parser.add_argument("--generate", "-g", action="store_true", help="Generate random password")
    
    # Reset password command
    reset_parser = subparsers.add_parser("reset", help="Reset user password")
    reset_parser.add_argument("--username", "-u", required=True, help="Username")
    reset_parser.add_argument("--password", "-p", help="New password (will prompt if not provided)")
    reset_parser.add_argument("--generate", "-g", action="store_true", help="Generate random password")
    
    # List users command
    subparsers.add_parser("list", help="List all users")
    
    # Deactivate user command
    deactivate_parser = subparsers.add_parser("deactivate", help="Deactivate a user")
    deactivate_parser.add_argument("--username", "-u", required=True, help="Username")
    
    args = parser.parse_args()
    
    if args.command == "add":
        password = args.password
        if args.generate:
            password = generate_password()
            print(f"\n🔐 Generated password: {password}")
            print("   (Save this — it won't be shown again)\n")
        add_user(args.email, args.username, args.role, password)
    
    elif args.command == "reset":
        password = args.password
        if args.generate:
            password = generate_password()
            print(f"\n🔐 Generated password: {password}")
            print("   (Save this — it won't be shown again)\n")
        reset_password(args.username, password)
    
    elif args.command == "list":
        list_users()
    
    elif args.command == "deactivate":
        deactivate_user(args.username)
    
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
