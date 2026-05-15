"""统一身份与权限基础 API。"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from flask import Blueprint, g, request

from app.application.access.display_names import PrincipalDisplayNameResolver, display_name_from_principal
from app.application.access.identity import AccessIdentityService, RoleBindingResolver
from app.extensions import db
from app.application.access.catalog import (
    BUILTIN_ACCESS_ROLE_CATALOG,
    BUILTIN_PERMISSION_PACKAGES,
    PERMISSION_PACKAGE_BY_CODE,
)
from app.infrastructure.access.repositories import SqlAccessRepository
from app.interfaces.api.middleware.auth import require_access_roles, require_auth
from app.shared.response import bad_request, created, error, success

bp = Blueprint("access_api_v1", __name__, url_prefix="/api/v1/access")

ACCESS_READ_ROLES = ("viewer", "auditor", "governance_admin", "platform_admin")
ACCESS_WRITE_ROLES = ("governance_admin", "platform_admin")


def _repo() -> SqlAccessRepository:
    return SqlAccessRepository(db.session)


def _service() -> AccessIdentityService:
    return AccessIdentityService(_repo())


def _json() -> dict[str, Any]:
    return request.get_json(silent=True) or {}


def _current_actor() -> str:
    return getattr(g, "principal_id", None) or getattr(g, "user_id", None) or "system"


def _principal_to_dict(row) -> dict[str, Any]:
    return {
        "principal_id": row.principal_id,
        "principal_type": row.principal_type,
        "idp": row.idp,
        "tenant_key": row.tenant_key,
        "display_name": row.display_name,
        "email": row.email,
        "employee_no": row.employee_no,
        "status": row.status,
        "raw_profile": row.raw_profile or {},
        "last_seen_at": row.last_seen_at.isoformat() if row.last_seen_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _service_to_dict(row) -> dict[str, Any]:
    repo = _repo()
    principal = repo.get_principal(row.principal_id)
    owner = repo.get_principal(row.owner_principal_id)
    return {
        "principal_id": row.principal_id,
        "display_name": display_name_from_principal(principal),
        "service_type": row.service_type,
        "owner_principal_id": row.owner_principal_id,
        "owner_display_name": display_name_from_principal(owner),
        "owner_team": row.owner_team,
        "description": row.description,
        "allowed_tenants": list(row.allowed_tenants or []),
        "delegation_rules": dict(row.delegation_rules or {}),
        "status": row.status,
        "disabled_at": row.disabled_at.isoformat() if row.disabled_at else None,
        "disabled_by": row.disabled_by,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _api_key_to_dict(row) -> dict[str, Any]:
    created_by_display_name = PrincipalDisplayNameResolver(_repo()).resolve_one(row.created_by)
    return {
        "key_id": row.key_id,
        "principal_id": row.principal_id,
        "key_prefix": row.key_prefix,
        "scopes": list(row.scopes or []),
        "allowed_ips": list(row.allowed_ips or []),
        "rate_limit_per_minute": row.rate_limit_per_minute,
        "expires_at": row.expires_at.isoformat() if row.expires_at else None,
        "last_used_at": row.last_used_at.isoformat() if row.last_used_at else None,
        "last_rotated_at": row.last_rotated_at.isoformat() if row.last_rotated_at else None,
        "usage_count": row.usage_count,
        "status": row.status,
        "created_by": row.created_by,
        "created_by_display_name": created_by_display_name,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def _binding_to_dict(row) -> dict[str, Any]:
    created_by_display_name = PrincipalDisplayNameResolver(_repo()).resolve_one(row.created_by)
    return {
        "id": row.id,
        "subject_type": row.subject_type,
        "subject_key": row.subject_key,
        "role_code": row.role_code,
        "role_type": row.role_type,
        "source": row.source,
        "effective_from": row.effective_from.isoformat() if row.effective_from else None,
        "effective_to": row.effective_to.isoformat() if row.effective_to else None,
        "status": row.status,
        "created_by": row.created_by,
        "created_by_display_name": created_by_display_name,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@bp.post("/principal-display-names")
@require_auth
def principal_display_names():
    """批量解析 Principal 展示名，供业务页面隐藏技术主键。"""

    body = _json()
    raw_ids = body.get("principal_ids") or body.get("ids") or []
    if not isinstance(raw_ids, list):
        return bad_request("principal_ids 必须是数组")
    principal_ids = [str(item or "").strip() for item in raw_ids if str(item or "").strip()]
    names = PrincipalDisplayNameResolver(_repo()).resolve_many(principal_ids)
    current_principal_id = getattr(g, "principal_id", None) or getattr(g, "user_id", None)
    current_display_name = getattr(g, "user_name", None)
    if current_principal_id and current_display_name and current_principal_id in principal_ids:
        names.setdefault(str(current_principal_id), str(current_display_name))
    return success({
        "items": [
            {
                "principal_id": principal_id,
                "display_name": names.get(principal_id),
            }
            for principal_id in principal_ids
        ]
    })


def _parse_dt(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)


@bp.get("/role-catalog")
@require_access_roles(*ACCESS_READ_ROLES)
def get_role_catalog():
    """返回新用户体系内置角色与 API Key scope 目录。"""
    return success(BUILTIN_ACCESS_ROLE_CATALOG)


@bp.get("/permission-packages")
@require_access_roles(*ACCESS_READ_ROLES)
def get_permission_packages():
    """返回管理员可理解的权限包目录。"""
    return success({"items": BUILTIN_PERMISSION_PACKAGES, "total": len(BUILTIN_PERMISSION_PACKAGES)})


@bp.get("/principals")
@require_access_roles(*ACCESS_READ_ROLES)
def list_principals():
    page = request.args.get("page", 1, type=int)
    page_size = request.args.get("page_size", 20, type=int)
    rows, total = _service().list_principals(
        principal_type=request.args.get("principal_type") or None,
        tenant_key=request.args.get("tenant_key") or None,
        status=request.args.get("status") or None,
        q=request.args.get("q") or None,
        page=page,
        page_size=page_size,
    )
    return success({
        "items": [_principal_to_dict(row) for row in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    })


@bp.get("/principals/<path:principal_id>")
@require_access_roles(*ACCESS_READ_ROLES)
def get_principal(principal_id: str):
    service = _service()
    row = service.get_principal(principal_id)
    if row is None:
        return error("Principal 不存在", status=404)
    context = RoleBindingResolver(_repo()).resolve_principal_context(
        principal_id=principal_id,
        actor_id=principal_id,
        actor_type=row.principal_type,
        source="access_api",
    )
    payload = _principal_to_dict(row)
    payload.update({
        "platform_roles": context.platform_roles,
        "data_roles": context.data_roles,
        "role_bindings": [_binding_to_dict(item) for item in service.list_role_bindings(principal_id)],
        "aliases": [_binding_alias_to_dict(item) for item in _repo().list_aliases(principal_id)],
    })
    if row.principal_type == "service":
        payload["api_keys"] = [_api_key_to_dict(item) for item in _repo().list_api_keys_for_principal(principal_id)]
    return success(payload)


@bp.get("/principals/<path:principal_id>/aliases")
@require_access_roles(*ACCESS_READ_ROLES)
def list_principal_aliases(principal_id: str):
    return success([_binding_alias_to_dict(item) for item in _repo().list_aliases(principal_id)])


@bp.get("/principals/<path:principal_id>/role-bindings")
@require_access_roles(*ACCESS_READ_ROLES)
def list_principal_role_bindings(principal_id: str):
    return success([_binding_to_dict(item) for item in _service().list_role_bindings(principal_id)])


@bp.put("/principals/<path:principal_id>/role-bindings")
@require_access_roles(*ACCESS_WRITE_ROLES)
def put_principal_role_bindings(principal_id: str):
    body = _json()
    bindings = body.get("bindings")
    if not isinstance(bindings, list):
        return bad_request("bindings 必须是数组")
    normalized = []
    for item in bindings:
        if not isinstance(item, dict):
            continue
        normalized.append({
            "role_code": item.get("role_code"),
            "role_type": item.get("role_type") or "platform",
            "source": item.get("source") or "manual",
            "status": item.get("status") or "active",
            "effective_from": _parse_dt(item.get("effective_from")),
            "effective_to": _parse_dt(item.get("effective_to")),
        })
    rows = _service().put_role_bindings(
        principal_id=principal_id,
        bindings=normalized,
        created_by=_current_actor(),
    )
    return success([_binding_to_dict(row) for row in rows], message="角色绑定已更新")


@bp.put("/principals/<path:principal_id>/permission-packages")
@require_access_roles(*ACCESS_WRITE_ROLES)
def put_principal_permission_packages(principal_id: str):
    """按产品层权限包更新成员权限。"""

    body = _json()
    package_codes = body.get("package_codes")
    if not isinstance(package_codes, list):
        return bad_request("package_codes 必须是数组")
    normalized_codes: list[str] = []
    role_items: list[dict[str, str]] = []
    role_codes: list[str] = []
    for code in package_codes:
        package_code = str(code or "").strip()
        if not package_code:
            continue
        package = PERMISSION_PACKAGE_BY_CODE.get(package_code)
        if package is None:
            return bad_request(f"未知权限包: {package_code}")
        normalized_codes.append(package_code)
        for role_code in package.get("role_codes") or []:
            role_code_value = str(role_code or "").strip()
            if not role_code_value or role_code_value in role_codes:
                continue
            role_codes.append(role_code_value)
            role_items.append({
                "role_code": role_code_value,
                "role_type": "data" if role_code_value.startswith("data_") else "platform",
                "source": "permission_package",
                "status": "active",
            })
    rows = _service().put_role_bindings(
        principal_id=principal_id,
        bindings=role_items,
        created_by=_current_actor(),
    )
    return success(
        {
            "principal_id": principal_id,
            "package_codes": normalized_codes,
            "role_codes": role_codes,
            "role_bindings": [_binding_to_dict(row) for row in rows],
        },
        message="权限包已更新",
    )


@bp.post("/service-principals")
@require_access_roles(*ACCESS_WRITE_ROLES)
def create_service_principal():
    body = _json()
    required = ["tenant_key", "service_type", "code", "owner_principal_id"]
    missing = [key for key in required if not body.get(key)]
    if missing:
        return bad_request(f"缺少必填字段: {', '.join(missing)}")
    row = _service().create_service_principal(
        tenant_key=body.get("tenant_key"),
        service_type=body.get("service_type"),
        code=body.get("code"),
        owner_principal_id=body.get("owner_principal_id"),
        owner_team=body.get("owner_team"),
        description=body.get("description"),
        allowed_tenants=body.get("allowed_tenants") or [],
        delegation_rules=body.get("delegation_rules") or {},
        created_by=_current_actor(),
    )
    return created(_service_to_dict(row), message="虚拟用户创建成功")


@bp.get("/service-principals")
@require_access_roles(*ACCESS_READ_ROLES)
def list_service_principals():
    return success([_service_to_dict(row) for row in _repo().list_service_principals()])


@bp.get("/service-principals/<path:principal_id>")
@require_access_roles(*ACCESS_READ_ROLES)
def get_service_principal(principal_id: str):
    row = _repo().get_service_principal(principal_id)
    if row is None:
        return error("虚拟用户不存在", status=404)
    payload = _service_to_dict(row)
    payload["api_keys"] = [_api_key_to_dict(item) for item in _repo().list_api_keys_for_principal(principal_id)]
    return success(payload)


@bp.patch("/service-principals/<path:principal_id>")
@require_access_roles(*ACCESS_WRITE_ROLES)
def patch_service_principal(principal_id: str):
    body = _json()
    row = _repo().get_service_principal(principal_id)
    if row is None:
        return error("虚拟用户不存在", status=404)
    for key in ("owner_team", "description", "status"):
        if key in body:
            setattr(row, key, body[key])
    if "allowed_tenants" in body:
        row.allowed_tenants = list(body.get("allowed_tenants") or [])
    if "delegation_rules" in body:
        row.delegation_rules = dict(body.get("delegation_rules") or {})
    _repo().commit()
    return success(_service_to_dict(row), message="虚拟用户已更新")


@bp.post("/service-principals/<path:principal_id>/api-keys")
@require_access_roles(*ACCESS_WRITE_ROLES)
def create_api_key(principal_id: str):
    body = _json()
    key = _service().create_api_key(
        principal_id=principal_id,
        scopes=body.get("scopes") or [],
        created_by=_current_actor(),
        allowed_ips=body.get("allowed_ips") or [],
        rate_limit_per_minute=body.get("rate_limit_per_minute"),
        expires_at=_parse_dt(body.get("expires_at")),
    )
    return created({
        "key_id": key.key_id,
        "key_prefix": key.key_prefix,
        "api_key": key.api_key,
        "expires_at": key.expires_at.isoformat() if key.expires_at else None,
    }, message="API Key 创建成功")


@bp.post("/api-keys/<key_id>/rotate")
@require_access_roles(*ACCESS_WRITE_ROLES)
def rotate_api_key(key_id: str):
    key = _service().rotate_api_key(key_id, rotated_by=_current_actor())
    return created({
        "key_id": key.key_id,
        "key_prefix": key.key_prefix,
        "api_key": key.api_key,
        "expires_at": key.expires_at.isoformat() if key.expires_at else None,
    }, message="API Key 已轮换")


@bp.post("/api-keys/<key_id>/revoke")
@require_access_roles(*ACCESS_WRITE_ROLES)
def revoke_api_key(key_id: str):
    return success(_service().revoke_api_key(key_id), message="API Key 已吊销")


def _binding_alias_to_dict(row) -> dict[str, Any]:
    return {
        "id": row.id,
        "principal_id": row.principal_id,
        "idp": row.idp,
        "tenant_key": row.tenant_key,
        "external_id_type": row.external_id_type,
        "external_id": row.external_id,
        "status": row.status,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }
