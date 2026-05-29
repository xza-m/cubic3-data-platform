from __future__ import annotations

import pytest

from app.application.agent.semantic_gateway_execute_service import SemanticGatewayExecuteService


class _PlanHandler:
    def __init__(self, plan):
        self.plan = plan
        self.calls = []

    def handle(self, **kwargs):
        self.calls.append(kwargs)
        return self.plan


class _GatewayClient:
    def __init__(self):
        self.calls = []

    def execute_sql(self, **kwargs):
        self.calls.append(kwargs)
        return {"query_id": "qry-1", "status": "QUEUED"}


def test_semantic_gateway_execute_submits_allowed_plan_to_gateway():
    gateway = _GatewayClient()
    plan_handler = _PlanHandler(
        {
            "semantic_plan_id": "sp-1",
            "principal_context": {"principal_id": "principal-1"},
            "compiled_targets": [{"target_type": "sql", "status": "ready", "logical_sql": "select 1"}],
            "policy_decision": {
                "decision_id": "pd-1",
                "decision": "allow",
                "execution_permit": {"access_context_preview": {"principal_id": "principal-1"}},
            },
            "semantic_trace": {"semantic_plan_id": "sp-1"},
        }
    )
    service = SemanticGatewayExecuteService(
        plan_handler=plan_handler,
        gateway_client_factory=lambda: gateway,
    )

    result = service.execute(
        question="查看 GMV",
        principal_context={"principal_id": "principal-1"},
        viewer_roles=["data_m1_reader"],
        runtime_options={},
        idempotency_key="idem-1",
    )

    assert result["status"] == "submitted"
    assert result["gateway_query_id"] == "qry-1"
    assert gateway.calls[0]["sql"] == "select 1"
    assert gateway.calls[0]["idempotency_key"] == "idem-1"
    assert gateway.calls[0]["access_context"]["policy_decision_id"] == "pd-1"


def test_semantic_gateway_execute_blocks_denied_plan_without_gateway_call():
    gateway = _GatewayClient()
    service = SemanticGatewayExecuteService(
        plan_handler=_PlanHandler({"policy_decision": {"decision": "deny", "reason_code": "no_policy"}}),
        gateway_client_factory=lambda: gateway,
    )

    result = service.execute(
        question="查看明细订单",
        principal_context={"principal_id": "principal-1"},
        viewer_roles=[],
        runtime_options={},
        idempotency_key=None,
    )

    assert result["status"] == "blocked"
    assert result["decision"] == "deny"
    assert gateway.calls == []


def test_semantic_gateway_execute_blocks_missing_sql_target():
    service = SemanticGatewayExecuteService(
        plan_handler=_PlanHandler({"policy_decision": {"decision": "allow"}, "compiled_targets": []}),
        gateway_client_factory=lambda: _GatewayClient(),
    )

    result = service.execute(
        question="查看 GMV",
        principal_context={"principal_id": "principal-1"},
        viewer_roles=[],
        runtime_options={},
        idempotency_key=None,
    )

    assert result["status"] == "blocked"
    assert "SQL 编译目标" in result["reason"]


def test_semantic_gateway_execute_raises_when_gateway_response_lacks_query_id():
    class GatewayWithoutId:
        def execute_sql(self, **_kwargs):
            return {"status": "QUEUED"}

    service = SemanticGatewayExecuteService(
        plan_handler=_PlanHandler(
            {
                "policy_decision": {"decision": "allow"},
                "compiled_targets": [{"target_type": "sql", "status": "ready", "logical_sql": "select 1"}],
            }
        ),
        gateway_client_factory=lambda: GatewayWithoutId(),
    )

    with pytest.raises(RuntimeError):
        service.execute(
            question="查看 GMV",
            principal_context={"principal_id": "principal-1"},
            viewer_roles=[],
            runtime_options={},
            idempotency_key=None,
        )
