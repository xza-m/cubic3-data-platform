"""Agent-ready 数据访问治理服务。

本模块位于应用层，承担单体内横切治理策略的最小实现：

- 将旧的 ``viewer_roles`` 兼容输入归一成 ``PrincipalContext``；
- 在编译后根据资源集合推导 M0-M3 数据层级；
- 为 Phase 1 生成不可执行的 ``TicketPreview``；
- 为后续 gateway 校验提供稳定的 logical SQL hash 规则。
"""
from __future__ import annotations

from dataclasses import dataclass, field
import hashlib
import re
from typing import Any, Iterable, Literal, Optional


DataLevel = Literal["M0", "M1", "M2", "M3"]
Decision = Literal["allow", "deny", "require_approval"]

_DATA_LEVEL_RANK: dict[str, int] = {"M0": 0, "M1": 1, "M2": 2, "M3": 3}
_SQL_KEYWORDS = (
    "select",
    "from",
    "where",
    "group",
    "by",
    "order",
    "limit",
    "join",
    "left",
    "right",
    "inner",
    "outer",
    "on",
    "and",
    "or",
    "as",
    "with",
    "having",
    "union",
    "all",
    "count",
    "sum",
    "avg",
    "min",
    "max",
)


def _dedupe(values: Iterable[Any]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        item = str(value or "").strip()
        if not item or item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


@dataclass(frozen=True)
class PrincipalContext:
    """统一后的请求主体上下文。"""

    principal_id: str
    display_name: Optional[str] = None
    roles: list[str] = field(default_factory=list)
    groups: list[str] = field(default_factory=list)
    departments: list[str] = field(default_factory=list)
    source: str = "anonymous"
    actor_type: str = "user"
    actor_id: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "principal_id": self.principal_id,
            "display_name": self.display_name,
            "roles": list(self.roles),
            "groups": list(self.groups),
            "departments": list(self.departments),
            "source": self.source,
            "actor_type": self.actor_type,
            "actor_id": self.actor_id or self.principal_id,
        }


@dataclass(frozen=True)
class PolicyDecisionResult:
    """数据访问策略决策。"""

    decision: Decision
    reason: str
    effective_data_level: DataLevel
    reason_code: str
    message: str
    matched_policies: list[dict[str, Any]] = field(default_factory=list)
    resource_set: dict[str, Any] = field(default_factory=dict)
    sql_hashes: list[str] = field(default_factory=list)
    effective_row_scope: dict[str, Any] = field(default_factory=dict)
    effective_column_scope: dict[str, Any] = field(default_factory=dict)
    execution_profile: dict[str, Any] = field(default_factory=dict)
    requires_approval: bool = False
    approval_available: bool = False
    required_roles: list[str] = field(default_factory=list)
    suggestions: list[dict[str, Any]] = field(default_factory=list)
    safe_alternatives: list[dict[str, Any]] = field(default_factory=list)
    decision_type: str = "preview"
    policy_version: str = "phase1-preview"
    ticket_preview: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "decision": self.decision,
            "effect": self.decision,
            "reason": self.reason,
            "reason_code": self.reason_code,
            "message": self.message,
            "matched_policies": list(self.matched_policies),
            "effective_data_level": self.effective_data_level,
            "data_level": self.effective_data_level,
            "resource_set": dict(self.resource_set),
            "sql_hashes": list(self.sql_hashes),
            "effective_row_scope": dict(self.effective_row_scope),
            "effective_column_scope": dict(self.effective_column_scope),
            "execution_profile": dict(self.execution_profile),
            "requires_approval": self.requires_approval,
            "approval_available": self.approval_available,
            "required_roles": list(self.required_roles),
            "suggestions": [dict(item) for item in self.suggestions],
            "safe_alternatives": [dict(item) for item in self.safe_alternatives],
            "decision_type": self.decision_type,
            "policy_version": self.policy_version,
        }


