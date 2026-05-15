from __future__ import annotations

import time

from flask import Flask

from app.application.access.identity import AccessIdentityService
from app.application.agent.handlers.agent_plan_handler import AgentPlanHandler
from app.application.governance.access import (
    AccessPolicyDecisionService,
    PrincipalResolver,
    canonical_sql_hash,
)
from app.extensions import db
from app.infrastructure.access.repositories import SqlAccessRepository
from app.infrastructure.governance.repositories import SqlAccessGovernanceRepository
from app.interfaces.api.middleware.error_handler import register_error_handlers
from app.interfaces.api.v1.agent import create_agent_blueprint
from tests.conftest import install_default_admin_auth


def test_datapolicy_module_e2e_blocks_m3_and_persists_governance_decision(app, db_session):
    client = install_default_admin_auth(app.test_client(), roles=("governance_admin",))

    profile_resp = client.post(
        "/api/v1/governance/execution-profiles",
        json={
            "profile_code": "mc_m3_raw",
            "name": "MaxCompute M3 Raw 查询",
            "credential_mode": "gateway_binding",
            "data_level": "M3",
            "allowed_operations": ["query"],
            "max_rows": 500,
            "timeout_seconds": 30,
            "export_allowed": False,
            "requires_strong_audit": True,
        },
    )
    assert profile_resp.status_code == 201

    legacy_policy_resp = client.post(
        "/api/v1/governance/data-policies",
        json={
            "policy_code": "raw_m3_legacy_approval_e2e",
            "name": "Raw data 旧审批策略 E2E",
            "priority": 200,
            "subject_roles": ["data_m3_requester"],
            "resource_scope": {
                "data_levels": ["M3"],
                "table_layers": ["ods", "raw"],
            },
            "actions": ["query"],
            "effect": "require_approval",
            "execution_profile_code": "mc_m3_raw",
            "approval_policy_code": "approval_raw_once",
            "policy_version": "v-e2e",
        },
    )
    assert legacy_policy_resp.status_code == 400

    policy_resp = client.post(
        "/api/v1/governance/data-policies",
        json={
            "policy_code": "raw_m3_allow_e2e",
            "name": "Raw data 误配置允许策略 E2E",
            "priority": 200,
            "subject_roles": ["data_m3_requester"],
            "resource_scope": {
                "data_levels": ["M3"],
                "table_layers": ["ods", "raw"],
            },
            "actions": ["query"],
            "effect": "allow",
            "execution_profile_code": "mc_m3_raw",
            "policy_version": "v-e2e",
        },
    )
    assert policy_resp.status_code == 201
    policy_payload = policy_resp.get_json()["data"]
    assert policy_payload["subject_roles"] == ["data_m3_requester"]
    assert policy_payload["effect"] == "allow"
    assert "approval_policy_code" not in policy_payload
    assert "row_scope" not in policy_payload
    assert "column_scope" not in policy_payload

    list_resp = client.get("/api/v1/governance/data-policies?data_level=M3")
    assert list_resp.status_code == 200
    assert list_resp.get_json()["data"]["total"] == 1

    service = AccessPolicyDecisionService(
        policy_repository=SqlAccessGovernanceRepository(db_session),
    )
    principal = PrincipalResolver().resolve(
        principal_context={
            "principal_id": "feishu:tenant_a:on_m3_requester",
            "roles": ["data_m3_requester"],
        },
        authenticated_user=None,
    )
    decision = service.post_compile(
        principal=principal,
        compiled_targets=[
            {
                "target_type": "sql",
                "resource_set": {
                    "physical": [
                        {
                            "engine": "maxcompute",
                            "project": "dw",
                            "schema": "ods",
                            "table": "ods_raw_events",
                            "data_level": "M3",
                        }
                    ],
                },
                "logical_sql": "SELECT count(*) FROM dw.ods.ods_raw_events",
                "sql_hash": canonical_sql_hash("SELECT count(*) FROM dw.ods.ods_raw_events"),
            }
        ],
    )

    payload = decision.to_dict()
    assert payload["decision"] == "deny"
    assert payload["reason_code"] == "m3_governance_required"
    assert payload["governance_required"] is True
    assert payload["execution_permit"]["mode"] == "not_issued"
    assert "effective_row_scope" not in payload
    assert "effective_column_scope" not in payload

    decisions_resp = client.get(
        "/api/v1/governance/policy-decisions"
        "?principal_id=feishu:tenant_a:on_m3_requester"
    )
    assert decisions_resp.status_code == 200
    decisions_payload = decisions_resp.get_json()["data"]
    assert decisions_payload["total"] == 1
    assert decisions_payload["items"][0]["governance_required"] is True
    assert "row_scope" not in decisions_payload["items"][0]
    assert "column_scope" not in decisions_payload["items"][0]


