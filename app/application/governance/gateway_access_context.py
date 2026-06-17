"""dw-query-gateway 访问上下文构造器。"""

from __future__ import annotations

from typing import Any


def build_gateway_access_context(
    *,
    policy_decision: dict[str, Any],
    ticket_preview: dict[str, Any] | None = None,
    principal_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """把平台治理结果规整成 gateway 可审计的 AccessContext。"""

    permit = dict(policy_decision.get("execution_permit") or {})
    preview = dict(permit.get("access_context_preview") or {})
    ticket = dict(ticket_preview or policy_decision.get("ticket_preview") or {})
    principal = dict(principal_context or policy_decision.get("principal_context") or {})

    sql_hashes = (
        preview.get("sql_hashes")
        or ticket.get("sql_hashes")
        or policy_decision.get("sql_hashes")
        or []
    )
    resource_refs = (
        preview.get("resource_refs")
        or preview.get("resource_set_physical")
        or ticket.get("resource_refs")
        or ticket.get("resource_set_physical")
        or []
    )

    effective_row_scope = dict(
        policy_decision.get("effective_row_scope")
        or ticket.get("effective_row_scope")
        or {}
    )
    row_scope_entries = [
        dict(item)
        for item in (effective_row_scope.get("entries") or [])
        if isinstance(item, dict)
    ]
    release_id = (
        ticket.get("release_id")
        or preview.get("release_id")
        or policy_decision.get("release_id")
    )
    scoped_table_refs = [
        dict(item)
        for item in (ticket.get("scoped_table_refs") or preview.get("scoped_table_refs") or [])
        if isinstance(item, dict)
    ]
    acting_principal_id = (
        ticket.get("acting_principal_id")
        or principal.get("actor_id")
        or principal.get("principal_id")
    )
    subject_principal_id = (
        ticket.get("subject_principal_id")
        or principal.get("subject_principal_id")
        or principal.get("principal_id")
    )

    # v2 增量字段：row_scope / release_id / scoped_table_refs / 双主体。
    # 仅当存在 row_scope 且执行模式为 deny/enforce（需要网关注入）时才升级为 v2；
    # observe / off 维持 v1，网关旧合约消费方零感知（缺省按安全态 deny 处理）。
    enforcement_mode = str(policy_decision.get("rls_enforcement_mode") or "deny").strip().lower()
    enforce_row_scope = bool(row_scope_entries) and enforcement_mode in {"deny", "enforce"}
    schema = "GatewayAccessContext.v2" if enforce_row_scope else "GatewayAccessContext.v1"

    context = {
        "schema": schema,
        "policy_decision_id": policy_decision.get("decision_id") or preview.get("policy_decision_id"),
        "policy_trace_id": policy_decision.get("trace_id") or preview.get("trace_id"),
        "policy_version": preview.get("policy_version") or policy_decision.get("policy_version"),
        "policy_epoch": preview.get("policy_epoch") or policy_decision.get("policy_epoch"),
        "decision": policy_decision.get("decision") or policy_decision.get("effect"),
        "principal_id": preview.get("principal_id") or principal.get("principal_id") or ticket.get("principal_id"),
        "actor_type": preview.get("actor_type") or principal.get("actor_type"),
        "actor_id": preview.get("actor_id") or principal.get("actor_id") or principal.get("principal_id"),
        "principal": principal,
        "execution_profile_code": preview.get("execution_profile_code")
        or (policy_decision.get("execution_profile") or {}).get("profile_code"),
        "data_level": preview.get("data_level") or policy_decision.get("effective_data_level"),
        "resource_refs": list(resource_refs),
        "resource_set_physical": list(resource_refs),
        "compiled_targets": list(preview.get("compiled_targets") or ticket.get("compiled_targets") or []),
        "sql_hashes": list(sql_hashes),
        "constraints": dict(preview.get("constraints") or {}),
        "ticket": {
            "id": ticket.get("id") or permit.get("ticket_id"),
            "expires_at": ticket.get("expires_at") or permit.get("expires_at"),
        },
    }
    if schema == "GatewayAccessContext.v2":
        context.update(
            {
                "row_scope": row_scope_entries,
                "release_id": release_id,
                "scoped_table_refs": scoped_table_refs,
                "acting_principal_id": acting_principal_id,
                "subject_principal_id": subject_principal_id,
            }
        )
    return context
