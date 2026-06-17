"""free SQL 收口前置（§6.3 resource_set 同链裁决）。

Agent Loop 的 `execute_sql` 降级路径不再是治理弱区：执行前必须
1. 解析 SQL 提取表清单（resource_set）；解析失败一律 deny（fail closed）；
2. 携带 canonical sql_hash 走与语义路径相同的 post_compile 决策链；
3. 裁决结果（decision / reason_code / data_level / sql_hash）随工具结果进入 evidence。

row_scope 硬规则（§6.3）：free SQL 命中带 row_scope 模板的 allow 策略时一律 deny
（``row_scope_requires_semantic_path``），通过 ``post_compile(row_scope_mode="deny")`` 收口。
"""
from __future__ import annotations

import re
from typing import Any, Optional

from app.application.governance.access import (
    PrincipalContext,
    canonical_sql_hash,
    infer_data_level_for_resource,
)
from app.shared.utils.logger import get_logger
from app.shared.utils.sql_validator import extract_table_names

logger = get_logger(__name__)

_FROM_PATTERN = re.compile(r"\b(from|join)\b", re.IGNORECASE)


def resolve_agent_principal(agent_context: Any) -> PrincipalContext:
    """从 AgentContext 解析请求主体（free SQL 裁决与元数据可见性共用）。"""
    principal_id = _resolve_agent_principal_id(agent_context)
    if not principal_id:
        return PrincipalContext(principal_id="anonymous", source="agent_tool")
    try:
        from app.application.access.identity import RoleBindingResolver
        from app.extensions import db
        from app.infrastructure.access.repositories import SqlAccessRepository

        return RoleBindingResolver(SqlAccessRepository(db.session)).resolve_principal_context(
            principal_id=principal_id,
            actor_id=principal_id,
            actor_type="human",
            source="agent_tool",
        )
    except Exception as exc:
        # 角色解析失败按无角色处理（后续裁决自然 fail closed）
        logger.warning("agent_principal_resolve_failed", principal=principal_id, error=str(exc))
        return PrincipalContext(principal_id=principal_id, source="agent_tool")


def _resolve_agent_principal_id(agent_context: Any) -> Optional[str]:
    if agent_context is None:
        return None
    channel = getattr(agent_context, "channel", None)
    if channel == "feishu":
        open_id = getattr(agent_context, "open_id", None)
        tenant_key = getattr(agent_context, "tenant_key", None)
        if open_id and tenant_key:
            try:
                from app.application.access.identity import AccessIdentityService
                from app.extensions import db
                from app.infrastructure.access.repositories import SqlAccessRepository

                identity = AccessIdentityService(SqlAccessRepository(db.session))
                resolved = identity.find_principal_id_by_alias(
                    idp="feishu",
                    tenant_key=tenant_key,
                    external_id_type="open_id",
                    external_id=open_id,
                )
                if resolved:
                    return resolved
            except Exception as exc:
                logger.warning("agent_alias_resolve_failed", open_id=open_id, error=str(exc))
        return open_id
    user_id = getattr(agent_context, "user_id", None)
    return str(user_id) if user_id else None


class FreeSqlGuard:
    """execute_sql 的同链裁决器。"""

    def __init__(self, *, policy_service: Any):
        self._policy_service = policy_service

    def adjudicate(self, *, sql: str, agent_context: Any = None) -> dict[str, Any]:
        """返回结构化裁决结果；decision != allow 时调用方必须拒绝执行。"""
        tables = extract_table_names(sql)
        if _FROM_PATTERN.search(sql) and not tables:
            return {
                "decision": "deny",
                "reason": "SQL 无法解析出确定的资源清单（resource_set），按 fail closed 拒绝执行。",
                "reason_code": "sql_unparseable",
                "resource_tables": [],
            }

        sql_hash = canonical_sql_hash(sql)
        principal = self._resolve_principal(agent_context)
        physical = []
        for table in tables:
            project, _, table_name = table.rpartition(".")
            physical.append(
                {
                    "resource": table,
                    "project": project,
                    "table": table_name,
                    "data_level": infer_data_level_for_resource(table),
                }
            )
        compiled_target = {
            "target": {"target_type": "free_sql"},
            "resource_set": {
                "physical": physical,
                "logical": {"tools": ["execute_sql"]},
            },
            "sql_hash": sql_hash,
        }
        decision = self._policy_service.post_compile(
            principal=principal,
            compiled_targets=[compiled_target],
            row_scope_mode="deny",
        )
        result = {
            "decision": decision.decision,
            "reason": decision.reason,
            "reason_code": decision.reason_code,
            "data_level": decision.effective_data_level,
            "sql_hash": sql_hash,
            "resource_tables": tables,
            "principal_id": principal.principal_id,
        }
        if decision.decision != "allow":
            result["required_roles"] = list(decision.required_roles or [])
        return result

    def _resolve_principal(self, agent_context: Any) -> PrincipalContext:
        return resolve_agent_principal(agent_context)
