"""平台 Token Pair 签发与轮换服务。"""
from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import timedelta
from typing import Callable, Iterable

from sqlalchemy.orm import Session

from app.infrastructure.access.models import AuthAuthorizationCodeORM, AuthRefreshSessionORM
from app.interfaces.api.middleware.auth import generate_access_token
from app.shared.exceptions import AuthenticationError
from app.shared.utils.time import utcnow


@dataclass(frozen=True)
class TokenPair:
    access_token: str
    refresh_token: str
    expires_in: int
    refresh_expires_in: int
    access_expires_at: str
    refresh_expires_at: str
    token_type: str = "Bearer"

    def to_dict(self) -> dict:
        return {
            "access_token": self.access_token,
            "refresh_token": self.refresh_token,
            "token_type": self.token_type,
            "expires_in": self.expires_in,
            "refresh_expires_in": self.refresh_expires_in,
            "access_expires_at": self.access_expires_at,
            "refresh_expires_at": self.refresh_expires_at,
        }


@dataclass(frozen=True)
class AuthorizationCode:
    code: str
    expires_in: int
    expires_at: str

    def to_dict(self) -> dict:
        return {
            "code": self.code,
            "expires_in": self.expires_in,
            "expires_at": self.expires_at,
        }


class PlatformTokenPairService:
    """Token Pair 应用服务。

    Access Token 是短期 JWT；Refresh Token 是不透明随机串，只在服务端保存哈希。
    Refresh Token 每次使用都会轮换，旧值作废，用于支持撤销与复用检测。
    """

    def __init__(
        self,
        session: Session,
        *,
        access_ttl_seconds: int,
        refresh_ttl_seconds: int,
        authorization_code_ttl_seconds: int,
        role_resolver: Callable[[str, list[str]], list[str]] | None = None,
    ):
        self._session = session
        self._access_ttl_seconds = max(60, int(access_ttl_seconds))
        self._refresh_ttl_seconds = max(self._access_ttl_seconds + 60, int(refresh_ttl_seconds))
        self._authorization_code_ttl_seconds = max(60, int(authorization_code_ttl_seconds))
        self._role_resolver = role_resolver

    def issue(
        self,
        *,
        principal_id: str,
        user_name: str,
        roles: Iterable[str] | None,
        auth_method: str,
        client_type: str = "web",
        user_agent: str | None = None,
        ip_address: str | None = None,
        token_family_id: str | None = None,
    ) -> TokenPair:
        now = utcnow()
        refresh_token = _new_secret("rt")
        session_id = _new_id("rts")
        family_id = token_family_id or _new_id("rtf")
        refresh_expires_at = now + timedelta(seconds=self._refresh_ttl_seconds)
        normalized_roles = _roles(roles)
        record = AuthRefreshSessionORM(
            session_id=session_id,
            token_family_id=family_id,
            principal_id=principal_id,
            user_name=user_name,
            roles=normalized_roles,
            refresh_token_hash=_hash_secret(refresh_token),
            auth_method=auth_method,
            client_type=(client_type or "web")[:32],
            user_agent=(user_agent or "")[:255] or None,
            ip_address=(ip_address or "")[:64] or None,
            expires_at=refresh_expires_at,
        )
        self._session.add(record)
        self._session.flush()
        return self._build_pair(
            principal_id=principal_id,
            user_name=user_name,
            roles=normalized_roles,
            session_id=session_id,
            refresh_token=refresh_token,
            refresh_expires_at=refresh_expires_at,
        )

    def refresh(
        self,
        refresh_token: str,
        *,
        client_type: str = "web",
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> TokenPair:
        record = self._lookup_refresh_token(refresh_token, for_update=True)
        now = utcnow()
        if record.revoked_at is not None:
            self._revoke_family(record.token_family_id, reason="reuse_detected")
            self._session.commit()
            raise AuthenticationError(
                message="Refresh token 已失效，请重新登录",
                code="REFRESH_TOKEN_REUSE_DETECTED",
            )
        if _is_expired(record.expires_at, now):
            record.revoked_at = now
            record.revoke_reason = "expired"
            self._session.commit()
            raise AuthenticationError(
                message="Refresh token 已过期，请重新登录",
                code="REFRESH_TOKEN_EXPIRED",
            )

        roles = self._current_roles(record.principal_id, record.roles or [])
        new_pair = self.issue(
            principal_id=record.principal_id,
            user_name=record.user_name or record.principal_id,
            roles=roles,
            auth_method=record.auth_method,
            client_type=client_type or record.client_type,
            user_agent=user_agent,
            ip_address=ip_address,
            token_family_id=record.token_family_id,
        )
        new_session_id = _session_id_from_access_token(new_pair.access_token) or ""
        record.last_used_at = now
        record.revoked_at = now
        record.revoke_reason = "rotated"
        record.replaced_by_session_id = new_session_id[:64] or None
        self._session.commit()
        return new_pair

    def revoke(self, refresh_token: str, *, reason: str = "logout") -> bool:
        record = self._find_refresh_token(refresh_token, for_update=True)
        if record is None:
            return False
        if record.revoked_at is None:
            record.revoked_at = utcnow()
            record.revoke_reason = reason[:64]
            self._session.commit()
        return True

    def issue_authorization_code(
        self,
        *,
        principal_id: str,
        user_name: str,
        roles: Iterable[str] | None,
        client_type: str = "web",
    ) -> AuthorizationCode:
        code = _new_secret("code")
        now = utcnow()
        expires_at = now + timedelta(seconds=self._authorization_code_ttl_seconds)
        record = AuthAuthorizationCodeORM(
            code_id=_new_id("auc"),
            code_hash=_hash_secret(code),
            principal_id=principal_id,
            user_name=user_name,
            roles=_roles(roles),
            client_type=(client_type or "web")[:32],
            expires_at=expires_at,
        )
        self._session.add(record)
        self._session.commit()
        return AuthorizationCode(
            code=code,
            expires_in=self._authorization_code_ttl_seconds,
            expires_at=expires_at.isoformat(),
        )

    def exchange_authorization_code(
        self,
        code: str,
        *,
        client_type: str = "web",
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> TokenPair:
        record = (
            self._session.query(AuthAuthorizationCodeORM)
            .filter_by(code_hash=_hash_secret(str(code or "").strip()))
            .with_for_update()
            .one_or_none()
        )
        now = utcnow()
        if record is None or record.consumed_at is not None:
            raise AuthenticationError(message="授权码无效", code="INVALID_AUTHORIZATION_CODE")
        if _is_expired(record.expires_at, now):
            raise AuthenticationError(message="授权码已过期", code="AUTHORIZATION_CODE_EXPIRED")
        requested_client_type = (client_type or "web").strip().lower()
        if record.client_type != requested_client_type:
            raise AuthenticationError(message="授权码类型不匹配", code="AUTHORIZATION_CODE_CLIENT_MISMATCH")
        record.consumed_at = now
        pair = self.issue(
            principal_id=record.principal_id,
            user_name=record.user_name or record.principal_id,
            roles=record.roles or [],
            auth_method="feishu_sso",
            client_type=requested_client_type,
            user_agent=user_agent,
            ip_address=ip_address,
        )
        self._session.commit()
        return pair

    def _build_pair(
        self,
        *,
        principal_id: str,
        user_name: str,
        roles: list[str],
        session_id: str,
        refresh_token: str,
        refresh_expires_at,
    ) -> TokenPair:
        access_expires_at = utcnow() + timedelta(seconds=self._access_ttl_seconds)
        access_token = generate_access_token(
            principal_id=principal_id,
            user_name=user_name,
            roles=roles,
            session_id=session_id,
            expires_delta=timedelta(seconds=self._access_ttl_seconds),
        )
        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=self._access_ttl_seconds,
            refresh_expires_in=self._refresh_ttl_seconds,
            access_expires_at=access_expires_at.isoformat(),
            refresh_expires_at=refresh_expires_at.isoformat(),
        )

    def _lookup_refresh_token(self, refresh_token: str, *, for_update: bool = False) -> AuthRefreshSessionORM:
        record = self._find_refresh_token(refresh_token, for_update=for_update)
        if record is None:
            raise AuthenticationError(message="Refresh token 无效", code="INVALID_REFRESH_TOKEN")
        return record

    def _find_refresh_token(self, refresh_token: str, *, for_update: bool = False) -> AuthRefreshSessionORM | None:
        value = str(refresh_token or "").strip()
        if not value:
            return None
        query = self._session.query(AuthRefreshSessionORM).filter_by(refresh_token_hash=_hash_secret(value))
        if for_update:
            query = query.with_for_update()
        return query.one_or_none()

    def _current_roles(self, principal_id: str, fallback_roles: Iterable[str] | None) -> list[str]:
        fallback = _roles(fallback_roles)
        if self._role_resolver is None:
            return fallback
        return _roles(self._role_resolver(principal_id, fallback))

    def _revoke_family(self, token_family_id: str, *, reason: str) -> None:
        now = utcnow()
        (
            self._session.query(AuthRefreshSessionORM)
            .filter(
                AuthRefreshSessionORM.token_family_id == token_family_id,
                AuthRefreshSessionORM.revoked_at.is_(None),
            )
            .update(
                {
                    AuthRefreshSessionORM.revoked_at: now,
                    AuthRefreshSessionORM.revoke_reason: reason[:64],
                },
                synchronize_session=False,
            )
        )


def _hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(16)}"


def _new_secret(prefix: str) -> str:
    return f"{prefix}_{secrets.token_urlsafe(48)}"


def _roles(values: Iterable[str] | None) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values or []:
        role = str(value or "").strip()
        if not role or role in seen:
            continue
        seen.add(role)
        result.append(role)
    return result


def _is_expired(expires_at, now) -> bool:
    if expires_at is None:
        return True
    if getattr(expires_at, "tzinfo", None) is None and getattr(now, "tzinfo", None) is not None:
        now = now.replace(tzinfo=None)
    return expires_at <= now


def _session_id_from_access_token(token: str) -> str | None:
    # 这里只用于审计关联，解码失败不影响 token pair 主流程。
    try:
        import jwt

        payload = jwt.decode(token, options={"verify_signature": False})
        return payload.get("sid")
    except Exception:
        return None
