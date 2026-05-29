from __future__ import annotations

from app.application.governance.gateway_access_context import build_gateway_access_context


def test_gateway_access_context_prefers_policy_preview():
    context = build_gateway_access_context(
        policy_decision={
            "decision_id": "pd-1",
            "decision": "allow",
            "sql_hashes": ["fallback"],
            "execution_permit": {
                "ticket_id": "ticket-1",
                "access_context_preview": {
                    "principal_id": "principal-a",
                    "execution_profile_code": "mc_m1",
                    "resource_set_physical": [{"project": "dw", "table": "dws_course_daily"}],
                    "sql_hashes": ["preview-hash"],
                },
            },
        },
        ticket_preview={"sql_hashes": ["ticket-hash"]},
        principal_context={"principal_id": "principal-b"},
    )

    assert context["schema"] == "GatewayAccessContext.v1"
    assert context["policy_decision_id"] == "pd-1"
    assert context["principal_id"] == "principal-a"
    assert context["principal"]["principal_id"] == "principal-b"
    assert context["sql_hashes"] == ["preview-hash"]
    assert context["resource_set_physical"] == [{"project": "dw", "table": "dws_course_daily"}]
    assert context["ticket"]["id"] == "ticket-1"


def test_gateway_access_context_uses_ticket_preview_as_fallback():
    context = build_gateway_access_context(
        policy_decision={"decision": "allow"},
        ticket_preview={
            "id": "ticket-2",
            "expires_at": "2026-05-29T12:00:00Z",
            "resource_refs": [{"project": "dw", "table": "ads_user"}],
            "sql_hashes": ["ticket-hash"],
        },
    )

    assert context["resource_refs"] == [{"project": "dw", "table": "ads_user"}]
    assert context["sql_hashes"] == ["ticket-hash"]
    assert context["ticket"]["id"] == "ticket-2"
