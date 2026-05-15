from __future__ import annotations

from types import SimpleNamespace

from app.domain.governance.entities import DataPolicy
from app.application.governance.access import (
    AccessPolicyDecisionService,
    PrincipalResolver,
    canonical_sql_hash,
    infer_data_level_for_resource,
)


def test_principal_resolver_ignores_request_roles_and_jwt_roles():
    resolver = PrincipalResolver()

    principal = resolver.resolve(
        principal_context={"principal_id": "feishu:ou_123", "roles": ["data_m2_detail_reader"]},
        viewer_roles=["finance", "school_ops"],
        authenticated_user={
            "user_id": "feishu:ou_123",
            "user_name": "数据运营",
            "roles": ["admin"],
        },
    )

    assert principal.principal_id == "feishu:ou_123"
    assert principal.roles == ["data_m2_detail_reader"]
    assert principal.platform_roles == []
    assert principal.data_roles == ["data_m2_detail_reader"]
    assert principal.source == "principal_context"

    authenticated_only = resolver.resolve(
        principal_context=None,
        viewer_roles=["data_m2_detail_reader"],
        authenticated_user={
            "user_id": "feishu:ou_123",
            "user_name": "数据运营",
            "roles": ["admin"],
        },
    )
    assert authenticated_only.roles == []
    assert authenticated_only.source == "authenticated_user"


def test_infer_data_level_uses_revised_layer_defaults():
    assert infer_data_level_for_resource("dw.dim_school") == "M0"
    assert infer_data_level_for_resource("dw.ads_course_overview") == "M0"
    assert infer_data_level_for_resource("dw.dws_course_daily") == "M1"
    assert infer_data_level_for_resource("dw.dwd_student_answer_detail") == "M2"


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


def test_allowed_repository_decision_exposes_access_context_preview_without_executable_ticket_or_credentials():
    class StubRepository:
        def __init__(self):
            self.saved = None

        def list_policy_domains(self, *, status="active"):
            return [
                DataPolicy(
                    policy_code="school_m2_detail",
                    name="学校明细权限",
                    subject_roles=["data_m2_detail_reader"],
                    resource_scope={"data_levels": ["M2"], "table_prefixes": ["dwd_student_"]},
                    actions=["query"],
                    effect="allow",
                    execution_profile_code="mc_m2_detail",
                    policy_version="v20260512",
                    policy_epoch=7,
                )
            ]

        def get_execution_profile(self, profile_code):
            assert profile_code == "mc_m2_detail"
            return SimpleNamespace(
                profile_code="mc_m2_detail",
                name="M2 受控明细执行画像",
                description=None,
                credential_mode="gateway_binding",
                credential_ref="acs:ram::should-not-leak",
                data_level="M2",
                allowed_operations=["query"],
                max_rows=2000,
                timeout_seconds=60,
                export_allowed=False,
                requires_strong_audit=True,
                status="active",
            )

        def save_policy_decision(self, data):
            self.saved = data
            return data

    sql = "SELECT student_id FROM dw.dwd_student_answer_detail"
    repository = StubRepository()
    decision = AccessPolicyDecisionService(policy_repository=repository).post_compile(
        principal=PrincipalResolver().resolve(
            principal_context={
                "principal_id": "feishu:tenant:on_teacher",
                "roles": ["data_m2_detail_reader"],
            },
            authenticated_user=None,
        ),
        compiled_targets=[
            {
                "target_type": "sql",
                "logical_sql": sql,
                "sql_hash": canonical_sql_hash(sql),
                "resource_set": {
                    "logical": {"domains": ["student"], "cubes": ["answer_detail"]},
                    "physical": [
                        {
                            "engine": "maxcompute",
                            "project": "dw",
                            "schema": "dwd",
                            "table": "dwd_student_answer_detail",
                            "data_level": "M2",
                        }
                    ],
                },
            }
        ],
    )

    payload = decision.to_dict()
    assert payload["decision"] == "allow"
    assert payload["policy_epoch"] == 7
    assert payload["execution_profile"]["profile_code"] == "mc_m2_detail"
    assert "credential_ref" not in payload["execution_profile"]

    permit = payload["execution_permit"]
    assert permit["mode"] == "policy_decision_preview"
    assert permit["enforcement"] == "control_plane_only"
    assert "gateway_contract" not in permit

    access_context = permit["access_context_preview"]
    assert access_context["schema"] == "GatewayAccessContextPreview.v1"
    assert access_context["principal_id"] == "feishu:tenant:on_teacher"
    assert access_context["execution_profile_code"] == "mc_m2_detail"
    assert access_context["policy_epoch"] == 7
    assert access_context["resource_set_physical"][0]["table"] == "dwd_student_answer_detail"
    assert "issued_at" not in access_context
    assert "expires_at" not in access_context
    assert "resource_set" not in access_context
    assert "roles" not in access_context
    assert "data_roles" not in access_context
    assert "credential_ref" not in access_context
    assert decision.ticket_preview["resource_set_physical"] == access_context["resource_set_physical"]
    assert "logical" not in decision.ticket_preview
    assert repository.saved["policy_epoch"] == 7
