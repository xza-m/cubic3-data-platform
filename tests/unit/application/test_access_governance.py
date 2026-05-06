from __future__ import annotations

from app.application.governance.access import (
    AccessPolicyDecisionService,
    PrincipalResolver,
    canonical_sql_hash,
)


def test_principal_resolver_maps_viewer_roles_to_principal_context():
    resolver = PrincipalResolver()

    principal = resolver.resolve(
        principal_context=None,
        viewer_roles=["finance", "school_ops"],
        authenticated_user={
            "user_id": "feishu:ou_123",
            "user_name": "数据运营",
            "roles": ["admin"],
        },
    )

    assert principal.principal_id == "feishu:ou_123"
    assert principal.display_name == "数据运营"
    assert principal.roles == ["admin", "finance", "school_ops"]
    assert principal.source == "viewer_roles_compat"


def test_post_compile_policy_requires_approval_for_m3_raw_resource():
    resolver = PrincipalResolver()
    principal = resolver.resolve(
        principal_context={"principal_id": "user:ops", "roles": ["school_ops"]},
        viewer_roles=None,
        authenticated_user=None,
    )
    service = AccessPolicyDecisionService()

    decision = service.post_compile(
        principal=principal,
        compiled_targets=[
            {
                "target_type": "sql",
                "resource_set": ["ods_raw_events"],
                "logical_sql": "SELECT count(*) FROM ods_raw_events",
                "sql_hash": canonical_sql_hash("SELECT count(*) FROM ods_raw_events"),
                "data_level": "M3",
            }
        ],
    )

    assert decision.decision == "require_approval"
    assert decision.effective_data_level == "M3"
    assert decision.execution_profile["data_level"] == "M3"
    assert decision.ticket_preview["type"] == "ticket_preview"
    assert decision.ticket_preview["enforcement"] == "preview_only"
    assert decision.ticket_preview["approval_required"] is True


def test_post_compile_policy_returns_agent_friendly_decision_and_structured_resource_set():
    principal = PrincipalResolver().resolve(
        principal_context={
            "principal_id": "feishu:tenant:ou_finance",
            "roles": ["data_m1_reader"],
            "actor_type": "agent_skill",
            "actor_id": "dw-query",
        },
        viewer_roles=None,
        authenticated_user=None,
    )
    service = AccessPolicyDecisionService()

    decision = service.post_compile(
        principal=principal,
        compiled_targets=[
            {
                "target_type": "sql",
                "resource_set": ["dw_prod.dws_order_summary"],
                "logical_sql": "SELECT sum(amount) FROM dw_prod.dws_order_summary",
                "sql_hash": canonical_sql_hash("SELECT sum(amount) FROM dw_prod.dws_order_summary"),
                "data_level": "M1",
                "execution_request": {"source_id": 7},
                "traceability": {"data_source": {"source_database": "dw_prod"}},
            }
        ],
    )

    payload = decision.to_dict()
    assert payload["effect"] == "allow"
    assert payload["reason_code"] == "phase1_preview_allowed"
    assert payload["message"]
    assert payload["requires_approval"] is False
    assert payload["approval_available"] is False
    assert payload["suggestions"] == []
    assert payload["safe_alternatives"] == []
    assert payload["resource_set"]["physical"][0]["data_source_id"] == "7"
    assert payload["resource_set"]["physical"][0]["project"] == "dw_prod"
    assert payload["resource_set"]["physical"][0]["table"] == "dws_order_summary"
    assert decision.ticket_preview["resource_set"] == payload["resource_set"]


def test_post_compile_policy_infers_level_from_structured_resource_set():
    principal = PrincipalResolver().resolve(
        principal_context={"principal_id": "user:ops", "roles": ["data_m3_requester"]},
        viewer_roles=None,
        authenticated_user=None,
    )
    service = AccessPolicyDecisionService()

    decision = service.post_compile(
        principal=principal,
        compiled_targets=[
            {
                "target_type": "sql",
                "resource_set": {
                    "logical": {"cubes": ["raw_orders"], "metrics": ["raw_order_count"]},
                    "physical": [
                        {
                            "data_source_id": "1",
                            "engine": "maxcompute",
                            "project": "dw",
                            "schema": "ods",
                            "table": "raw_orders",
                            "data_level": "M3",
                        }
                    ],
                },
                "logical_sql": "SELECT count(*) FROM ods.raw_orders",
                "sql_hash": canonical_sql_hash("SELECT count(*) FROM ods.raw_orders"),
            }
        ],
    )

    assert decision.decision == "require_approval"
    assert decision.effective_data_level == "M3"


def test_post_compile_policy_denies_platform_admin_without_data_role():
    principal = PrincipalResolver().resolve(
        principal_context={"principal_id": "user:admin", "roles": ["platform_admin"]},
        viewer_roles=None,
        authenticated_user=None,
    )
    service = AccessPolicyDecisionService()

    decision = service.post_compile(
        principal=principal,
        compiled_targets=[
            {
                "target_type": "sql",
                "resource_set": ["dws_order_summary"],
                "logical_sql": "SELECT count(*) FROM dws_order_summary",
                "sql_hash": canonical_sql_hash("SELECT count(*) FROM dws_order_summary"),
                "data_level": "M1",
            }
        ],
    )

    payload = decision.to_dict()
    assert payload["effect"] == "deny"
    assert payload["reason_code"] == "platform_admin_without_data_role"
    assert payload["required_roles"] == ["data_m1_reader"]
    assert payload["safe_alternatives"][0]["type"] == "request_data_role"


def test_m3_policy_decision_contains_approval_guidance():
    principal = PrincipalResolver().resolve(
        principal_context={"principal_id": "user:ops", "roles": ["data_m3_requester"]},
        viewer_roles=None,
        authenticated_user=None,
    )
    service = AccessPolicyDecisionService()

    decision = service.post_compile(
        principal=principal,
        compiled_targets=[
            {
                "target_type": "sql",
                "resource_set": ["ods_raw_events"],
                "logical_sql": "SELECT * FROM ods_raw_events",
                "sql_hash": canonical_sql_hash("SELECT * FROM ods_raw_events"),
                "data_level": "M3",
            }
        ],
    )

    payload = decision.to_dict()
    assert payload["effect"] == "require_approval"
    assert payload["reason_code"] == "m3_raw_requires_approval"
    assert payload["requires_approval"] is True
    assert payload["approval_available"] is True
    assert payload["required_roles"] == ["data_m3_requester"]
    assert payload["suggestions"][0]["action"] == "approval.request"
    assert payload["safe_alternatives"][0]["target_data_level"] == "M1"
    assert decision.ticket_preview["m3_one_time_required"] is True


def test_canonical_sql_hash_ignores_comments_case_and_extra_spaces():
    left = canonical_sql_hash(
        """
        -- comment
        select   count(*)  from   ods_raw_events
        where ds = '20260501'
        """
    )
    right = canonical_sql_hash("SELECT count(*) FROM ods_raw_events WHERE ds = '20260501'")

    assert left == right
