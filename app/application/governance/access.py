"""Agent-ready 数据访问治理服务。

本模块位于应用层，承担单体内横切治理策略的最小实现：

- 将认证后的可信身份投影归一成 ``PrincipalContext``；
- 在编译后根据资源集合推导 M0-M3 数据层级；
- 为 Phase 1 生成不可执行的权限判定预览；
- 为后续独立 gateway 消费提供稳定的 access context 与 logical SQL hash 规则。
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field, replace
from typing import Any, Callable, Iterable, Literal, Optional

from app.application.governance.row_scope import evaluate_row_scope_templates


DataLevel = Literal["M0", "M1", "M2", "M3"]
Decision = Literal["allow", "deny", "require_approval"]

# RLS 行级安全执行模式（过渡开关，§6.3）。
RLS_MODES = frozenset({"off", "observe", "deny", "enforce"})
# 真正阻断（fail closed / 注入）的模式集合；observe / off 不阻断。
RLS_ENFORCING_MODES = frozenset({"deny", "enforce"})


def normalize_rls_mode(mode: Any) -> str:
    """归一 RLS 执行模式；非法或缺省回落到安全态 ``deny``。"""
    value = str(mode or "").strip().lower()
    return value if value in RLS_MODES else "deny"

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
    principal_type: str = "human"
    display_name: Optional[str] = None
    roles: list[str] = field(default_factory=list)
    platform_roles: list[str] = field(default_factory=list)
    data_roles: list[str] = field(default_factory=list)
    groups: list[str] = field(default_factory=list)
    departments: list[str] = field(default_factory=list)
    # RLS 数据范围属性（attribute → 值列表），只来自服务端解析，不采信请求体声明。
    data_scopes: dict[str, list[str]] = field(default_factory=dict)
    source: str = "anonymous"
    actor_type: str = "user"
    actor_id: Optional[str] = None
    # 双主体模型：subject = 数据归属主体（无委托时等于自身）；acting = 执行主体（actor_id）。
    subject_principal_id: Optional[str] = None

    @property
    def acting_principal_id(self) -> str:
        return self.actor_id or self.principal_id

    @property
    def effective_subject_principal_id(self) -> str:
        return self.subject_principal_id or self.principal_id

    def to_dict(self) -> dict[str, Any]:
        return {
            "principal_id": self.principal_id,
            "principal_type": self.principal_type,
            "display_name": self.display_name,
            "roles": list(self.roles),
            "platform_roles": list(self.platform_roles),
            "data_roles": list(self.data_roles),
            "groups": list(self.groups),
            "departments": list(self.departments),
            "data_scopes": {key: list(values) for key, values in (self.data_scopes or {}).items()},
            "source": self.source,
            "actor_type": self.actor_type,
            "actor_id": self.actor_id or self.principal_id,
            "subject_principal_id": self.effective_subject_principal_id,
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
    governance_required: bool = False
    approval_available: bool = False
    required_roles: list[str] = field(default_factory=list)
    suggestions: list[dict[str, Any]] = field(default_factory=list)
    safe_alternatives: list[dict[str, Any]] = field(default_factory=list)
    decision_type: str = "preview"
    policy_version: str = "phase1-preview"
    policy_epoch: int = 1
    ticket_preview: dict[str, Any] = field(default_factory=dict)
    execution_permit: dict[str, Any] = field(default_factory=dict)
    decision_id: Optional[str] = None
    # RLS 执行模式（过渡开关）：下游 fail closed / 网关 v2 升级均以此为准。
    rls_enforcement_mode: str = "deny"

    def to_dict(self) -> dict[str, Any]:
        payload = {
            "decision_id": self.decision_id,
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
            "execution_profile": dict(self.execution_profile),
            "requires_approval": self.requires_approval,
            "governance_required": self.governance_required,
            "approval_available": self.approval_available,
            "required_roles": list(self.required_roles),
            "suggestions": [dict(item) for item in self.suggestions],
            "safe_alternatives": [dict(item) for item in self.safe_alternatives],
            "decision_type": self.decision_type,
            "policy_version": self.policy_version,
            "policy_epoch": int(self.policy_epoch or 1),
            "execution_permit": dict(self.execution_permit),
            "rls_enforcement_mode": self.rls_enforcement_mode,
        }
        if self.effective_row_scope:
            payload["effective_row_scope"] = dict(self.effective_row_scope)
        if self.effective_column_scope:
            payload["effective_column_scope"] = dict(self.effective_column_scope)
        return payload


class PrincipalResolver:
    """将可信身份上下文归一为 PrincipalContext。

    新权限体系不再信任请求体中的 viewer_roles / roles / permissions；
    角色只应来自服务端解析后的 principal_context。
    """

    def resolve(
        self,
        *,
        principal_context: Optional[dict[str, Any]],
        viewer_roles: Optional[list[str]] = None,
        authenticated_user: Optional[dict[str, Any]] = None,
    ) -> PrincipalContext:
        auth = authenticated_user or {}
        incoming = principal_context or {}
        roles = _dedupe(incoming.get("roles") or [])
        principal_id = str(
            incoming.get("principal_id")
            or incoming.get("user_id")
            or auth.get("user_id")
            or "anonymous"
        )
        if principal_context:
            source = str(incoming.get("source") or "principal_context")
        elif authenticated_user:
            source = "authenticated_user"
        else:
            source = "anonymous"
        raw_scopes = incoming.get("data_scopes") if isinstance(incoming.get("data_scopes"), dict) else {}
        data_scopes = {
            str(key): _dedupe(values if isinstance(values, (list, tuple, set)) else [values])
            for key, values in raw_scopes.items()
            if str(key or "").strip()
        }
        return PrincipalContext(
            principal_id=principal_id,
            principal_type=str(incoming.get("principal_type") or auth.get("principal_type") or "human"),
            display_name=incoming.get("display_name") or auth.get("user_name"),
            roles=roles,
            platform_roles=[role for role in roles if not str(role).startswith("data_")],
            data_roles=[role for role in roles if str(role).startswith("data_")],
            groups=_dedupe(incoming.get("groups") or []),
            departments=_dedupe(incoming.get("departments") or []),
            data_scopes=data_scopes,
            source=source,
            actor_type=str(incoming.get("actor_type") or auth.get("actor_type") or "user"),
            actor_id=incoming.get("actor_id") or auth.get("actor_id") or principal_id,
            subject_principal_id=str(incoming.get("subject_principal_id") or "") or None,
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
    if name.startswith("dws.") or table_name.startswith("dws_"):
        return "M1"
    if name.startswith(("dim.", "ads.")) or table_name.startswith(("dim_", "ads_")):
        return "M0"
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


def _resource_set_physical(resource_set: dict[str, Any]) -> list[dict[str, Any]]:
    return [dict(item) for item in (resource_set.get("physical") or []) if isinstance(item, dict)]


def _repository_current_policy_epoch(policy_repository: Any | None) -> int:
    if policy_repository is None or not hasattr(policy_repository, "current_policy_epoch"):
        return 1
    return int(policy_repository.current_policy_epoch() or 1)


def _policy_epoch(policy: Any) -> int:
    return int(getattr(policy, "policy_epoch", None) or 1)


def _execution_constraints(execution_profile: dict[str, Any]) -> dict[str, Any]:
    return {
        "max_rows": execution_profile.get("max_rows"),
        "timeout_seconds": execution_profile.get("timeout_seconds"),
        "export_allowed": bool(execution_profile.get("export_allowed", False)),
        "requires_strong_audit": bool(execution_profile.get("requires_strong_audit", False)),
        "allowed_operations": list(execution_profile.get("allowed_operations") or []),
    }


def _build_access_context_preview(
    *,
    principal: PrincipalContext,
    data_level: DataLevel,
    resource_set: dict[str, Any],
    sql_hashes: list[str],
    execution_profile: dict[str, Any],
    policy_version: str,
    policy_epoch: int,
) -> dict[str, Any]:
    return {
        "schema": "GatewayAccessContextPreview.v1",
        "principal_id": principal.principal_id,
        "actor_type": principal.actor_type,
        "actor_id": principal.actor_id or principal.principal_id,
        "policy_version": policy_version,
        "policy_epoch": int(policy_epoch or 1),
        "execution_profile_code": str(execution_profile.get("profile_code") or ""),
        "resource_set_physical": _resource_set_physical(resource_set),
        "sql_hashes": list(sql_hashes),
        "sql_hash_scope": "compiler_logical_sql",
        "constraints": _execution_constraints(execution_profile),
        "data_level": data_level,
        "enforcement": "control_plane_only",
    }


class AccessPolicyDecisionService:
    """Phase 1 最小数据访问策略服务。"""

    def __init__(
        self,
        policy_repository: Any | None = None,
        *,
        rls_enforcement_mode: str = "deny",
    ) -> None:
        self._policy_repository = policy_repository
        # 代码层默认安全态 deny；生产由 DI 注入 config（默认 observe 过渡态）。
        self._rls_enforcement_mode = normalize_rls_mode(rls_enforcement_mode)

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
        dimension_resolver: Optional[Callable[[str], Optional[dict[str, Any]]]] = None,
        row_scope_mode: str = "evaluate",
    ) -> PolicyDecisionResult:
        """post_compile 准入裁决 + 行级裁决（见架构设计 §5.7 控制点边界表）。

        - ``dimension_resolver``：把 row_scope 模板的 ``dimension_ref`` 经与编译同
          release 的 manifest catalog 解析为物理表+列；未提供时命中 row_scope 策略
          一律 fail closed。
        - ``row_scope_mode``：``evaluate``（语义路径，求值产出 effective_row_scope）
          或 ``deny``（free SQL 等非语义路径，命中 row_scope 策略直接拒绝，
          ``row_scope_requires_semantic_path``，§6.3 硬规则）。
        """

        if self._policy_repository is not None:
            return self._post_compile_with_repository(
                principal=principal,
                compiled_targets=compiled_targets,
                approval_id=approval_id,
                dimension_resolver=dimension_resolver,
                row_scope_mode=row_scope_mode,
            )
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

    def _post_compile_with_repository(
        self,
        *,
        principal: PrincipalContext,
        compiled_targets: list[dict[str, Any]],
        approval_id: Optional[str] = None,
        dimension_resolver: Optional[Callable[[str], Optional[dict[str, Any]]]] = None,
        row_scope_mode: str = "evaluate",
    ) -> PolicyDecisionResult:
        data_level = infer_data_level_for_targets(compiled_targets)
        resource_set = _normalize_resource_set(compiled_targets)
        sql_hashes = _dedupe(
            target.get("sql_hash")
            for target in compiled_targets
            if target.get("sql_hash")
        )
        release_id, scoped_table_refs = _extract_ticket_binding_material(compiled_targets)
        roles = list(principal.roles or [])
        if data_level != "M0" and "platform_admin" in roles and not _has_any_data_role(roles):
            policy_epoch = _repository_current_policy_epoch(self._policy_repository)
            result = self._repository_decision(
                principal=principal,
                decision="deny",
                reason="平台管理员不自动拥有数据访问权限",
                reason_code="platform_admin_without_data_role",
                data_level=data_level,
                resource_set=resource_set,
                sql_hashes=sql_hashes,
                matched_policies=[
                    {
                        "policy_code": "platform_admin_without_data_role",
                        "effect": "deny",
                        "data_level": data_level,
                    }
                ],
                required_roles=[_required_role_for_data_level(data_level)],
                policy_epoch=policy_epoch,
            )
            return self._persist_decision(result)

        if data_level == "M3":
            policy_epoch = _repository_current_policy_epoch(self._policy_repository)
            result = self._repository_decision(
                principal=principal,
                decision="deny",
                reason="M3/raw data 默认不可直接消费，请治理为 M2 受控资产",
                reason_code="m3_governance_required",
                data_level=data_level,
                resource_set=resource_set,
                sql_hashes=sql_hashes,
                matched_policies=[
                    {
                        "policy_code": "m3_raw_block",
                        "effect": "deny",
                        "data_level": "M3",
                        "policy_version": "v1",
                    }
                ],
                governance_required=True,
                required_roles=["governance_admin"],
                policy_epoch=policy_epoch,
                safe_alternatives=[
                    {
                        "type": "rewrite_query",
                        "label": "改查 DWS/ADS 聚合指标",
                        "target_data_level": "M1",
                    },
                    {
                        "type": "govern_data_asset",
                        "label": "治理为 M2 受控明细或脱敏视图",
                        "target_data_level": "M2",
                    },
                ],
            )
            return self._persist_decision(result)

        policies = list(self._policy_repository.list_policy_domains(status="active"))
        matching = [
            policy
            for policy in policies
            if policy.matches(
                principal_roles=roles,
                data_level=data_level,
                action="query",
                resource_set=resource_set,
            )
        ]
        deny_policy = next((policy for policy in matching if policy.effect == "deny"), None)
        if deny_policy is not None:
            result = self._repository_decision(
                principal=principal,
                decision="deny",
                reason=deny_policy.reason or "命中阻断规则",
                reason_code="data_policy_denied",
                data_level=data_level,
                resource_set=resource_set,
                sql_hashes=sql_hashes,
                matched_policies=[deny_policy.to_dict()],
                policy_version=deny_policy.policy_version,
                policy_epoch=_policy_epoch(deny_policy),
            )
            return self._persist_decision(result)

        allow_policy = next((policy for policy in matching if policy.effect == "allow"), None)
        if allow_policy is None:
            policy_epoch = _repository_current_policy_epoch(self._policy_repository)
            result = self._repository_decision(
                principal=principal,
                decision="deny",
                reason="未命中可用数据访问权限或访问规则",
                reason_code="data_policy_not_matched",
                data_level=data_level,
                resource_set=resource_set,
                sql_hashes=sql_hashes,
                matched_policies=[],
                policy_epoch=policy_epoch,
                required_roles=[_required_role_for_data_level(data_level)],
                safe_alternatives=[
                    {
                        "type": "assign_permission_package",
                        "label": "分配对应数据访问权限",
                        "role": _required_role_for_data_level(data_level),
                    }
                ],
            )
            return self._persist_decision(result)

        profile = None
        if allow_policy.execution_profile_code:
            profile = self._policy_repository.get_execution_profile(allow_policy.execution_profile_code)
        if profile is None or profile.status != "active":
            result = self._repository_decision(
                principal=principal,
                decision="deny",
                reason="访问规则缺少可用执行方式",
                reason_code="execution_profile_missing",
                data_level=data_level,
                resource_set=resource_set,
                sql_hashes=sql_hashes,
                matched_policies=[allow_policy.to_dict()],
                policy_version=allow_policy.policy_version,
                policy_epoch=_policy_epoch(allow_policy),
            )
            return self._persist_decision(result)

        execution_profile = _execution_profile_from_orm(profile)

        # 行级裁决：命中最高优先级 allow 策略后逐条求值 row_scope 模板。
        # attribute 取值来自 subject 主体 data_scopes；dimension_ref 经 manifest
        # catalog（与编译同 release）解析；求值失败 fail closed（row_scope_unresolved）。
        row_scope_templates = [
            dict(item)
            for item in (getattr(allow_policy, "row_scope", None) or [])
            if isinstance(item, dict)
        ]
        effective_row_scope: dict[str, Any] = {}
        # RLS 执行模式（§6.3 过渡开关）：
        #   off      — 不求值、不阻断；
        #   observe  — 求值产出 effective_row_scope 供审计，但绝不阻断（网关零感知）；
        #   deny/enforce — 命中即 fail closed（gateway 注入未就绪）。
        enforcing = self._rls_enforcement_mode in RLS_ENFORCING_MODES
        if row_scope_templates and self._rls_enforcement_mode != "off":
            if row_scope_mode == "deny":
                # free SQL / 非语义路径：无法注入；仅 enforcing 模式 fail closed。
                if enforcing:
                    result = self._repository_decision(
                        principal=principal,
                        decision="deny",
                        reason="该资源带行级安全策略，仅允许语义路径（gateway 注入）访问",
                        reason_code="row_scope_requires_semantic_path",
                        data_level=data_level,
                        resource_set=resource_set,
                        sql_hashes=sql_hashes,
                        matched_policies=[allow_policy.to_dict()],
                        policy_version=allow_policy.policy_version,
                        policy_epoch=_policy_epoch(allow_policy),
                    )
                    return self._persist_decision(result)
                # observe：free SQL 无法求值注入，按 advisory 放行（不计算 entries）。
            else:
                subject_scopes = dict(principal.data_scopes or {})
                # 服务身份（模式 A）未配 scope 且命中 row_scope 策略 → enforcing 一律 fail
                # closed，不允许通过 on_missing=unrestricted 绕过。
                if principal.principal_type == "service" and not subject_scopes:
                    entries, deny_code = [], "row_scope_unresolved"
                else:
                    entries, deny_code = evaluate_row_scope_templates(
                        templates=row_scope_templates,
                        data_scopes=subject_scopes,
                        policy_code=allow_policy.policy_code,
                        dimension_resolver=dimension_resolver,
                    )
                if deny_code:
                    if enforcing:
                        result = self._repository_decision(
                            principal=principal,
                            decision="deny",
                            reason="行级安全模板求值失败：缺少数据范围属性或维度引用不可解析",
                            reason_code=deny_code,
                            data_level=data_level,
                            resource_set=resource_set,
                            sql_hashes=sql_hashes,
                            matched_policies=[allow_policy.to_dict()],
                            policy_version=allow_policy.policy_version,
                            policy_epoch=_policy_epoch(allow_policy),
                        )
                        return self._persist_decision(result)
                    # observe：求值失败不阻断，放行（effective_row_scope 留空）。
                elif entries:
                    effective_row_scope = {
                        "version": "v1",
                        "subject_principal_id": principal.effective_subject_principal_id,
                        "entries": entries,
                    }

        result = self._repository_decision(
            principal=principal,
            decision="allow",
            reason="命中数据访问权限与默认访问规则",
            reason_code="data_policy_allowed",
            data_level=data_level,
            resource_set=resource_set,
            sql_hashes=sql_hashes,
            matched_policies=[allow_policy.to_dict()],
            execution_profile=execution_profile,
            policy_version=allow_policy.policy_version,
            policy_epoch=_policy_epoch(allow_policy),
            effective_row_scope=effective_row_scope,
            release_id=release_id,
            scoped_table_refs=scoped_table_refs,
            execution_permit={
                "mode": "policy_decision_preview",
                "profile_code": execution_profile.get("profile_code"),
                "enforcement": "control_plane_only",
            },
        )
        return self._persist_decision(result)

    def _repository_decision(
        self,
        *,
        principal: PrincipalContext,
        decision: Decision,
        reason: str,
        reason_code: str,
        data_level: DataLevel,
        resource_set: dict[str, Any],
        sql_hashes: list[str],
        matched_policies: list[dict[str, Any]],
        execution_profile: dict[str, Any] | None = None,
        policy_version: str = "v1",
        policy_epoch: int = 1,
        governance_required: bool = False,
        required_roles: list[str] | None = None,
        suggestions: list[dict[str, Any]] | None = None,
        safe_alternatives: list[dict[str, Any]] | None = None,
        execution_permit: dict[str, Any] | None = None,
        effective_row_scope: dict[str, Any] | None = None,
        release_id: str | None = None,
        scoped_table_refs: list[dict[str, Any]] | None = None,
    ) -> PolicyDecisionResult:
        permit = dict(execution_permit or {"mode": "not_issued", "reason_code": reason_code})
        if decision == "allow" and execution_profile:
            permit.setdefault("mode", "policy_decision_preview")
            permit.setdefault("enforcement", "control_plane_only")
            permit["access_context_preview"] = _build_access_context_preview(
                principal=principal,
                data_level=data_level,
                resource_set=resource_set,
                sql_hashes=sql_hashes,
                execution_profile=execution_profile,
                policy_version=policy_version,
                policy_epoch=policy_epoch,
            )
        ticket_preview = {
            "type": "ticket_preview",
            "enforcement": "policy_decision_only",
            "principal_id": principal.principal_id,
            "actor_type": principal.actor_type,
            "actor_id": principal.actor_id or principal.principal_id,
            "acting_principal_id": principal.acting_principal_id,
            "subject_principal_id": principal.effective_subject_principal_id,
            "data_level": data_level,
            "resource_set_physical": _resource_set_physical(resource_set),
            "sql_hashes": sql_hashes,
            "sql_hash_scope": "compiler_logical_sql",
            "execution_profile": execution_profile or {},
            "execution_profile_code": (execution_profile or {}).get("profile_code"),
            "decision_type": "inline",
            "policy_version": policy_version,
            "policy_epoch": int(policy_epoch or 1),
            "note": "当前为权限判定预览，不是 gateway 可执行凭证",
        }
        if effective_row_scope:
            ticket_preview["effective_row_scope"] = dict(effective_row_scope)
        # ticket 绑定三元组：双主体 + release_id + canonical_sql_hash（gateway 验签 TODO）
        if release_id:
            ticket_preview["release_id"] = release_id
        if scoped_table_refs:
            ticket_preview["scoped_table_refs"] = [dict(item) for item in scoped_table_refs]
        return PolicyDecisionResult(
            decision=decision,
            reason=reason,
            reason_code=reason_code,
            message=reason,
            effective_data_level=data_level,
            matched_policies=matched_policies,
            resource_set=resource_set,
            sql_hashes=sql_hashes,
            effective_row_scope=dict(effective_row_scope or {}),
            execution_profile=execution_profile or {},
            requires_approval=False,
            governance_required=governance_required,
            approval_available=False,
            required_roles=list(required_roles or []),
            suggestions=[dict(item) for item in (suggestions or [])],
            safe_alternatives=[dict(item) for item in (safe_alternatives or [])],
            decision_type="inline",
            policy_version=policy_version,
            policy_epoch=policy_epoch,
            ticket_preview=ticket_preview,
            execution_permit=permit,
            rls_enforcement_mode=self._rls_enforcement_mode,
        )

    def _persist_decision(self, result: PolicyDecisionResult) -> PolicyDecisionResult:
        if self._policy_repository is None:
            return result
        saved = self._policy_repository.save_policy_decision(
            {
                "principal_id": result.ticket_preview.get("principal_id") or "anonymous",
                "actor_id": result.ticket_preview.get("actor_id"),
                "decision": result.decision,
                "reason_code": result.reason_code,
                "reason": result.reason,
                "data_level": result.effective_data_level,
                "resource_set": result.resource_set,
                "sql_hashes": result.sql_hashes,
                "matched_policies": result.matched_policies,
                "effective_row_scope": dict(result.effective_row_scope or {}) or None,
                "execution_profile_code": result.execution_profile.get("profile_code"),
                "policy_version": result.policy_version,
                "policy_epoch": result.policy_epoch,
                "decision_type": result.decision_type,
                "governance_required": result.governance_required,
            }
        )
        decision_id = (saved or {}).get("decision_id")
        if not decision_id:
            return result
        # 把持久化生成的 decision_id 回写到决策与 access_context_preview，
        # gateway 的 GatewayAccessContext.v1 要求 policy_decision_id 必填可审计。
        permit = dict(result.execution_permit)
        preview = permit.get("access_context_preview")
        if isinstance(preview, dict):
            permit["access_context_preview"] = {**preview, "policy_decision_id": decision_id}
        return replace(result, decision_id=decision_id, execution_permit=permit)

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
            policy_epoch=1,
            ticket_preview=ticket_preview,
            rls_enforcement_mode=self._rls_enforcement_mode,
        )


def _extract_ticket_binding_material(
    compiled_targets: list[dict[str, Any]],
) -> tuple[str | None, list[dict[str, Any]]]:
    """从编译产物提取 ticket 绑定材料：release_id 与 row_scope 注入锚点。"""

    release_id: str | None = None
    scoped_table_refs: list[dict[str, Any]] = []
    for target in compiled_targets or []:
        if not isinstance(target, dict):
            continue
        material = target.get("ticket_material") or {}
        if not isinstance(material, dict):
            continue
        pin = material.get("runtime_version_pin") or {}
        if not release_id and isinstance(pin, dict) and pin.get("release_id"):
            release_id = str(pin["release_id"])
        for ref in material.get("scoped_table_refs") or []:
            if isinstance(ref, dict):
                scoped_table_refs.append(dict(ref))
    return release_id, scoped_table_refs


def _allowed_layers(data_level: DataLevel) -> list[str]:
    if data_level == "M0":
        return []
    if data_level == "M1":
        return ["dim", "dws", "ads"]
    if data_level == "M2":
        return ["dim", "dwd", "dws", "ads"]
    return ["ods", "raw"]


def _execution_profile_from_orm(row: Any) -> dict[str, Any]:
    return {
        "profile_code": row.profile_code,
        "name": row.name,
        "description": row.description,
        "credential_mode": row.credential_mode,
        "data_level": row.data_level,
        "allowed_operations": list(row.allowed_operations or []),
        "max_rows": row.max_rows,
        "timeout_seconds": row.timeout_seconds,
        "export_allowed": bool(row.export_allowed),
        "requires_strong_audit": bool(row.requires_strong_audit),
        "status": row.status,
    }