class _RouterStub:
    def plan(self, *, question, principal_context=None, runtime_mode=None):
        assert runtime_mode == "official"
        return {
            "semantic_plan_id": "sp_access_datapolicy_e2e",
            "question": question,
            "runtime_mode": runtime_mode,
            "route": {"route_type": "cube"},
            "steps": [{"step_key": "semantic_match"}],
            "execution_targets": [
                {"target_type": "sql", "target_key": "metric:answer_detail"}
            ],
        }


class _CompilerStub:
    def compile_preview(self, *, target_type, principal_context=None, **_):
        assert principal_context["source"] == "feishu_delegation"
        logical_sql = "SELECT student_id FROM dw.dwd_student_answer_detail"
        return {
            "status": "ready",
            "target_type": target_type,
            "logical_sql": logical_sql,
            "resource_set": {
                "physical": [
                    {
                        "engine": "maxcompute",
                        "project": "dw",
                        "table": "dwd_student_answer_detail",
                        "data_level": "M2",
                    }
                ],
            },
            "sql_hash": canonical_sql_hash(logical_sql),
            "data_level": "M2",
        }


def _build_agent_access_app():
    flask_app = Flask(__name__)
    flask_app.config.update(
        TESTING=True,
        SQLALCHEMY_DATABASE_URI="sqlite:///:memory:",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
    )
    db.init_app(flask_app)
    handler = AgentPlanHandler(
        principal_resolver=PrincipalResolver(),
        access_policy_service=AccessPolicyDecisionService(
            policy_repository=SqlAccessGovernanceRepository(db.session),
        ),
        router_service=_RouterStub(),
        compiler_service=_CompilerStub(),
    )
    flask_app.register_blueprint(create_agent_blueprint(handler))
    register_error_handlers(flask_app)
    with flask_app.app_context():
        from app.infrastructure.access.models import (  # noqa: F401
            AccessApiKeyORM,
            AccessDelegationEventORM,
            AccessPrincipalAliasORM,
            AccessPrincipalORM,
            AccessRoleBindingORM,
            AccessServicePrincipalORM,
        )
        from app.infrastructure.governance.models import (  # noqa: F401
            AccessDataPolicyORM,
            AccessExecutionProfileORM,
            AccessPolicyDecisionORM,
        )

        db.create_all()
    return flask_app