class PrincipalResolver:
    """将 API 入参和认证上下文归一为 PrincipalContext。"""

    def resolve(
        self,
        *,
        principal_context: Optional[dict[str, Any]],
        viewer_roles: Optional[list[str]],
        authenticated_user: Optional[dict[str, Any]],
    ) -> PrincipalContext:
        auth = authenticated_user or {}
        incoming = principal_context or {}
        roles = _dedupe(
            [
                *(auth.get("roles") or []),
                *(incoming.get("roles") or []),
                *(viewer_roles or []),
            ]
        )
        principal_id = str(
            incoming.get("principal_id")
            or incoming.get("user_id")
            or auth.get("user_id")
            or "anonymous"
        )
        if viewer_roles and not principal_context:
            source = "viewer_roles_compat"
        elif principal_context:
            source = str(incoming.get("source") or "principal_context")
        elif authenticated_user:
            source = "authenticated_user"
        else:
            source = "anonymous"
        return PrincipalContext(
            principal_id=principal_id,
            display_name=incoming.get("display_name") or auth.get("user_name"),
            roles=roles,
            groups=_dedupe(incoming.get("groups") or []),
            departments=_dedupe(incoming.get("departments") or []),
            source=source,
            actor_type=str(incoming.get("actor_type") or auth.get("actor_type") or "user"),
            actor_id=incoming.get("actor_id") or auth.get("actor_id") or principal_id,
        )


def canonical_sql(sql: str) -> str:
    """返回 logical SQL 的稳定规范化文本。"""

    value = re.sub(r"/\*.*?\*/", " ", sql or "", flags=re.DOTALL)
    value = re.sub(r"--[^\n\r]*", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    for keyword in _SQL_KEYWORDS:
        value = re.sub(rf"\b{keyword}\b", keyword.upper(), value, flags=re.IGNORECASE)
    return value


def canonical_sql_hash(sql: str) -> str:
    """计算 logical SQL 的 canonical hash。"""

    digest = hashlib.sha256(canonical_sql(sql).encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


def infer_data_level_for_resource(resource: str) -> DataLevel:
    name = (resource or "").strip().lower()
    if not name:
        return "M0"
    table_name = name.split(".")[-1]
    if name.startswith(("raw.", "ods.")) or table_name.startswith(("raw_", "ods_")):
        return "M3"
    if name.startswith("dwd.") or table_name.startswith("dwd_"):
        return "M2"
    if name.startswith(("dws.", "ads.", "dim.")) or table_name.startswith(("dws_", "ads_", "dim_")):
        return "M1"
    return "M1"


def _max_data_level(left: str, right: str) -> DataLevel:
    left_level = left if left in _DATA_LEVEL_RANK else "M0"
    right_level = right if right in _DATA_LEVEL_RANK else "M0"
    if _DATA_LEVEL_RANK[right_level] > _DATA_LEVEL_RANK[left_level]:
        return right_level  # type: ignore[return-value]
    return left_level  # type: ignore[return-value]


def _infer_data_level_from_resource_set(resource_set: Any) -> DataLevel:
    if not resource_set:
        return "M0"
    candidate: DataLevel = "M0"
    if isinstance(resource_set, dict):
        for item in resource_set.get("physical") or []:
            if not isinstance(item, dict):
                continue
            explicit_level = str(item.get("data_level") or "").upper()
            if explicit_level in _DATA_LEVEL_RANK:
                candidate = _max_data_level(candidate, explicit_level)
                continue
            resource_name = ".".join(
                part
                for part in [
                    str(item.get("project") or "").strip(),
                    str(item.get("schema") or "").strip(),
                    str(item.get("table") or "").strip(),
                ]
                if part
            )
            candidate = _max_data_level(candidate, infer_data_level_for_resource(resource_name))
        return candidate

    resources = [resource_set] if isinstance(resource_set, str) else list(resource_set)
    for resource in resources:
        candidate = _max_data_level(candidate, infer_data_level_for_resource(str(resource)))
    return candidate


def infer_data_level_for_targets(compiled_targets: list[dict[str, Any]]) -> DataLevel:
    level = "M0"
    for target in compiled_targets:
        explicit_level = str(target.get("data_level") or "").upper()
        if explicit_level in _DATA_LEVEL_RANK:
            candidate = explicit_level
        else:
            candidate = _infer_data_level_from_resource_set(target.get("resource_set"))
        if _DATA_LEVEL_RANK[candidate] > _DATA_LEVEL_RANK[level]:
            level = candidate
    return level  # type: ignore[return-value]


def _required_role_for_data_level(data_level: DataLevel) -> str:
    if data_level == "M3":
        return "data_m3_requester"
    if data_level == "M2":
        return "data_m2_detail_reader"
    if data_level == "M1":
        return "data_m1_reader"
    return "data_m0_reader"


def _has_any_data_role(roles: Iterable[str]) -> bool:
    return any(str(role).startswith("data_") for role in roles)


def _split_project_and_table(resource: str) -> tuple[str, str]:
    value = str(resource or "").strip()
    if "." not in value:
        return "", value
    project, _, table = value.rpartition(".")
    return project, table


def _normalize_resource_set(compiled_targets: list[dict[str, Any]]) -> dict[str, Any]:
    logical: dict[str, list[str]] = {
        "domains": [],
        "cubes": [],
        "metrics": [],
        "retrieval_sources": [],
        "tools": [],
    }
    physical: list[dict[str, Any]] = []
    physical_keys: set[tuple[str, str, str, str]] = set()

    def add_logical(key: str, values: Iterable[Any]) -> None:
        bucket = logical.setdefault(key, [])
        for value in values:
            item = str(value or "").strip()
            if item and item not in bucket:
                bucket.append(item)

    def add_physical(item: dict[str, Any], target: dict[str, Any]) -> None:
        table_value = str(item.get("table") or "").strip()
        project_value = str(item.get("project") or "").strip()
        if not table_value and item.get("resource"):
            project_value, table_value = _split_project_and_table(str(item.get("resource")))
        if not table_value:
            return
        trace_data_source = ((target.get("traceability") or {}).get("data_source") or {})
        if not project_value:
            project_value = str(item.get("database") or trace_data_source.get("source_database") or "")
        source_id = (
            item.get("data_source_id")
            or (target.get("execution_request") or {}).get("source_id")
            or trace_data_source.get("source_id")
            or "unknown"
        )
        data_level = str(item.get("data_level") or target.get("data_level") or "").upper()
        if data_level not in _DATA_LEVEL_RANK:
            data_level = infer_data_level_for_resource(table_value)
        key = (str(source_id), project_value, str(item.get("schema") or ""), table_value)
        if key in physical_keys:
            return
        physical_keys.add(key)
        physical.append(
            {
                "data_source_id": str(source_id),
                "engine": str(item.get("engine") or "maxcompute"),
                "project": project_value,
                "schema": str(item.get("schema") or ""),
                "table": table_value,
                "columns": list(item.get("columns") or target.get("columns") or []),
                "data_level": data_level,
                "tags": list(item.get("tags") or target.get("tags") or []),
            }
        )

    for target in compiled_targets:
        target_type = str(target.get("target_type") or "").lower()
        resource_set = target.get("resource_set") or []
        if isinstance(resource_set, dict):
            for key, values in (resource_set.get("logical") or {}).items():
                add_logical(str(key), values if isinstance(values, list) else [values])
            for item in resource_set.get("physical") or []:
                if isinstance(item, dict):
                    add_physical(item, target)
            continue
        resources = [resource_set] if isinstance(resource_set, str) else list(resource_set)
        if target_type == "retrieval":
            add_logical("retrieval_sources", resources)
            continue
        if target_type == "tool":
            add_logical("tools", resources)
            continue
        for resource in resources:
            project, table = _split_project_and_table(str(resource))
            add_physical({"resource": resource, "project": project, "table": table}, target)

    return {
        "logical": {key: values for key, values in logical.items() if values},
        "physical": physical,
    }


class AccessPolicyDecisionService:
    """Phase 1 最小数据访问策略服务。"""

    def pre_route(self, *, principal: PrincipalContext) -> PolicyDecisionResult:
        if principal.principal_id == "anonymous":
            return self._build_decision(
                principal=principal,
                decision="deny",
                reason="未识别的请求主体",
                reason_code="principal_invalid",
                data_level="M0",
                compiled_targets=[],
                required_roles=["authenticated_user"],
            )
        return self._build_decision(
            principal=principal,
            decision="allow",
            reason="主体已识别，允许进入语义规划",
            reason_code="principal_resolved",
            data_level="M0",
            compiled_targets=[],
        )

    def post_compile(
        self,
        *,
        principal: PrincipalContext,
        compiled_targets: list[dict[str, Any]],
        approval_id: Optional[str] = None,
    ) -> PolicyDecisionResult:
        data_level = infer_data_level_for_targets(compiled_targets)
        if data_level != "M0" and "platform_admin" in principal.roles and not _has_any_data_role(principal.roles):
            required_role = _required_role_for_data_level(data_level)
            return self._build_decision(
                principal=principal,
                decision="deny",
                reason="平台管理员不自动拥有数据访问权限",
                reason_code="platform_admin_without_data_role",
                data_level=data_level,
                compiled_targets=compiled_targets,
                required_roles=[required_role],
                safe_alternatives=[
                    {
                        "type": "request_data_role",
                        "label": f"申请 {required_role} 数据角色",
                        "role": required_role,
                    }
                ],
            )
        if data_level == "M3" and not approval_id:
            return self._build_decision(
                principal=principal,
                decision="require_approval",
                reason="M3/raw data 需要审批后才能生成真实执行凭证",
                reason_code="m3_raw_requires_approval",
                data_level=data_level,
                compiled_targets=compiled_targets,
                required_roles=["data_m3_requester"],
                suggestions=[
                    {
                        "type": "request_approval",
                        "label": "发起 raw data 审批",
                        "action": "approval.request",
                    }
                ],
                safe_alternatives=[
                    {
                        "type": "rewrite_query",
                        "label": "改查 DWS 聚合指标",
                        "target_data_level": "M1",
                    }
                ],
            )
        return self._build_decision(
            principal=principal,
            decision="allow",
            reason="Phase 1 预览策略允许生成不可执行 ticket preview",
            reason_code="phase1_preview_allowed",
            data_level=data_level,
            compiled_targets=compiled_targets,
            approval_id=approval_id,
        )

    def _build_decision(
        self,
        *,
        principal: PrincipalContext,
        decision: Decision,
        reason: str,
        reason_code: str,
        data_level: DataLevel,
        compiled_targets: list[dict[str, Any]],
        approval_id: Optional[str] = None,
        required_roles: Optional[list[str]] = None,
        suggestions: Optional[list[dict[str, Any]]] = None,
        safe_alternatives: Optional[list[dict[str, Any]]] = None,
    ) -> PolicyDecisionResult:
        resource_set = _normalize_resource_set(compiled_targets)
        sql_hashes = _dedupe(
            target.get("sql_hash")
            for target in compiled_targets
            if target.get("sql_hash")
        )
        execution_profile = {
            "profile_code": f"preview_{data_level.lower()}",
            "data_level": data_level,
            "credential_mode": "preview_only",
            "allowed_layers": _allowed_layers(data_level),
            "allowed_operations": ["preview"],
        }
        approval_required = data_level == "M3" and not approval_id
        ticket_preview = {
            "type": "ticket_preview",
            "enforcement": "preview_only",
            "principal_id": principal.principal_id,
            "actor_type": principal.actor_type,
            "actor_id": principal.actor_id or principal.principal_id,
            "data_level": data_level,
            "approval_required": approval_required,
            "approval_id": approval_id,
            "resource_set": resource_set,
            "sql_hashes": sql_hashes,
            "execution_profile": execution_profile,
            "decision_type": "preview",
            "m3_one_time_required": data_level == "M3",
            "expires_in": 300,
            "note": "Phase 1 仅用于 Agent Preview，不可被 gateway 接受",
        }
        required_roles = list(required_roles or [])
        suggestions = [dict(item) for item in (suggestions or [])]
        safe_alternatives = [dict(item) for item in (safe_alternatives or [])]
        return PolicyDecisionResult(
            decision=decision,
            reason=reason,
            reason_code=reason_code,
            message=reason,
            effective_data_level=data_level,
            matched_policies=[
                {
                    "policy_code": reason_code,
                    "effect": decision,
                    "data_level": data_level,
                    "policy_version": "phase1-preview",
                }
            ],
            resource_set=resource_set,
            sql_hashes=sql_hashes,
            execution_profile=execution_profile,
            requires_approval=approval_required,
            approval_available=decision == "require_approval",
            required_roles=required_roles,
            suggestions=suggestions,
            safe_alternatives=safe_alternatives,
            policy_version="phase1-preview",
            ticket_preview=ticket_preview,
        )


def _allowed_layers(data_level: DataLevel) -> list[str]:
    if data_level == "M0":
        return []
    if data_level == "M1":
        return ["dim", "dws", "ads"]
    if data_level == "M2":
        return ["dim", "dwd", "dws", "ads"]
    return ["ods", "raw"]
