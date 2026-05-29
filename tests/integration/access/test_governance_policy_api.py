from __future__ import annotations

from app.application.access.identity import AccessIdentityService
from app.infrastructure.access.repositories import SqlAccessRepository
from tests.conftest import _make_jwt, install_default_admin_auth


def test_governance_policy_profile_and_decision_api(app, db_session):
    access_service = AccessIdentityService(SqlAccessRepository(db_session))
    principal = access_service.upsert_feishu_principal(
        tenant_key="tenant_a",
        open_id="ou_policy_user",
        union_id="on_policy_user",
        display_name="策略管理员",
    )
    client = install_default_admin_auth(app.test_client(), roles=("governance_admin",))

    created_profile = client.post(
        "/api/v1/governance/execution-profiles",
        json={
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
    )
    assert created_profile.status_code == 201
    created_profile_payload = created_profile.get_json()["data"]
    assert created_profile_payload["profile_code"] == "mc_m2_detail"
    assert "credential_ref" not in created_profile_payload

    rejected_profile = client.post(
        "/api/v1/governance/execution-profiles",
        json={
            "profile_code": "mc_m2_raw_credential",
            "name": "误填 RAM 凭据",
            "credential_mode": "ram_role",
            "credential_ref": "acs:ram::123:role/c3-m2-detail",
        },
    )
    assert rejected_profile.status_code == 400
    assert "gateway CredentialBinding" in rejected_profile.get_json()["message"]

    rejected_internal_profile = client.post(
        "/api/v1/governance/execution-profiles",
        json={
            "profile_code": "mc_m2_internal",
            "name": "误选平台内置执行",
            "credential_mode": "internal_query_execution",
        },
    )
    assert rejected_internal_profile.status_code == 400
    assert "平台内置执行模式已下线" in rejected_internal_profile.get_json()["message"]

    created_policy = client.post(
        "/api/v1/governance/data-policies",
        json={
            "policy_code": "school_m2_detail",
            "name": "学校明细权限",
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
            "policy_version": "v20260506",
        },
    )
    assert created_policy.status_code == 201
    created_policy_payload = created_policy.get_json()["data"]
    assert created_policy_payload["policy_code"] == "school_m2_detail"
    assert created_policy_payload["subject_roles"] == ["data_m2_detail_reader"]
    assert created_policy_payload["resource_scope"]["data_levels"] == ["M2"]
    assert created_policy_payload["effect"] == "allow"
    assert isinstance(created_policy_payload["policy_epoch"], int)
    assert created_policy_payload["policy_epoch"] >= 1

    list_policies = client.get("/api/v1/governance/data-policies?data_level=M2")
    assert list_policies.status_code == 200
    assert list_policies.get_json()["data"]["total"] == 1

    from app.infrastructure.governance.repositories import SqlAccessGovernanceRepository

    repo = SqlAccessGovernanceRepository(db_session)
    saved_decision = repo.save_policy_decision(
        {
            "principal_id": principal.principal_id,
            "actor_id": principal.principal_id,
            "decision": "allow",
            "reason_code": "data_policy_allowed",
            "data_level": "M2",
            "resource_set": {"physical": [{"table": "dwd_student_answer_detail"}]},
            "sql_hashes": ["sha256:abc"],
            "matched_policies": [{"policy_code": "school_m2_detail", "effect": "allow"}],
            "execution_profile_code": "mc_m2_detail",
            "policy_version": "v20260506",
            "policy_epoch": created_policy_payload["policy_epoch"],
            "decision_type": "preview",
        }
    )

    list_decisions = client.get(f"/api/v1/governance/policy-decisions?principal_id={principal.principal_id}")
    assert list_decisions.status_code == 200
    payload = list_decisions.get_json()["data"]
    assert payload["total"] == 1
    assert payload["items"][0]["decision_id"] == saved_decision["decision_id"]
    assert payload["items"][0]["execution_profile_code"] == "mc_m2_detail"
    assert payload["items"][0]["policy_epoch"] == created_policy_payload["policy_epoch"]


def test_governance_audit_traces_require_governance_read_role(app):
    token = _make_jwt(
        user_id="jwt_only_viewer",
        user_name="JWT Only Viewer",
        roles=["user"],
    )

    resp = app.test_client().get(
        "/api/v1/governance/audit-traces",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 403
