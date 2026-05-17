from __future__ import annotations

from app.application.governance.access import AccessPolicyDecisionService, PrincipalResolver, canonical_sql_hash
from app.extensions import db
from app.infrastructure.governance.models import AccessDataPolicyORM, AccessExecutionProfileORM
from app.infrastructure.governance.repositories import SqlAccessGovernanceRepository
from app.infrastructure.seed import seed_access_governance_defaults


def test_seed_access_governance_defaults_creates_idempotent_baseline(app, db_session):
    seed_access_governance_defaults()
    seed_access_governance_defaults()

    profiles = {
        row.profile_code: row
        for row in db_session.query(AccessExecutionProfileORM).order_by(AccessExecutionProfileORM.profile_code).all()
    }
    assert set(profiles) == {"mc_m0_reader", "mc_m1_reader", "mc_m2_detail_reader"}
    assert profiles["mc_m0_reader"].credential_mode == "gateway_binding"
    assert profiles["mc_m1_reader"].data_level == "M1"
    assert profiles["mc_m2_detail_reader"].requires_strong_audit is True
    assert db_session.query(AccessExecutionProfileORM).count() == 3

    policies = {
        row.policy_code: row
        for row in db_session.query(AccessDataPolicyORM).order_by(AccessDataPolicyORM.policy_code).all()
    }
    assert set(policies) == {"m0_public_read", "m1_aggregate_read", "m2_detail_read", "m3_raw_block"}
    assert policies["m0_public_read"].subject_roles == ["data_m0_reader"]
    assert policies["m0_public_read"].resource_scope["table_layers"] == ["dim", "ads"]
    assert policies["m1_aggregate_read"].subject_roles == ["data_m1_reader"]
    assert policies["m1_aggregate_read"].resource_scope["table_layers"] == ["dws"]
    assert policies["m2_detail_read"].execution_profile_code == "mc_m2_detail_reader"
    assert policies["m3_raw_block"].effect == "deny"
    assert policies["m3_raw_block"].execution_profile_code is None
    assert db_session.query(AccessDataPolicyORM).count() == 4


def test_seeded_datapolicy_baseline_allows_m1_and_m2_but_m3_is_hard_blocked(app, db_session):
    seed_access_governance_defaults()
    repository = SqlAccessGovernanceRepository(db_session)
    service = AccessPolicyDecisionService(policy_repository=repository)

    m1_principal = PrincipalResolver().resolve(
        principal_context={
            "principal_id": "feishu:tenant_a:on_m1_user",
            "roles": ["data_m1_reader"],
        },
        authenticated_user=None,
    )
    m1_sql = "SELECT count(*) FROM dw.dws_course_daily"
    m1_decision = service.post_compile(
        principal=m1_principal,
        compiled_targets=[
            {
                "target_type": "sql",
                "logical_sql": m1_sql,
                "sql_hash": canonical_sql_hash(m1_sql),
                "resource_set": {
                    "physical": [
                        {
                            "engine": "maxcompute",
                            "project": "dw",
                            "table": "dws_course_daily",
                            "data_level": "M1",
                        }
                    ],
                },
            }
        ],
    )
    assert m1_decision.decision == "allow"
    assert m1_decision.reason_code == "data_policy_allowed"
    assert m1_decision.execution_profile["profile_code"] == "mc_m1_reader"

    m2_principal = PrincipalResolver().resolve(
        principal_context={
            "principal_id": "feishu:tenant_a:on_m2_user",
            "roles": ["data_m2_detail_reader"],
        },
        authenticated_user=None,
    )
    m2_sql = "SELECT student_id FROM dw.dwd_student_answer_detail"
    m2_decision = service.post_compile(
        principal=m2_principal,
        compiled_targets=[
            {
                "target_type": "sql",
                "logical_sql": m2_sql,
                "sql_hash": canonical_sql_hash(m2_sql),
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
            }
        ],
    )
    assert m2_decision.decision == "allow"
    assert m2_decision.reason_code == "data_policy_allowed"
    assert m2_decision.execution_profile["profile_code"] == "mc_m2_detail_reader"
    assert m2_decision.execution_profile["requires_strong_audit"] is True

    m3_principal = PrincipalResolver().resolve(
        principal_context={
            "principal_id": "feishu:tenant_a:on_m3_user",
            "roles": ["governance_admin"],
        },
        authenticated_user=None,
    )
    m3_sql = "SELECT * FROM dw.ods_raw_events"
    m3_decision = service.post_compile(
        principal=m3_principal,
        compiled_targets=[
            {
                "target_type": "sql",
                "logical_sql": m3_sql,
                "sql_hash": canonical_sql_hash(m3_sql),
                "resource_set": {
                    "physical": [
                        {
                            "engine": "maxcompute",
                            "project": "dw",
                            "table": "ods_raw_events",
                            "data_level": "M3",
                        }
                    ],
                },
            }
        ],
    )
    assert m3_decision.decision == "deny"
    assert m3_decision.reason_code == "m3_governance_required"
    assert m3_decision.governance_required is True


def test_container_access_policy_service_uses_sql_datapolicy_repository(app):
    """主应用 DI 必须接入 SQL DataPolicy，不能退回 Phase 1 fallback allow。"""

    engine = app.container.db_engine()
    db.metadata.create_all(bind=engine)
    service = app.container.access_policy_service()
    principal = PrincipalResolver().resolve(
        principal_context={
            "principal_id": "feishu:tenant_a:on_no_data_role",
            "roles": ["semantic_viewer"],
        },
        authenticated_user=None,
    )

    decision = service.post_compile(
        principal=principal,
        compiled_targets=[
            {
                "target_type": "sql",
                "logical_sql": "SELECT student_id FROM dw.dwd_student_answer_detail",
                "sql_hash": canonical_sql_hash("SELECT student_id FROM dw.dwd_student_answer_detail"),
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
            }
        ],
    )

    assert decision.decision == "deny"
    assert decision.reason_code == "data_policy_not_matched"
