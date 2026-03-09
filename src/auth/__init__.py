"""
src/auth
Authentication module for Journal Dashboard.
"""

from src.auth.auth_service import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
    generate_refresh_token,
    hash_refresh_token,
    create_token_pair,
    verify_upload_api_key,
)

from src.auth.auth_db import (
    get_user_by_username,
    get_user_by_email,
    get_user_by_id,
    store_refresh_token,
    get_refresh_token,
    revoke_refresh_token,
    revoke_all_user_tokens,
    log_auth_event,
    check_rate_limit,
)

from src.auth.middleware import (
    get_current_user,
    require_owner,
    require_any_user,
    verify_api_key,
)

__all__ = [
    "hash_password",
    "verify_password", 
    "create_access_token",
    "decode_access_token",
    "generate_refresh_token",
    "hash_refresh_token",
    "create_token_pair",
    "verify_upload_api_key",
    "get_user_by_username",
    "get_user_by_email",
    "get_user_by_id",
    "store_refresh_token",
    "get_refresh_token",
    "revoke_refresh_token",
    "revoke_all_user_tokens",
    "log_auth_event",
    "check_rate_limit",
    "get_current_user",
    "require_owner",
    "require_any_user",
    "verify_api_key",
]
