from __future__ import annotations

from app.domain.ontology.entities import GovernanceAuditTrace
from app.infrastructure.governance.repositories import SqlGovernanceAuditTraceRepository


def test_sql_audit_trace_repository_filters_by_principal_plan_and_hash(db_session):
    repo = SqlGovernanceAuditTraceRepository(db_session)
    repo.save(
        GovernanceAuditTrace(
            id="trace-1",
            target_type="metric",
            target_name="gmv",
            principal_id="feishu:ou_1",
            semantic_plan_id="sp_1",
            sql_hash="sha256:abc",
            viewer_roles=["finance"],
            route_type="cube",
            execution_target="sql",
            decision="require_approval",
            policy={"name": "raw_policy"},
            policy_decision={"decision": "require_approval"},
            traceability={"semantic_plan_id": "sp_1"},
            reason="M3/raw data 需要审批后才能生成真实执行凭证",
            timestamp="2026-05-01T12:00:00",
        )
    )

    items = repo.list_filtered(
        principal_id="feishu:ou_1",
        semantic_plan_id="sp_1",
        sql_hash="sha256:abc",
        decision="require_approval",
    )

    assert len(items) == 1
    assert items[0].id == "trace-1"
    assert items[0].policy_decision["decision"] == "require_approval"
