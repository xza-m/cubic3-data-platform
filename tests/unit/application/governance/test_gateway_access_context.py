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


def test_gateway_access_context_upgrades_to_v2_when_row_scope_present():
    context = build_gateway_access_context(
        policy_decision={
            "decision_id": "pd-3",
            "decision": "allow",
            "effective_row_scope": {
                "version": "v1",
                "subject_principal_id": "user:alice",
                "entries": [
                    {
                        "table": "dwd_comment_reports",
                        "column": "school_id",
                        "operator": "in",
                        "values": ["s_001"],
                        "policy_code": "m2_detail_read",
                        "dimension_ref": "comment_reports.school_id",
                    }
                ],
            },
        },
        ticket_preview={
            "sql_hashes": ["hash-1"],
            "release_id": "rel-9",
            "scoped_table_refs": [
                {"table": "dwd_comment_reports", "alias": "comment_reports", "scan_anchor": "from"}
            ],
            "acting_principal_id": "service:agent-1",
            "subject_principal_id": "user:alice",
        },
        principal_context={"principal_id": "service:agent-1"},
    )

    assert context["schema"] == "GatewayAccessContext.v2"
    assert context["row_scope"][0]["column"] == "school_id"
    assert context["release_id"] == "rel-9"
    assert context["scoped_table_refs"][0]["scan_anchor"] == "from"
    assert context["acting_principal_id"] == "service:agent-1"
    assert context["subject_principal_id"] == "user:alice"


def test_gateway_access_context_stays_v1_without_row_scope():
    context = build_gateway_access_context(
        policy_decision={"decision": "allow"},
        ticket_preview={"sql_hashes": ["hash-1"], "release_id": "rel-9"},
    )

    assert context["schema"] == "GatewayAccessContext.v1"
    assert "row_scope" not in context
    assert "release_id" not in context


def _row_scope_decision(mode: str) -> dict:
    return {
        "decision_id": "pd-mode",
        "decision": "allow",
        "rls_enforcement_mode": mode,
        "effective_row_scope": {
            "version": "v1",
            "subject_principal_id": "user:alice",
            "entries": [
                {
                    "table": "dwd_comment_reports",
                    "column": "school_id",
                    "operator": "in",
                    "values": ["s_001"],
                    "policy_code": "m2_detail_read",
                }
            ],
        },
    }


def test_gateway_access_context_observe_mode_stays_v1_zero_gateway_impact():
    """observe：即便有 row_scope，也维持 v1、不下发 row_scope，网关零感知。"""
    context = build_gateway_access_context(
        policy_decision=_row_scope_decision("observe"),
        ticket_preview={"sql_hashes": ["hash-1"]},
    )

    assert context["schema"] == "GatewayAccessContext.v1"
    assert "row_scope" not in context


def test_gateway_access_context_deny_mode_promotes_to_v2():
    context = build_gateway_access_context(
        policy_decision=_row_scope_decision("deny"),
        ticket_preview={"sql_hashes": ["hash-1"]},
    )

    assert context["schema"] == "GatewayAccessContext.v2"
    assert context["row_scope"][0]["column"] == "school_id"
