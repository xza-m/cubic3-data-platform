from __future__ import annotations

from app.application.agent.runtime_preflight_service import SemanticRuntimePreflightService
from app.domain.ontology.entities import BusinessMetric, BusinessObject
from app.domain.semantic.entities import CubeDefinition, DimensionDef, MeasureDef


class _Repo:
    def __init__(self, items=None):
        self.items = {item.name: item for item in items or []}

    def list_all(self):
        return list(self.items.values())

    def get(self, name: str):
        return self.items.get(name)

    def save(self, entity):
        self.items[entity.name] = entity


def _student_comment_cube(*, status: str = "active") -> CubeDefinition:
    return CubeDefinition(
        name="student_comment_cube",
        title="学生评论",
        table="df_cb_258187.dwd_interaction_comment_reports_df",
        source_id=1,
        status=status,
        dimensions={
            "school_name": DimensionDef(title="学校", type="string", sql="{CUBE}.school_name"),
            "comment_created_at": DimensionDef(title="评论时间", type="time", sql="{CUBE}.comment_created_at"),
        },
        measures={
            "comment_count": MeasureDef(title="评论数", type="count", sql="{CUBE}.comment_id"),
        },
    )


def _service(
    *,
    object_status: str = "active",
    metric_status: str = "active",
    cube_status: str = "active",
    measure_refs: list[str] | None = None,
) -> SemanticRuntimePreflightService:
    return SemanticRuntimePreflightService(
        object_repository=_Repo(
            [
                BusinessObject(
                    name="StudentComment",
                    title="学生评论",
                    status=object_status,
                )
            ]
        ),
        metric_repository=_Repo(
            [
                BusinessMetric(
                    name="comment_count",
                    title="评论数",
                    object_name="StudentComment",
                    semantic_formula="学生评论记录数",
                    measure_refs=measure_refs or ["student_comment_cube.comment_count"],
                    status=metric_status,
                )
            ]
        ),
        cube_repository=_Repo([_student_comment_cube(status=cube_status)]),
    )


def test_runtime_preflight_passes_for_active_ontology_metric_and_cube_binding():
    service = _service()

    result = service.check(
        object_name="StudentComment",
        metric_name="comment_count",
        cube_name="student_comment_cube",
        expected_table="df_cb_258187.dwd_interaction_comment_reports_df",
    )

    assert result["status"] == "passed"
    assert result["issues"] == []
    assert result["assets"]["object"]["status"] == "active"
    assert result["assets"]["metric"]["measure_refs"] == ["student_comment_cube.comment_count"]
    assert result["assets"]["cube"]["table"] == "df_cb_258187.dwd_interaction_comment_reports_df"
    assert result["resolved_bindings"] == [
        {
            "metric_name": "comment_count",
            "measure_ref": "student_comment_cube.comment_count",
            "cube_name": "student_comment_cube",
            "measure_name": "comment_count",
            "binding_status": "linked",
        }
    ]


def test_runtime_preflight_fails_fast_for_inactive_assets():
    service = _service(object_status="draft", metric_status="draft", cube_status="draft")

    result = service.check(
        object_name="StudentComment",
        metric_name="comment_count",
        cube_name="student_comment_cube",
    )

    assert result["status"] == "failed"
    assert {issue["code"] for issue in result["issues"]} == {
        "object_not_active",
        "metric_not_active",
        "cube_not_active",
    }


def test_runtime_preflight_fails_for_stale_measure_ref():
    service = _service(measure_refs=["student_comment_cube.missing_count"])

    result = service.check(
        object_name="StudentComment",
        metric_name="comment_count",
        cube_name="student_comment_cube",
        measure_name="comment_count",
    )

    assert result["status"] == "failed"
    assert {issue["code"] for issue in result["issues"]} == {
        "metric_measure_ref_missing",
        "metric_measure_ref_stale",
    }
