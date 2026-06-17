"""语义元数据可见性裁决（§6.2 metadata visibility）。

裁决经 DataPolicy 决策链（动作 ``semantic.discover`` / ``semantic.describe``），
过滤与脱敏本身不产生独立拒绝语义（见架构设计 §5.7 控制点边界表）：

- ``semantic.discover``：主体能否在目录/搜索中发现该资产（摘要级：name/title/description）。
- ``semantic.describe``：主体能否看到资产物理细节（表名 / dimension.sql / join 拓扑 / source_sql）。

默认规则（无策略命中时）：

- 登录人类主体可发现 active 资产 M0/M1 摘要；M2+ 资产摘要同样可发现，
  但物理细节需要对应数据角色（M2 → data_m2_detail_reader，M3 → data_m3_requester）。
- 服务身份可发现范围由 key 资源范围限定：仅当其角色命中 ``semantic.discover``
  allow 策略时可发现对应资产，未配置一律 fail closed。
- 匿名主体一律不可发现。
"""
from __future__ import annotations

from typing import Any

from app.application.governance.access import (
    PrincipalContext,
    infer_data_level_for_resource,
)
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)

ACTION_DISCOVER = "semantic.discover"
ACTION_DESCRIBE = "semantic.describe"

# describe 物理细节字段（cube payload 级）
_PHYSICAL_CUBE_FIELDS = ("table", "source_sql", "source_id", "source_database", "joins")

_DATA_ROLE_BY_LEVEL = {
    "M2": "data_m2_detail_reader",
    "M3": "data_m3_requester",
}

_REDACTED_PLACEHOLDER = "<redacted:requires_data_role>"


def cube_data_level(cube_payload: dict[str, Any]) -> str:
    """从 cube 物理表名推断数据级别（与查询链 infer 口径一致）。"""
    explicit = str(cube_payload.get("data_level") or "").upper()
    if explicit in {"M0", "M1", "M2", "M3"}:
        return explicit
    table = str(cube_payload.get("table") or "")
    return infer_data_level_for_resource(table)


