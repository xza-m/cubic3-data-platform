from __future__ import annotations

from app.application.agent.handlers.agent_plan_handler import AgentPlanHandler
from app.application.governance.access import AccessPolicyDecisionService, PrincipalResolver


class _RouterStub:
    def plan(self, *, question, principal_context=None, viewer_roles=None, runtime_mode=None):
        assert runtime_mode == "official"
        return {
            "semantic_plan_id": "sp_test",
            "question": question,
            "runtime_mode": runtime_mode,
            "planning_mode": "single_step",
            "route": {"route_type": "cube", "matched": {"metric_name": "gmv"}},
            "steps": [{"step_key": "semantic_match"}],
            "execution_targets": [
                {"target_type": "sql", "metric_name": "gmv", "target_key": "metric:gmv:sql"}
            ],
            "traceability": {"question": question},
        }


class _CompilerStub:
    def compile_preview(
        self,
        *,
        target_type,
        metric_name=None,
        principal_context=None,
        viewer_roles=None,
        runtime_mode=None,
        **_,
    ):
        assert principal_context["principal_id"] == "user:finance"
        assert runtime_mode == "official"
        return {
            "status": "ready",
            "target_type": target_type,
            "logical_sql": "SELECT sum(amount) FROM dws_order_summary",
            "resource_set": ["dws_order_summary"],
            "sql_hash": "sha256:test",
            "data_level": "M1",
            "bindings": {"metric_name": metric_name},
        }


def test_agent_plan_handler_orchestrates_semantic_plan_and_ticket_preview():
    handler = AgentPlanHandler(
        principal_resolver=PrincipalResolver(),
        access_policy_service=AccessPolicyDecisionService(),
        router_service=_RouterStub(),
        compiler_service=_CompilerStub(),
    )

    result = handler.handle(
        question="查看 GMV",
        principal_context={"principal_id": "user:finance", "roles": ["finance"]},
        viewer_roles=None,
        authenticated_user=None,
    )

    assert result["semantic_plan_id"] == "sp_test"
    assert result["runtime_mode"] == "official"
    assert result["business_intent"]["route_type"] == "cube"
    assert result["route"]["route_type"] == "cube"
    assert result["compiled_targets"][0]["resource_set"] == ["dws_order_summary"]
    assert result["policy_decision"]["decision"] == "allow"
    assert result["ticket_preview"]["enforcement"] == "preview_only"
    assert result["ticket_preview"]["data_level"] == "M1"
    assert result["principal_context"]["principal_id"] == "user:finance"
    assert result["semantic_trace"]["semantic_plan_id"] == "sp_test"
