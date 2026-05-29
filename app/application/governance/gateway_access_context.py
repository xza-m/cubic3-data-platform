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

    return {
        "schema": "GatewayAccessContext.v1",
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