class SemanticMetadataVisibilityService:
    """list_cubes / describe_cube / 全局 search 的元数据可见性门面。"""

    def __init__(self, *, policy_repository: Any | None = None) -> None:
        self._policy_repository = policy_repository

    # ── 裁决 ──

    def adjudicate(
        self,
        *,
        principal: PrincipalContext | None,
        action: str,
        cube_name: str | None = None,
        data_level: str = "M1",
        physical_table: str | None = None,
    ) -> dict[str, Any]:
        """返回 ``{"decision": allow|deny, "reason_code": ..., "matched_policy": ...}``。"""
        if principal is None or principal.principal_id == "anonymous":
            return {"decision": "deny", "reason_code": "principal_invalid", "matched_policy": None}

        matched = self._match_policies(
            principal=principal,
            action=action,
            cube_name=cube_name,
            data_level=data_level,
            physical_table=physical_table,
        )
        deny_policy = next((policy for policy in matched if policy.effect == "deny"), None)
        if deny_policy is not None:
            return {
                "decision": "deny",
                "reason_code": "metadata_policy_denied",
                "matched_policy": deny_policy.policy_code,
            }
        allow_policy = next((policy for policy in matched if policy.effect == "allow"), None)
        if allow_policy is not None:
            return {
                "decision": "allow",
                "reason_code": "metadata_policy_allowed",
                "matched_policy": allow_policy.policy_code,
            }

        # 默认规则（无策略命中）
        if principal.principal_type == "service":
            # 服务身份可发现范围由 semantic.discover 策略限定，未配置 fail closed
            return {
                "decision": "deny",
                "reason_code": "metadata_policy_not_matched",
                "matched_policy": None,
            }
        if action == ACTION_DISCOVER:
            # 登录人类主体默认可发现 active 资产摘要（含 M2+ 摘要）
            return {"decision": "allow", "reason_code": "default_discover_summary", "matched_policy": None}
        # describe 物理细节：M0/M1 默认放行；M2+ 需要对应数据角色
        required_role = _DATA_ROLE_BY_LEVEL.get(str(data_level).upper())
        if required_role is None:
            return {"decision": "allow", "reason_code": "default_describe_low_level", "matched_policy": None}
        if required_role in set(principal.roles or []):
            return {"decision": "allow", "reason_code": "default_describe_data_role", "matched_policy": None}
        return {
            "decision": "deny",
            "reason_code": "metadata_requires_data_role",
            "matched_policy": None,
            "required_roles": [required_role],
        }

    # ── 门面：目录过滤 ──

    def filter_discoverable_cubes(
        self,
        *,
        principal: PrincipalContext | None,
        cubes: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """search / list_cubes 摘要过滤：不可发现的资产直接剔除。"""
        visible: list[dict[str, Any]] = []
        for cube in cubes:
            verdict = self.adjudicate(
                principal=principal,
                action=ACTION_DISCOVER,
                cube_name=cube.get("name"),
                data_level=cube_data_level(cube),
                physical_table=cube.get("table"),
            )
            if verdict["decision"] == "allow":
                visible.append(cube)
        return visible

    # ── 门面：物理细节脱敏 ──

    def redact_cube_payload(
        self,
        *,
        principal: PrincipalContext | None,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """describe_cube 物理细节脱敏：无 describe 权限时去除表名 / SQL / join 拓扑。"""
        if not isinstance(payload, dict) or payload.get("error"):
            return payload
        data_level = cube_data_level(payload)
        verdict = self.adjudicate(
            principal=principal,
            action=ACTION_DESCRIBE,
            cube_name=payload.get("name"),
            data_level=data_level,
            physical_table=payload.get("table"),
        )
        if verdict["decision"] == "allow":
            return payload

        redacted = dict(payload)
        for field in _PHYSICAL_CUBE_FIELDS:
            if field in redacted:
                redacted[field] = None
        for collection_key in ("dimensions", "measures"):
            collection = redacted.get(collection_key)
            if isinstance(collection, dict):
                redacted[collection_key] = {
                    name: self._strip_sql(item) for name, item in collection.items()
                }
            elif isinstance(collection, list):
                redacted[collection_key] = [self._strip_sql(item) for item in collection]
        redacted["metadata_visibility"] = {
            "redacted": True,
            "data_level": data_level,
            "reason_code": verdict["reason_code"],
            "required_roles": verdict.get("required_roles") or [],
        }
        return redacted

    # ── 内部 ──

    def _match_policies(
        self,
        *,
        principal: PrincipalContext,
        action: str,
        cube_name: str | None,
        data_level: str,
        physical_table: str | None,
    ) -> list[Any]:
        if self._policy_repository is None:
            return []
        resource_set: dict[str, Any] = {"logical": {"cubes": [cube_name] if cube_name else []}}
        if physical_table:
            project, _, table_name = str(physical_table).rpartition(".")
            resource_set["physical"] = [
                {
                    "project": project,
                    "table": table_name or physical_table,
                    "data_level": data_level,
                }
            ]
        try:
            policies = list(self._policy_repository.list_policy_domains(status="active"))
        except Exception as exc:
            logger.warning("metadata_visibility_policy_load_failed", error=str(exc))
            return []
        return [
            policy
            for policy in policies
            if policy.matches(
                principal_roles=list(principal.roles or []),
                data_level=data_level,
                action=action,
                resource_set=resource_set,
            )
        ]

    @staticmethod
    def _strip_sql(item: Any) -> Any:
        if isinstance(item, dict) and "sql" in item:
            cleaned = dict(item)
            cleaned["sql"] = _REDACTED_PLACEHOLDER
            return cleaned
        return item


def migrate_policy_metadata_to_discover_policies(
    *,
    policy_metadata_repository: Any,
    governance_repository: Any,
) -> dict[str, Any]:
    """存量 ``PolicyMetadata.allowed_roles`` 迁移为 ``semantic.discover`` DataPolicy。

    迁移后 ``allowed_roles`` 废除裁决语义（``visibility`` 降级为展示偏好，见 §5.7）。
    迁移幂等：以 ``semantic_discover_<name>`` 作为 policy_code upsert。
    """
    migrated: list[str] = []
    skipped: list[str] = []
    for metadata in policy_metadata_repository.list_all():
        allowed_roles = [str(role).strip() for role in (metadata.allowed_roles or []) if str(role).strip()]
        if not allowed_roles or metadata.status != "active":
            skipped.append(metadata.name)
            continue
        if metadata.target_type == "metric":
            resource_scope: dict[str, Any] = {"metrics": [metadata.target_name]}
        else:
            resource_scope = {"cubes": [metadata.target_name]}
        governance_repository.upsert_data_policy(
            {
                "policy_code": f"semantic_discover_{metadata.name}",
                "name": f"semantic.discover 迁移：{metadata.name}",
                "description": f"迁移自 PolicyMetadata.allowed_roles（{metadata.name}），原 visibility={metadata.visibility}",
                "status": "active",
                "priority": 50,
                "subject_roles": allowed_roles,
                "resource_scope": resource_scope,
                "actions": [ACTION_DISCOVER, ACTION_DESCRIBE],
                "effect": "allow",
                "policy_version": "v1",
            }
        )
        migrated.append(metadata.name)
    return {"migrated": migrated, "skipped": skipped, "total": len(migrated)}
