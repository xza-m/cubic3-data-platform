import pytest

from app.application.semantic.copilot_publish_service import CopilotPublishService


def _reason(message: str):
    # _publish_failure_reason 是纯字符串匹配、不读 self 状态，直接以未绑定方式调用即可，
    # 不需要搭建完整的 CopilotServiceBase 依赖链。
    return CopilotPublishService._publish_failure_reason(None, ValueError(message))


@pytest.mark.parametrize(
    "message,expected_id",
    [
        ("Approved spec changed before apply", "approved_spec_changed_before_apply"),
        ("Applied assets drift from approved semantic_diff", "approved_semantic_diff_drift"),
        ("Proposal validation blocked before approved", "proposal_validation_blocked"),
    ],
)
def test_publish_failure_reason_keeps_existing_patterns(message, expected_id):
    assert _reason(message)["id"] == expected_id


@pytest.mark.parametrize(
    "message,expected_id",
    [
        ("数据源不存在: 7", "yaml_datasource_unresolved"),
        ("Cube 未绑定 source_id，无法解析真实数据源", "yaml_datasource_unresolved"),
        ("不支持的 Cube 状态: archived", "yaml_cube_precondition_failed"),
        ("Cube 必须绑定 source_id", "yaml_cube_precondition_failed"),
        ("认证指标发布失败：以下 Measure 尚未关联 BusinessMetric: total_count", "yaml_certified_measure_unlinked"),
        ("未找到 Cube: student_comments", "yaml_cube_missing"),
    ],
)
def test_publish_failure_reason_recognizes_builder_exceptions(message, expected_id):
    """P0 修复后 builder.apply/publish 真正被调用，之前 SQL-registry 路径从未触发过的
    ApplicationException 现在可能真实发生；这些消息必须被归类，而不是落进 publish_failed 通用兜底。"""
    assert _reason(message)["id"] == expected_id


def test_publish_failure_reason_falls_back_for_unrecognized_message():
    reason = _reason("some totally unrelated database error")
    assert reason["id"] == "publish_failed"
