from types import SimpleNamespace
from unittest.mock import MagicMock

from app.application.semantic.semantic_modeling_agent import SemanticModelingAgent


def _cube_draft():
    return {
        "name": "student_comments",
        "title": "学生评论",
        "description": "基于学生评论事实表自动生成的 Cube 草稿",
        "table": "dwd_student_comment_events",
        "source_id": 7,
        "source_database": "dw",
        "status": "draft",
        "grain": "comment_id",
        "entity_key": "comment_id",
        "partition": {"field": "ds", "type": "date", "format": "yyyyMMdd", "max_range_days": 90},
        "dimensions": {
            "comment_id": {"title": "评论ID", "type": "string", "sql": "`comment_id`", "primary_key": True},
            "student_id": {"title": "学生ID", "type": "string", "sql": "`student_id`", "primary_key": False},
            "comment_content": {"title": "评论内容", "type": "string", "sql": "`comment_content`", "primary_key": False},
            "audit_status": {"title": "审核状态", "type": "string", "sql": "`audit_status`", "primary_key": False},
            "comment_time": {"title": "评论时间", "type": "time", "sql": "`comment_time`", "primary_key": False},
        },
        "measures": {
            "total_count": {
                "title": "总数",
                "type": "count",
                "sql": "COUNT(`comment_id`)",
                "certified": True,
            }
        },
        "segments": {},
        "joins": {},
    }


def _builder(**overrides):
    source_service = overrides.get("source_service") or MagicMock()
    source_service.generate_cube_draft_from_source.return_value = _cube_draft()
    cube_modeling_service = overrides.get("cube_modeling_service") or MagicMock()
    cube_modeling_service.create_cube.return_value = SimpleNamespace(
        name="student_comments",
        model_dump=lambda mode="json": {**_cube_draft(), "name": "student_comments"},
    )
    cube_modeling_service.activate_cube.return_value = SimpleNamespace(
        name="student_comments",
        model_dump=lambda mode="json": {**_cube_draft(), "status": "active"},
    )
    ontology_service = overrides.get("ontology_service") or MagicMock()
    ontology_service.save_object.side_effect = lambda payload: payload
    ontology_service.save_metric.side_effect = lambda payload: payload
    ontology_service.save_glossary.side_effect = lambda payload: payload
    ontology_service.save_policy.side_effect = lambda payload: payload
    ontology_service.publish_entity.side_effect = lambda entity_type, entity_name, validation=None: {
        "entity_type": entity_type,
        "name": entity_name,
        "status": "active",
    }
    return SemanticModelingAgent(
        cube_modeling_source_service=source_service,
        cube_modeling_service=cube_modeling_service,
        ontology_service=ontology_service,
    )


def test_spec_draft_generates_minimal_student_comment_modeling_agent_spec():
    builder = _builder()

    result = builder.create_spec_draft(
        {
            "source_kind": "physical_table",
            "source_id": 7,
            "database": "dw",
            "table": "dwd_student_comment_events",
            "business_subject": "学生评论",
            "use_cases": ["评论数分析", "举报评论治理"],
            "default_roles": ["teacher_ops", "content_audit"],
            "sensitivity_level": "restricted",
        }
    )

    spec = result["spec"]
    assert spec["spec_version"] == "v1"
    assert spec["cube"]["name"] == "student_comments"
    assert spec["ontology"]["object"]["name"] == "student_comment"
    assert spec["ontology"]["metrics"][0]["measure_refs"] == ["student_comments.total_count"]
    assert spec["ontology"]["glossary"][0]["term"] == "学生评论"
    assert spec["ontology"]["policies"][0]["visibility"] == "restricted"
    assert "comment_content" in spec["governance"]["sensitive_fields"]
    assert result["next_actions"]["default_publish_target"] == "cube_only"