def test_datapolicy_user_identity_e2e_api_key_delegation_drives_agent_decision():
    flask_app = _build_agent_access_app()
    with flask_app.app_context():
        access_repo = SqlAccessRepository(db.session)
        access_service = AccessIdentityService(access_repo)
        owner = access_service.upsert_feishu_principal(
            tenant_key="tenant_a",
            open_id="ou_owner",
            union_id="on_owner",
            display_name="负责人",
        )
        delegate = access_service.upsert_feishu_principal(
            tenant_key="tenant_a",
            open_id="ou_teacher",
            union_id="on_teacher",
            display_name="老师",
        )
        access_service.ensure_principal_role_bindings(
            principal_id=delegate.principal_id,
            roles=["data_m2_detail_reader"],
            source="pytest",
            created_by=owner.principal_id,
        )
        bot = access_service.create_service_principal(
            tenant_key="tenant_a",
            service_type="bot",
            code="feishu_dw_query",
            owner_principal_id=owner.principal_id,
            allowed_tenants=["tenant_a"],
            delegation_rules={"allow_feishu_user": True},
            created_by=owner.principal_id,
        )
        api_key = access_service.create_api_key(
            principal_id=bot.principal_id,
            scopes=["agent.semantic.plan", "delegation.feishu_user"],
            created_by=owner.principal_id,
        ).api_key
        governance_repo = SqlAccessGovernanceRepository(db.session)
        governance_repo.upsert_execution_profile(
            {
                "profile_code": "mc_m2_detail",
                "name": "MaxCompute M2 明细查询",
                "credential_mode": "gateway_binding",
                "data_level": "M2",
                "allowed_operations": ["query"],
                "max_rows": 2000,
                "timeout_seconds": 60,
                "export_allowed": False,
                "requires_strong_audit": True,
            },
            created_by=owner.principal_id,
        )
        governance_repo.upsert_data_policy(
            {
                "policy_code": "school_m2_detail_e2e",
                "name": "学校明细权限 E2E",
                "priority": 100,
                "subject_roles": ["data_m2_detail_reader"],
                "resource_scope": {
                    "data_levels": ["M2"],
                    "table_layers": ["dwd"],
                    "table_prefixes": ["dwd_student_"],
                },
                "actions": ["query"],
                "effect": "allow",
                "execution_profile_code": "mc_m2_detail",
                "policy_version": "v-e2e",
            },
            created_by=owner.principal_id,
        )

    client = flask_app.test_client()
    allowed_resp = client.post(
        "/api/v1/agent/semantic/plan",
        headers={"X-C3-Api-Key": api_key},
        json={
            "question": "查询学生答题明细",
            "roles": ["data_m3_requester"],
            "feishu_context": {
                "tenant_key": "tenant_a",
                "open_id": "ou_teacher",
                "union_id": "on_teacher",
                "message_id": "om_e2e_allowed",
                "chat_id": "oc_e2e",
                "event_id": "evt_e2e_allowed",
                "timestamp": int(time.time()),
                "nonce": "nonce_e2e_allowed",
            },
        },
    )
    assert allowed_resp.status_code == 200
    allowed_payload = allowed_resp.get_json()["data"]
    principal_context = allowed_payload["principal_context"]
    assert principal_context["actor_id"] == "svc:tenant_a:bot:feishu_dw_query"
    assert principal_context["principal_id"] == "feishu:tenant_a:on_teacher"
    assert principal_context["roles"] == ["data_m2_detail_reader"]
    assert "data_m3_requester" not in principal_context["roles"]
    assert allowed_payload["policy_decision"]["decision"] == "allow"
    assert allowed_payload["policy_decision"]["reason_code"] == "data_policy_allowed"
    assert allowed_payload["policy_decision"]["execution_profile"]["profile_code"] == "mc_m2_detail"

    denied_resp = client.post(
        "/api/v1/agent/semantic/plan",
        headers={"X-C3-Api-Key": api_key},
        json={
            "question": "查询学生答题明细",
            "viewer_roles": ["data_m2_detail_reader"],
            "feishu_context": {
                "tenant_key": "tenant_a",
                "open_id": "ou_viewer",
                "union_id": "on_viewer",
                "message_id": "om_e2e_denied",
                "chat_id": "oc_e2e",
                "event_id": "evt_e2e_denied",
                "timestamp": int(time.time()),
                "nonce": "nonce_e2e_denied",
            },
        },
    )
    assert denied_resp.status_code == 200
    denied_payload = denied_resp.get_json()["data"]
    assert denied_payload["principal_context"]["roles"] == []
    assert denied_payload["policy_decision"]["decision"] == "deny"
    assert denied_payload["policy_decision"]["reason_code"] == "data_policy_not_matched"

    with flask_app.app_context():
        decisions = SqlAccessGovernanceRepository(db.session).list_policy_decisions(
            policy_code="school_m2_detail_e2e",
        )
        assert len(decisions) == 1
        assert decisions[0]["principal_id"] == "feishu:tenant_a:on_teacher"
        assert decisions[0]["execution_profile_code"] == "mc_m2_detail"
