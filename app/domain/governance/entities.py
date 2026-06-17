"""数据权限治理领域实体。"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


def _as_list(values: list[str] | None) -> list[str]:
    return [str(value).strip() for value in (values or []) if str(value).strip()]


@dataclass(frozen=True)
class ExecutionProfile:
    """一次数据访问决策选择的执行配置。"""

    profile_code: str
    name: str
    credential_mode: str
    data_level: str = "M1"
    allowed_operations: list[str] = field(default_factory=lambda: ["query"])
    max_rows: int | None = None
    timeout_seconds: int | None = None
    export_allowed: bool = False
    requires_strong_audit: bool = False
    status: str = "active"
    description: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "profile_code": self.profile_code,
            "name": self.name,
            "description": self.description,
            "credential_mode": self.credential_mode,
            "data_level": self.data_level,
            "allowed_operations": list(self.allowed_operations or []),
            "max_rows": self.max_rows,
            "timeout_seconds": self.timeout_seconds,
            "export_allowed": bool(self.export_allowed),
            "requires_strong_audit": bool(self.requires_strong_audit),
            "status": self.status,
        }


@dataclass(frozen=True)
class DataPolicy:
    """轻量数据访问策略。

    策略只表达“谁可以对哪些资源做什么动作，以及结果是允许还是拒绝”。
    行列级过滤、脱敏、物理凭据隔离交给 MaxCompute/RAM 与 ExecutionProfile 承担。
    """

    policy_code: str
    name: str
    status: str = "active"
    priority: int = 0
    subject_roles: list[str] = field(default_factory=list)
    resource_scope: dict[str, Any] = field(default_factory=dict)
    actions: list[str] = field(default_factory=lambda: ["query"])
    effect: str = "allow"
    # 行级谓词模板列表；不参与 matches()，求值发生在 post_compile（见架构设计 §3）。
    row_scope: list[dict[str, Any]] = field(default_factory=list)
    execution_profile_code: str | None = None
    reason: str | None = None
    policy_version: str = "v1"
    policy_epoch: int = 1
    description: str | None = None

    def matches(
        self,
        *,
        principal_roles: list[str],
        data_level: str,
        action: str,
        resource_set: dict[str, Any],
    ) -> bool:
        if self.status != "active":
            return False
        subject_roles = set(_as_list(self.subject_roles))
        if subject_roles and not (subject_roles & set(_as_list(principal_roles))):
            return False
        data_levels = {value.upper() for value in _as_list((self.resource_scope or {}).get("data_levels") or [])}
        if data_levels and data_level.upper() not in data_levels:
            return False
        actions = set(_as_list(self.actions))
        if actions and "*" not in actions and action not in actions:
            return False
        return self._matches_resource(resource_set)

    def to_dict(self) -> dict[str, Any]:
        return {
            "policy_code": self.policy_code,
            "name": self.name,
            "description": self.description,
            "status": self.status,
            "priority": int(self.priority or 0),
            "subject_roles": list(self.subject_roles or []),
            "resource_scope": dict(self.resource_scope or {}),
            "actions": list(self.actions or []),
            "effect": self.effect,
            "row_scope": [dict(item) for item in (self.row_scope or [])],
            "execution_profile_code": self.execution_profile_code,
            "reason": self.reason,
            "policy_version": self.policy_version,
            "policy_epoch": int(self.policy_epoch or 1),
        }

    def _matches_resource(self, resource_set: dict[str, Any]) -> bool:
        matcher = self.resource_scope or {}
        if not matcher:
            return True

        physical = [item for item in (resource_set.get("physical") or []) if isinstance(item, dict)]
        tables = {str(item.get("table") or "").lower() for item in physical}
        qualified_tables = {
            f"{str(item.get('project') or '').lower()}.{str(item.get('table') or '').lower()}".strip(".")
            for item in physical
            if item.get("table")
        }
        projects = {str(item.get("project") or "").lower() for item in physical}
        schemas = {str(item.get("schema") or "").lower() for item in physical}
        data_source_ids = {str(item.get("data_source_id") or "").lower() for item in physical}
        tags = {
            str(tag).lower()
            for item in physical
            for tag in (item.get("tags") or [])
            if str(tag).strip()
        }
        logical = resource_set.get("logical") or {}
        logical_domains = {str(item).lower() for item in (logical.get("domains") or [])}
        logical_cubes = {str(item).lower() for item in (logical.get("cubes") or [])}
        logical_metrics = {str(item).lower() for item in (logical.get("metrics") or [])}

        exact_tables = {str(item).lower() for item in matcher.get("tables") or []}
        if exact_tables and (exact_tables & tables or exact_tables & qualified_tables):
            return True

        prefixes = [str(item).lower() for item in matcher.get("table_prefixes") or [] if str(item).strip()]
        if prefixes and any(any(table.startswith(prefix) for prefix in prefixes) for table in tables):
            return True

        layers = [str(item).lower().strip("_") for item in matcher.get("table_layers") or [] if str(item).strip()]
        if layers and (schemas & set(layers) or any(any(table.startswith(f"{layer}_") for layer in layers) for table in tables)):
            return True

        allowed_projects = {str(item).lower() for item in matcher.get("projects") or []}
        if allowed_projects and allowed_projects & projects:
            return True

        allowed_sources = {str(item).lower() for item in matcher.get("data_source_ids") or []}
        if allowed_sources and allowed_sources & data_source_ids:
            return True

        allowed_tags = {str(item).lower() for item in matcher.get("resource_tags") or []}
        if allowed_tags and allowed_tags & tags:
            return True

        allowed_domains = {str(item).lower() for item in matcher.get("domains") or []}
        if allowed_domains and allowed_domains & logical_domains:
            return True

        allowed_cubes = {str(item).lower() for item in matcher.get("cubes") or []}
        if allowed_cubes and allowed_cubes & logical_cubes:
            return True

        allowed_metrics = {str(item).lower() for item in matcher.get("metrics") or []}
        if allowed_metrics and allowed_metrics & logical_metrics:
            return True

        resource_keys = {
            "tables",
            "table_prefixes",
            "table_layers",
            "projects",
            "data_source_ids",
            "resource_tags",
            "domains",
            "cubes",
            "metrics",
        }
        return not any(matcher.get(key) for key in resource_keys)