def test_apply_saves_cube_and_ontology_but_does_not_publish():
    ontology_service = MagicMock()
    ontology_service.save_object.side_effect = lambda payload: payload
    ontology_service.save_metric.side_effect = lambda payload: payload
    ontology_service.save_glossary.side_effect = lambda payload: payload
    ontology_service.save_policy.side_effect = lambda payload: payload
    cube_modeling_service = MagicMock()
    cube_modeling_service.create_cube.return_value = SimpleNamespace(
        name="student_comments",
        model_dump=lambda mode="json": _cube_draft(),
    )
    builder = _builder(ontology_service=ontology_service, cube_modeling_service=cube_modeling_service)
    spec = builder.create_spec_draft({"source_kind": "physical_table", "source_id": 7, "database": "dw", "table": "dwd_student_comment_events", "business_subject": "学生评论"})["spec"]

    result = builder.apply(spec)

    assert result["published"] is False
    cube_modeling_service.create_cube.assert_called_once()
    ontology_service.save_object.assert_called_once()
    ontology_service.save_metric.assert_called_once()
    ontology_service.save_glossary.assert_called_once()
    ontology_service.save_policy.assert_called_once()
    ontology_service.publish_entity.assert_not_called()


def test_validate_blocks_metric_when_measure_ref_is_missing():
    builder = _builder()
    spec = builder.create_spec_draft({"source_kind": "physical_table", "source_id": 7, "database": "dw", "table": "dwd_student_comment_events", "business_subject": "学生评论"})["spec"]
    spec["ontology"]["metrics"][0]["measure_refs"] = ["student_comments.missing_count"]

    result = builder.validate(spec)

    assert result["status"] == "blocked"
    assert any("无法解析 Measure 引用" in issue["message"] for issue in result["issues"])
    assert result["agent_sandbox_preview"]["mode"] == "draft_spec"
    assert result["agent_sandbox_preview"]["pollutes_official_route"] is False


def test_agent_ready_check_requires_active_cube_and_ontology_binding():
    builder = _builder()
    spec = builder.create_spec_draft(
        {
            "source_kind": "physical_table",
            "source_id": 7,
            "database": "dw",
            "table": "dwd_student_comment_events",
            "business_subject": "学生评论",
        }
    )["spec"]
    spec["cube"]["status"] = "active"
    spec["ontology"]["object"]["status"] = "active"
    spec["ontology"]["metrics"][0]["status"] = "active"
    spec["ontology"]["glossary"][0]["status"] = "active"
    spec["ontology"]["policies"][0]["status"] = "active"

    result = builder.agent_ready_check(spec)

    assert result["status"] == "ready"
    assert result["cube_status"] == "active"
    assert result["ontology_status"] == "active"
    assert result["checks"]["agent_sandbox"] == "ready"
    assert result["bindings"]["metrics"] == [
        {
            "business_metric": "student_comment_total_count",
            "measure_ref": "student_comments.total_count",
            "status": "linked",
        }
    ]


def test_agent_ready_check_downgrades_when_cube_or_ontology_is_draft():
    builder = _builder()
    spec = builder.create_spec_draft(
        {
            "source_kind": "physical_table",
            "source_id": 7,
            "database": "dw",
            "table": "dwd_student_comment_events",
            "business_subject": "学生评论",
        }
    )["spec"]

    result = builder.agent_ready_check(spec)

    assert result["status"] == "pending_validation"
    assert any(issue["code"] == "cube_not_active" for issue in result["issues"])
    assert any(issue["code"] == "ontology_not_active" for issue in result["issues"])


def test_publish_defaults_to_cube_only():
    cube_modeling_service = MagicMock()
    cube_modeling_service.activate_cube.return_value = SimpleNamespace(
        name="student_comments",
        model_dump=lambda mode="json": {**_cube_draft(), "status": "active"},
    )
    ontology_service = MagicMock()
    builder = _builder(cube_modeling_service=cube_modeling_service, ontology_service=ontology_service)
    spec = builder.create_spec_draft({"source_kind": "physical_table", "source_id": 7, "database": "dw", "table": "dwd_student_comment_events", "business_subject": "学生评论"})["spec"]

    result = builder.publish(spec)

    assert result["publish_targets"] == {"cube": True, "ontology": False}
    cube_modeling_service.activate_cube.assert_called_once_with("student_comments")
    ontology_service.publish_entity.assert_not_called()
