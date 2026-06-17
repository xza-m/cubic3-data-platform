"""统一 Principal 身份、API Key 与委托解析服务。"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import hashlib
import hmac
import re
import secrets
import time
from typing import Any, Iterable, Optional

from app.application.governance.access import PrincipalContext
from app.infrastructure.access.models import AccessApiKeyORM
from app.shared.exceptions import (
    AuthenticationError,
    AuthorizationError,
    RateLimitExceededError,
    ValidationError,
)
from app.shared.utils.time import utcnow

API_KEY_PREFIX = "c3_live"
DELEGATION_SCOPE = "delegation.feishu_user"
DEFAULT_DELEGATION_TTL_SECONDS = 300


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _dedupe(values: Iterable[Any]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        item = _clean(value)
        if not item or item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


def _normalize_semantic_pin(semantic_pin: dict[str, Any] | None) -> dict[str, Any] | None:
    """校验并规范化 API Key 语义 release pin 配置（§6.1）。"""
    if not semantic_pin:
        return None
    if not isinstance(semantic_pin, dict):
        raise ValidationError("semantic_pin 必须是对象")
    pin_policy = _clean(semantic_pin.get("pin_policy") or "track_active")
    if pin_policy not in {"pinned", "track_active"}:
        raise ValidationError("semantic_pin.pin_policy 仅支持 pinned / track_active")
    release_id = _clean(semantic_pin.get("release_id") or "")
    if pin_policy == "pinned" and not release_id:
        raise ValidationError("semantic_pin.pin_policy=pinned 时必须提供 release_id")
    normalized: dict[str, Any] = {"pin_policy": pin_policy}
    if release_id:
        normalized["release_id"] = release_id
    return normalized


def make_human_principal_id(tenant_key: str, *, union_id: str | None, open_id: str | None) -> str:
    """生成飞书真人 Principal ID，优先使用 union_id。"""

    tenant = _clean(tenant_key)
    external_id = _clean(union_id) or _clean(open_id)
    if not tenant or not external_id:
        raise ValidationError("缺少 tenant_key 或飞书用户 ID")
    return f"feishu:{tenant}:{external_id}"


def make_service_principal_id(tenant_key: str, *, service_type: str, code: str) -> str:
    """生成虚拟用户 Principal ID。"""

    tenant = _clean(tenant_key) or "global"
    service_type_value = _clean(service_type)
    code_value = _clean(code)
    if not service_type_value or not code_value:
        raise ValidationError("缺少 service_type 或 code")
    return f"svc:{tenant}:{service_type_value}:{code_value}"


def hash_api_key(api_key: str) -> str:
    digest = hashlib.sha256(_clean(api_key).encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


def parse_api_key(api_key: str) -> tuple[str, str]:
    match = re.match(r"^c3_live_(ak_[A-Za-z0-9]+)_(.+)$", _clean(api_key))
    if not match:
        raise AuthenticationError("Invalid API key", code="INVALID_API_KEY")
    return match.group(1), match.group(2)


@dataclass(frozen=True)
class CreatedApiKey:
    key_id: str
    key_prefix: str
    api_key: str
    expires_at: Optional[datetime]


@dataclass(frozen=True)
class AuthenticatedActor:
    actor_principal_id: str
    actor_type: str
    principal_type: str
    scopes: list[str]
    service_type: str | None = None
    tenant_key: str | None = None
    key_id: str | None = None
    # 语义 release pin（§6.1）：{"pin_policy": "pinned"|"track_active", "release_id": "..."}
    semantic_pin: dict[str, Any] | None = None


class DelegationReplayStore:
    """轻量防重放存储。

    生产环境后续可替换为 Redis 实现；接口保持 ``mark_once`` 不变。
    """

    def __init__(self) -> None:
        self._items: dict[str, float] = {}

    def mark_once(self, key: str, ttl_seconds: int) -> bool:
        now = time.time()
        expired = [item_key for item_key, expires_at in self._items.items() if expires_at <= now]
        for item_key in expired:
            self._items.pop(item_key, None)
        if key in self._items:
            return False
        self._items[key] = now + ttl_seconds
        return True


class ApiKeyRateLimiter:
    """API Key 轻量限流器。

    当前保持进程内实现，生产多实例部署可替换为 Redis 版本。
    """

    def __init__(self) -> None:
        self._items: dict[str, tuple[int, float]] = {}

    def check(self, key: str, limit: int, window_seconds: int = 60) -> tuple[bool, dict[str, int]]:
        now = time.time()
        current, expires_at = self._items.get(key, (0, now + window_seconds))
        if expires_at <= now:
            current = 0
            expires_at = now + window_seconds
        current += 1
        self._items[key] = (current, expires_at)
        retry_after = max(0, int(expires_at - now)) if current > limit else 0
        return current <= limit, {
            "current": current,
            "limit": limit,
            "retry_after": retry_after,
        }


_DEFAULT_API_KEY_RATE_LIMITER = ApiKeyRateLimiter()


class RoleBindingResolver:
    """从 access_role_bindings 解析平台角色和数据角色。"""

    def __init__(self, repository) -> None:
        self.repository = repository

    def resolve_principal_context(
        self,
        *,
        principal_id: str,
        actor_id: str | None = None,
        actor_type: str = "human",
        source: str = "access_identity",
        groups: list[str] | None = None,
        departments: list[str] | None = None,
    ) -> PrincipalContext:
        principal = self.repository.get_principal(principal_id)
        subject_keys = [f"principal:{principal_id}"]
        for group in groups or []:
            subject_keys.append(str(group))
        for department in departments or []:
            subject_keys.append(str(department))

        now = utcnow()
        platform_roles: list[str] = []
        data_roles: list[str] = []
        for binding in self.repository.list_role_bindings_for_subjects(subject_keys):
            if binding.effective_from and binding.effective_from > now:
                continue
            if binding.effective_to and binding.effective_to <= now:
                continue
            if binding.role_type == "data":
                data_roles.append(binding.role_code)
            else:
                platform_roles.append(binding.role_code)

        platform_roles = _dedupe(platform_roles)
        data_roles = _dedupe(data_roles)
        principal_type = principal.principal_type if principal else "human"
        data_scopes: dict[str, list[str]] = {}
        scope_resolver = getattr(self.repository, "resolve_principal_data_scopes", None)
        if callable(scope_resolver):
            data_scopes = dict(scope_resolver(principal_id) or {})
        return PrincipalContext(
            principal_id=principal_id,
            principal_type=principal_type,
            display_name=principal.display_name if principal else None,
            roles=[*platform_roles, *data_roles],
            platform_roles=platform_roles,
            data_roles=data_roles,
            groups=list(groups or []),
            departments=list(departments or []),
            data_scopes=data_scopes,
            source=source,
            actor_type=actor_type,
            actor_id=actor_id or principal_id,
        )


class AccessIdentityService:
    """身份治理应用服务。"""

    def __init__(self, repository, *, rate_limiter: ApiKeyRateLimiter | None = None) -> None:
        self.repository = repository
        self.rate_limiter = rate_limiter or _DEFAULT_API_KEY_RATE_LIMITER

    # ------------------------------------------------------------------
    # Principal
    # ------------------------------------------------------------------

    def upsert_feishu_principal(
        self,
        *,
        tenant_key: str,
        open_id: str | None,
        union_id: str | None,
        display_name: str | None = None,
        email: str | None = None,
        employee_no: str | None = None,
        raw_profile: dict[str, Any] | None = None,
        commit: bool = True,
    ):
        tenant = _clean(tenant_key)
        open_id_value = _clean(open_id)
        union_id_value = _clean(union_id)
        existing_alias = None
        if union_id_value:
            existing_alias = self.repository.find_alias(
                idp="feishu",
                tenant_key=tenant,
                external_id_type="union_id",
                external_id=union_id_value,
            )
        if existing_alias is None and open_id_value:
            existing_alias = self.repository.find_alias(
                idp="feishu",
                tenant_key=tenant,
                external_id_type="open_id",
                external_id=open_id_value,
            )
        principal_id = existing_alias.principal_id if existing_alias else make_human_principal_id(
            tenant,
            union_id=union_id_value,
            open_id=open_id_value,
        )
        row = self.repository.upsert_principal(
            principal_id=principal_id,
            principal_type="human",
            idp="feishu",
            tenant_key=tenant,
            display_name=display_name,
            email=email,
            employee_no=employee_no,
            raw_profile=raw_profile or {},
        )
        if open_id_value:
            self.repository.upsert_alias(
                principal_id=principal_id,
                idp="feishu",
                tenant_key=tenant,
                external_id_type="open_id",
                external_id=open_id_value,
            )
        if union_id_value:
            self.repository.upsert_alias(
                principal_id=principal_id,
                idp="feishu",
                tenant_key=tenant,
                external_id_type="union_id",
                external_id=union_id_value,
            )
        if employee_no:
            self.repository.upsert_alias(
                principal_id=principal_id,
                idp="feishu",
                tenant_key=tenant,
                external_id_type="employee_no",
                external_id=employee_no,
            )
        if commit:
            self.repository.commit()
        return row

    def find_principal_id_by_alias(
        self,
        *,
        idp: str,
        tenant_key: str,
        external_id_type: str,
        external_id: str,
    ) -> str | None:
        alias = self.repository.find_alias(
            idp=idp,
            tenant_key=tenant_key,
            external_id_type=external_id_type,
            external_id=external_id,
        )
        return alias.principal_id if alias else None

    def get_principal(self, principal_id: str):
        return self.repository.get_principal(principal_id)

    def list_principals(self, **filters):
        return self.repository.list_principals(**filters)

    # ------------------------------------------------------------------
    # Service principal / API Key
    # ------------------------------------------------------------------

    def create_service_principal(
        self,
        *,
        tenant_key: str,
        service_type: str,
        code: str,
        owner_principal_id: str,
        owner_team: str | None = None,
        description: str | None = None,
        allowed_tenants: list[str] | None = None,
        delegation_rules: dict[str, Any] | None = None,
        created_by: str | None = None,
        commit: bool = True,
    ):
        principal_id = make_service_principal_id(tenant_key, service_type=service_type, code=code)
        principal = self.repository.upsert_principal(
            principal_id=principal_id,
            principal_type="service",
            idp="internal",
            tenant_key=_clean(tenant_key) or "global",
            display_name=code,
            raw_profile={"service_type": service_type, "created_by": created_by},
        )
        self.repository.upsert_service_principal(
            principal_id=principal.principal_id,
            service_type=service_type,
            owner_principal_id=owner_principal_id,
            owner_team=owner_team,
            description=description,
            allowed_tenants=allowed_tenants or [],
            delegation_rules=delegation_rules or {},
            status="active",
        )
        if commit:
            self.repository.commit()
        return self.repository.get_service_principal(principal_id)

    def create_api_key(
        self,
        *,
        principal_id: str,
        scopes: list[str],
        created_by: str | None = None,
        allowed_ips: list[str] | None = None,
        rate_limit_per_minute: int | None = None,
        expires_at: datetime | None = None,
        mode: str | None = None,
        data_scopes: list[dict[str, Any]] | None = None,
        semantic_pin: dict[str, Any] | None = None,
        commit: bool = True,
    ) -> CreatedApiKey:
        """签发 API Key（§4.3/4.4 产品化）。

        - ``mode="scope"``（模式 A）：服务身份自带数据范围——``data_scopes`` 写入
          ``access_principal_scopes``（source=issuance），不允许携带委托 scope。
        - ``mode="delegation"``（模式 B）：服务身份代理 subject 主体——要求 service
          principal 已配置委托白名单（``allowed_tenants``），自动附加委托 scope；
          row_scope 求值取 subject 的 scope，请求体 scope 声明一律不采信（ADR-013）。
        - ``mode`` 为空时保持兼容旧行为（不做模式校验）。
        - ``semantic_pin``（§6.1 消费方 pin 配置）：
          ``{"pin_policy": "pinned"|"track_active", "release_id": "..."}``，
          pinned 时要求 release_id 非空。
        """
        service = self.repository.get_service_principal(principal_id)
        if service is None:
            raise ValidationError("API Key 只能签发给 service principal")
        scopes = _dedupe(scopes)
        mode_value = _clean(mode or "")
        if mode_value:
            if mode_value not in {"scope", "delegation"}:
                raise ValidationError("mode 仅支持 scope（模式 A）/ delegation（模式 B）")
            if mode_value == "scope":
                if DELEGATION_SCOPE in scopes:
                    raise ValidationError("模式 A（scope）不允许携带委托 scope")
            else:
                if data_scopes:
                    raise ValidationError("模式 B（delegation）不在签发时配置数据范围，row_scope 取 subject 主体 scope")
                if not (service.allowed_tenants or []):
                    raise ValidationError("模式 B 需要先在 service principal 上配置委托白名单（allowed_tenants）")
                if DELEGATION_SCOPE not in scopes:
                    scopes = [*scopes, DELEGATION_SCOPE]
        if data_scopes:
            if mode_value == "delegation":
                raise ValidationError("模式 B（delegation）不在签发时配置数据范围")
            self.repository.replace_principal_scopes(
                principal_id=principal_id,
                source="issuance",
                scopes=data_scopes,
                created_by=created_by,
            )
        normalized_pin = _normalize_semantic_pin(semantic_pin)
        key_id = "ak_" + secrets.token_hex(8)
        secret = secrets.token_urlsafe(32)
        plaintext = f"{API_KEY_PREFIX}_{key_id}_{secret}"
        row = AccessApiKeyORM(
            key_id=key_id,
            principal_id=principal_id,
            key_prefix=f"{API_KEY_PREFIX}_{key_id}",
            key_hash=hash_api_key(plaintext),
            scopes=scopes,
            allowed_ips=list(allowed_ips or []),
            rate_limit_per_minute=rate_limit_per_minute,
            expires_at=expires_at,
            status="active",
            semantic_pin=normalized_pin,
            created_by=created_by,
        )
        self.repository.add_api_key(row)
        if commit:
            self.repository.commit()
        return CreatedApiKey(
            key_id=key_id,
            key_prefix=row.key_prefix,
            api_key=plaintext,
            expires_at=expires_at,
        )

    def get_api_key(self, key_id: str):
        return self.repository.get_api_key(key_id)

    def authenticate_api_key(self, api_key: str, *, remote_ip: str | None = None) -> AuthenticatedActor:
        key_id, _ = parse_api_key(api_key)
        row = self.repository.get_api_key(key_id)
        if row is None or row.status != "active":
            raise AuthenticationError("Invalid API key", code="INVALID_API_KEY")
        if not hmac.compare_digest(row.key_hash, hash_api_key(api_key)):
            raise AuthenticationError("Invalid API key", code="INVALID_API_KEY")
        if row.expires_at and row.expires_at <= utcnow():
            row.status = "expired"
            self.repository.commit()
            raise AuthenticationError("API key expired", code="API_KEY_EXPIRED")
        if row.allowed_ips and (not remote_ip or remote_ip not in set(row.allowed_ips)):
            raise AuthorizationError("API key IP not allowed", code="API_KEY_IP_DENIED")
        if row.rate_limit_per_minute:
            allowed, rate_info = self.rate_limiter.check(
                f"api_key:{row.key_id}",
                int(row.rate_limit_per_minute),
                60,
            )
            if not allowed:
                raise RateLimitExceededError(
                    "API key rate limit exceeded",
                    code="API_KEY_RATE_LIMITED",
                    details=rate_info,
                )
        principal = self.repository.get_principal(row.principal_id)
        service = self.repository.get_service_principal(row.principal_id)
        if principal is None or principal.status != "active":
            raise AuthenticationError("Service principal is disabled", code="SERVICE_PRINCIPAL_DISABLED")
        if service is None or service.status != "active":
            raise AuthenticationError("Service principal is disabled", code="SERVICE_PRINCIPAL_DISABLED")
        self.repository.touch_api_key(row)
        self.repository.commit()
        return AuthenticatedActor(
            actor_principal_id=row.principal_id,
            actor_type=service.service_type,
            principal_type="service",
            scopes=list(row.scopes or []),
            service_type=service.service_type,
            tenant_key=principal.tenant_key,
            key_id=row.key_id,
            semantic_pin=dict(row.semantic_pin) if getattr(row, "semantic_pin", None) else None,
        )

    def rotate_api_key(self, key_id: str, *, rotated_by: str | None = None) -> CreatedApiKey:
        row = self.repository.get_api_key(key_id)
        if row is None:
            raise ValidationError("API Key 不存在")
        row.status = "revoked"
        row.last_rotated_at = utcnow()
        return self.create_api_key(
            principal_id=row.principal_id,
            scopes=list(row.scopes or []),
            created_by=rotated_by or row.created_by,
            allowed_ips=list(row.allowed_ips or []),
            rate_limit_per_minute=row.rate_limit_per_minute,
            expires_at=row.expires_at,
            semantic_pin=dict(row.semantic_pin) if getattr(row, "semantic_pin", None) else None,
        )

    def revoke_api_key(self, key_id: str) -> dict[str, Any]:
        row = self.repository.get_api_key(key_id)
        if row is None:
            raise ValidationError("API Key 不存在")
        row.status = "revoked"
        self.repository.commit()
        return {"key_id": row.key_id, "status": row.status}

    # ------------------------------------------------------------------
    # Delegation / role binding
    # ------------------------------------------------------------------

    def resolve_delegated_feishu_principal(
        self,
        *,
        actor: AuthenticatedActor,
        feishu_context: dict[str, Any],
        replay_store: DelegationReplayStore,
        endpoint: str | None = None,
    ) -> PrincipalContext:
        tenant_key = _clean(feishu_context.get("tenant_key"))
        message_id = _clean(feishu_context.get("message_id"))
        nonce = _clean(feishu_context.get("nonce"))
        timestamp = int(feishu_context.get("timestamp") or 0)
        delegated_principal_id: str | None = None
        try:
            if DELEGATION_SCOPE not in actor.scopes:
                raise AuthorizationError("API Key 不允许代理飞书用户", code="DELEGATION_SCOPE_REQUIRED")
            service = self.repository.get_service_principal(actor.actor_principal_id)
            if service is None or service.status != "active":
                raise AuthorizationError("Service principal 不可用", code="SERVICE_PRINCIPAL_DISABLED")
            allowed_tenants = set(service.allowed_tenants or [])
            if "*" not in allowed_tenants and tenant_key not in allowed_tenants:
                raise AuthorizationError("Service principal 不允许代理该租户", code="DELEGATION_TENANT_DENIED")
            now = int(time.time())
            if not timestamp or abs(now - timestamp) > DEFAULT_DELEGATION_TTL_SECONDS:
                raise AuthorizationError("飞书上下文已过期", code="DELEGATION_CONTEXT_EXPIRED")
            if nonce and not replay_store.mark_once(
                f"delegation_nonce:{actor.actor_principal_id}:{nonce}",
                DEFAULT_DELEGATION_TTL_SECONDS,
            ):
                raise AuthorizationError("飞书上下文 nonce 已使用", code="DELEGATION_REPLAY")
            if message_id and not replay_store.mark_once(
                f"delegation_message:{actor.actor_principal_id}:{message_id}",
                DEFAULT_DELEGATION_TTL_SECONDS,
            ):
                raise AuthorizationError("飞书消息已处理", code="DELEGATION_REPLAY")
            principal = self.upsert_feishu_principal(
                tenant_key=tenant_key,
                open_id=feishu_context.get("open_id"),
                union_id=feishu_context.get("union_id"),
                display_name=feishu_context.get("display_name"),
                email=feishu_context.get("email"),
                employee_no=feishu_context.get("employee_no"),
                raw_profile={"feishu_context": _safe_feishu_context(feishu_context)},
                commit=False,
            )
            delegated_principal_id = principal.principal_id
            context = RoleBindingResolver(self.repository).resolve_principal_context(
                principal_id=principal.principal_id,
                actor_id=actor.actor_principal_id,
                actor_type=actor.actor_type,
                source="feishu_delegation",
            )
            self.repository.add_delegation_event(
                actor_principal_id=actor.actor_principal_id,
                delegated_principal_id=delegated_principal_id,
                tenant_key=tenant_key,
                message_id=message_id,
                chat_id=_clean(feishu_context.get("chat_id")),
                event_id=_clean(feishu_context.get("event_id")),
                endpoint=endpoint,
                decision="allow",
                reason="delegation_verified",
            )
            self.repository.commit()
            return context
        except AuthorizationError as exc:
            self.repository.add_delegation_event(
                actor_principal_id=actor.actor_principal_id,
                delegated_principal_id=delegated_principal_id,
                tenant_key=tenant_key,
                message_id=message_id,
                chat_id=_clean(feishu_context.get("chat_id")),
                event_id=_clean(feishu_context.get("event_id")),
                endpoint=endpoint,
                decision="deny",
                reason=exc.code,
            )
            self.repository.commit()
            raise

    def resolve_service_principal_context(self, actor: AuthenticatedActor) -> PrincipalContext:
        return RoleBindingResolver(self.repository).resolve_principal_context(
            principal_id=actor.actor_principal_id,
            actor_id=actor.actor_principal_id,
            actor_type=actor.actor_type,
            source="api_key",
        )

    def put_role_bindings(
        self,
        *,
        principal_id: str,
        bindings: list[dict[str, Any]],
        created_by: str | None = None,
    ) -> list[Any]:
        rows = self.repository.replace_principal_role_bindings(
            principal_id=principal_id,
            bindings=bindings,
            created_by=created_by,
        )
        self.repository.commit()
        return rows

    def ensure_principal_role_bindings(
        self,
        *,
        principal_id: str,
        roles: list[str],
        source: str = "manual",
        created_by: str | None = None,
    ) -> list[Any]:
        rows: list[Any] = []
        for role_code in _dedupe(roles):
            role_type = "data" if role_code.startswith("data_") else "platform"
            rows.append(
                self.repository.ensure_role_binding(
                    subject_type="principal",
                    subject_key=f"principal:{principal_id}",
                    role_code=role_code,
                    role_type=role_type,
                    source=source,
                    created_by=created_by,
                )
            )
        self.repository.commit()
        return rows

    def list_role_bindings(self, principal_id: str) -> list[Any]:
        return self.repository.list_role_bindings_for_principal(principal_id)

    # ------------------------------------------------------------------
    # Principal data scope（RLS）
    # ------------------------------------------------------------------

    def put_principal_scopes(
        self,
        *,
        principal_id: str,
        source: str,
        scopes: list[dict[str, Any]],
        created_by: str | None = None,
    ) -> list[Any]:
        if self.repository.get_principal(principal_id) is None:
            raise ValidationError("Principal 不存在")
        source_value = _clean(source) or "manual"
        if source_value not in {"manual", "issuance", "feishu_dept"}:
            raise ValidationError("source 仅支持 manual / issuance / feishu_dept")
        rows = self.repository.replace_principal_scopes(
            principal_id=principal_id,
            source=source_value,
            scopes=scopes,
            created_by=created_by,
        )
        self.repository.commit()
        return rows

    def list_principal_scopes(self, principal_id: str) -> list[Any]:
        return self.repository.list_principal_scopes(principal_id)


def _safe_feishu_context(feishu_context: dict[str, Any]) -> dict[str, Any]:
    blocked = {"roles", "data_scope", "permissions"}
    return {key: value for key, value in feishu_context.items() if key not in blocked}
