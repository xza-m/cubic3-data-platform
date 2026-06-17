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


def test_semantic_gateway_execute_fail_closed_on_effective_row_scope():
    """过渡硬规则：非空 effective_row_scope 在 gateway 注入就绪前一律拒绝。"""
    gateway = _GatewayClient()
    service = SemanticGatewayExecuteService(
        plan_handler=_PlanHandler(
            {
                "semantic_plan_id": "sp-rls",
                "compiled_targets": [{"target_type": "sql", "status": "ready", "logical_sql": "select 1"}],
                "policy_decision": {
                    "decision": "allow",
                    "effective_row_scope": {
                        "version": "v1",
                        "entries": [
                            {"table": "dwd_comment_reports", "column": "school_id", "operator": "in", "values": ["s_001"]}
                        ],
                    },
                },
            }
        ),
        gateway_client_factory=lambda: gateway,
    )

    result = service.execute(
        question="查看举报明细",
        principal_context={"principal_id": "user:alice"},
        viewer_roles=[],
        runtime_options={},
        idempotency_key=None,
    )

    assert result["status"] == "blocked"
    assert result["reason_code"] == "scope_injection_unsupported"
    assert gateway.calls == []


def test_semantic_gateway_execute_observe_mode_submits_without_block():
    """observe：effective_row_scope 为 advisory，不阻断提交（网关零感知）。"""
    gateway = _GatewayClient()
    service = SemanticGatewayExecuteService(
        plan_handler=_PlanHandler(
            {
                "semantic_plan_id": "sp-observe",
                "principal_context": {"principal_id": "user:alice"},
                "compiled_targets": [{"target_type": "sql", "status": "ready", "logical_sql": "select 1"}],
                "policy_decision": {
                    "decision_id": "pd-observe",
                    "decision": "allow",
                    "rls_enforcement_mode": "observe",
                    "execution_permit": {"access_context_preview": {"principal_id": "user:alice"}},
                    "effective_row_scope": {
                        "version": "v1",
                        "entries": [
                            {"table": "dwd_comment_reports", "column": "school_id", "operator": "in", "values": ["s_001"]}
                        ],
                    },
                },
            }
        ),
        gateway_client_factory=lambda: gateway,
    )

    result = service.execute(
        question="查看举报明细",
        principal_context={"principal_id": "user:alice"},
        viewer_roles=[],
        runtime_options={},
        idempotency_key=None,
    )

    assert result["status"] == "submitted"
    assert len(gateway.calls) == 1
    # observe 下网关 context 维持 v1，不下发 row_scope。
    assert gateway.calls[0]["access_context"]["schema"] == "GatewayAccessContext.v1"
    assert "row_scope" not in gateway.calls[0]["access_context"]


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
