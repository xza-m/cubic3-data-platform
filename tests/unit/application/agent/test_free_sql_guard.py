"""FreeSqlGuard 单元测试：resource_set 提取 + 同链裁决 + fail closed。"""
from __future__ import annotations

from unittest.mock import MagicMock

from app.application.agent.services.free_sql_guard import FreeSqlGuard
from app.application.governance.access import AccessPolicyDecisionService


def _guard(policy_service=None):
    return FreeSqlGuard(policy_service=policy_service or AccessPolicyDecisionService())


def test_unparseable_sql_fails_closed():
    guard = _guard()
    result = guard.adjudicate(sql="SELECT * FROM (((", agent_context=None)

    assert result["decision"] == "deny"
    assert result["reason_code"] == "sql_unparseable"


def test_constant_query_without_from_is_allowed():
    guard = _guard()
    result = guard.adjudicate(sql="SELECT 1 + 1", agent_context=None)

    assert result["decision"] == "allow"
    assert result["resource_tables"] == []


def test_resource_set_and_sql_hash_enter_decision_chain():
    policy_service = MagicMock()
    decision = MagicMock()
    decision.decision = "allow"
    decision.reason = "ok"
    decision.reason_code = "data_policy_allowed"
    decision.effective_data_level = "M1"
    decision.required_roles = []
    policy_service.post_compile.return_value = decision
    guard = FreeSqlGuard(policy_service=policy_service)

    result = guard.adjudicate(
        sql="SELECT ds, COUNT(*) FROM dws_orders JOIN dim_users ON 1=1 GROUP BY ds",
        agent_context=MagicMock(channel="datachat", user_id="internal:local:admin"),
    )

    assert result["decision"] == "allow"
    assert result["resource_tables"] == ["dws_orders", "dim_users"]
    assert result["sql_hash"].startswith("sha256:")
    compiled_targets = policy_service.post_compile.call_args.kwargs["compiled_targets"]
    physical = compiled_targets[0]["resource_set"]["physical"]
    assert {item["resource"] for item in physical} == {"dws_orders", "dim_users"}
    assert compiled_targets[0]["sql_hash"] == result["sql_hash"]


def test_m3_table_denied_by_same_chain():
    """ods/raw 表经同链裁决：与语义路径一致地拒绝 M3 直查。"""
    guard = _guard()
    result = guard.adjudicate(
        sql="SELECT * FROM ods_raw_events",
        agent_context=MagicMock(channel="datachat", user_id="internal:local:admin"),
    )

    assert result["decision"] in {"deny", "require_approval"}
    assert result["data_level"] == "M3"


def test_deny_result_carries_required_roles():
    policy_service = MagicMock()
    decision = MagicMock()
    decision.decision = "deny"
    decision.reason = "未命中可用数据访问权限或访问规则"
    decision.reason_code = "data_policy_not_matched"
    decision.effective_data_level = "M2"
    decision.required_roles = ["data_m2_detail_reader"]
    policy_service.post_compile.return_value = decision
    guard = FreeSqlGuard(policy_service=policy_service)

    result = guard.adjudicate(
        sql="SELECT * FROM dwd_orders",
        agent_context=MagicMock(channel="datachat", user_id="someone"),
    )

    assert result["decision"] == "deny"
    assert result["required_roles"] == ["data_m2_detail_reader"]
