from app.application.semantic.governance_issue_service import SemanticGovernanceIssueService
from app.application.semantic.schema_sync_service import DriftItem, SyncReport


def test_governance_issue_service_normalizes_schema_drift_report():
    report = SyncReport(
        total_cubes=1,
        checked_cubes=1,
        drifts=[
            DriftItem(
                cube="orders",
                table="dw.orders",
                kind="missing_in_physical",
                column="status",
                detail="Dimension status references missing column",
                severity="error",
            ),
            DriftItem(
                cube="orders",
                table="dw.orders",
                kind="missing_in_cube",
                column="new_col",
                detail="Physical column new_col not referenced",
            ),
        ],
    )

    payload = SemanticGovernanceIssueService().build_payload(schema_report=report)

    assert payload["summary"] == {
        "issue_count": 2,
        "error_count": 1,
        "warn_count": 1,
        "status": "error",
        "by_code": {
            "physical_schema_missing_column": 1,
            "physical_schema_new_column": 1,
        },
        "by_source": {"schema_sync": 2},
    }
    first = payload["items"][0]
    assert first["code"] == "physical_schema_missing_column"
    assert first["object_type"] == "cube"
    assert first["object_name"] == "orders"
    assert first["resource_ref"] == "dw.orders.status"


def test_governance_issue_service_merges_mapper_stale_check_items():
    mapper_payload = {
        "items": [
            {
                "entity_type": "metric",
                "entity_name": "student_comment_count",
                "status": "stale",
                "reason": "存在无法解析的 Measure 引用",
                "missing_refs": ["student_comment_cube.comment_count"],
            },
            {
                "entity_type": "relation",
                "entity_name": "student_school",
                "status": "stale",
                "reason": "未找到可投影的 Join Path",
            },
            {
                "entity_type": "action",
                "entity_name": "submit_comment",
                "status": "stale",
                "reason": "存在无法解析的 Event Cube 引用",
                "missing_refs": ["comment_event_cube"],
            },
        ]
    }

    payload = SemanticGovernanceIssueService().build_payload(
        mapper_stale_payload=mapper_payload
    )

    assert payload["summary"]["issue_count"] == 3
    assert payload["summary"]["status"] == "warn"
    assert {item["code"] for item in payload["items"]} == {
        "ontology_measure_ref_stale",
        "ontology_relation_projection_stale",
        "ontology_action_event_cube_stale",
    }
    assert payload["items"][0]["source"] == "semantic_mapper"
    assert payload["items"][0]["metadata"]["missing_refs"] == [
        "student_comment_cube.comment_count"
    ]
