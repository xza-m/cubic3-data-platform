from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.application.semantic.cube_modeling_source_service import CubeModelingSourceService
from app.application.semantic.semantic_modeling_agent import SemanticModelingAgent
from app.shared.exceptions import ApplicationException


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
    ontology_service.save_relation.side_effect = lambda payload: payload
    ontology_service.save_action.side_effect = lambda payload: payload
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


def _source_service(cube_modeling_service=None):
    return CubeModelingSourceService(
        cube_modeling_service=cube_modeling_service or MagicMock(),
        dataset_repository=MagicMock(),
        datasource_repository=MagicMock(),
    )


def test_coerce_business_question_uses_qualified_candidate_table():
    """Copilot proposal 常见 source_kind=business_question + candidate_table=project.table。"""
    source_service = MagicMock()
    source_service.generate_cube_draft_from_source.return_value = _cube_draft()
    source_service.resolve_default_physical_source_id.return_value = 99
    builder = _builder(source_service=source_service)

    result = builder.create_spec_draft(
        {
            "source_kind": "business_question",
            "candidate_table": "df_cb_258187.dwd_interaction_comment_reports_df",
            "business_subject": "学生评论",
        }
    )

    source_service.generate_cube_draft_from_source.assert_called_once()
    kw = source_service.generate_cube_draft_from_source.call_args.kwargs
    assert kw["source_kind"] == "physical_table"
    assert kw["database"] == "df_cb_258187"
    assert kw["table"] == "dwd_interaction_comment_reports_df"
    assert kw["source_id"] == 99
    assert result["spec"]["source"]["source_kind"] == "physical_table"
    assert result["spec"]["source"]["database"] == "df_cb_258187"
    assert result["spec"]["source"]["table"] == "dwd_interaction_comment_reports_df"


def test_coerce_business_question_keeps_explicit_source_id():
    source_service = MagicMock()
    source_service.generate_cube_draft_from_source.return_value = _cube_draft()
    source_service.resolve_default_physical_source_id = MagicMock(return_value=1)
    builder = _builder(source_service=source_service)

    builder.create_spec_draft(
        {
            "source_kind": "business_question",
            "candidate_table": "dw.dwd_student_comment_events",
            "source_id": 7,
            "business_subject": "学生评论",
        }
    )
    kw = source_service.generate_cube_draft_from_source.call_args.kwargs
    assert kw["source_id"] == 7
    source_service.resolve_default_physical_source_id.assert_not_called()


def test_modeling_agent_uses_asset_evidence_schema_before_live_adapter():
    source_service = MagicMock()
    source_service.generate_cube_draft_from_asset_evidence.return_value = _cube_draft()
    builder = _builder(source_service=source_service)
    evidence_bundle = {
        "runtime_truth": False,
        "schema_snapshot": {
            "columns": [
                {"name": "school_id", "type": "BIGINT", "comment": "学校ID"},
                {"name": "comment_id", "type": "STRING", "comment": "评论ID"},
            ]
        },
    }

    result = builder.create_spec_draft(
        {
            "source_kind": "physical_table",
            "source_id": "maxcompute-prod",
            "database": "df_cb_258187",
            "schema": "dw",
            "table": "dwd_interaction_comment_reports_df",
            "business_subject": "学生评论",
            "evidence_bundle": evidence_bundle,
        }
    )

    source_service.generate_cube_draft_from_asset_evidence.assert_called_once()
    source_service.generate_cube_draft_from_source.assert_not_called()
    assert result["spec"]["source"]["evidence_bundle"] == evidence_bundle
    assert result["spec"]["source"]["evidence_bundle"] is not evidence_bundle
    evidence_bundle["schema_snapshot"]["columns"][0]["name"] = "polluted"
    assert result["spec"]["source"]["evidence_bundle"]["schema_snapshot"]["columns"][0]["name"] == "school_id"


def test_asset_evidence_source_id_requires_valid_numeric_id():
    cube_modeling_service = MagicMock()
    service = _source_service(cube_modeling_service)

    with pytest.raises(ApplicationException, match="source_id 必须映射到有效数据源 ID"):
        service.generate_cube_draft_from_asset_evidence(
            source_id="maxcompute-prod",
            database="df_cb_258187",
            schema="dw",
            table="dwd_interaction_comment_reports_df",
            evidence_bundle={"schema_snapshot": {"columns": [{"name": "school_id", "type": "BIGINT"}]}},
        )

    cube_modeling_service.build_cube_draft_payload.assert_not_called()


def test_asset_evidence_source_id_accepts_numeric_string_and_copies_evidence():
    cube_modeling_service = MagicMock()
    cube_modeling_service.build_cube_draft_payload.return_value = {"name": "comment_cube"}
    service = _source_service(cube_modeling_service)
    evidence_bundle = {
        "schema_snapshot": {
            "columns": [{"name": "school_id", "type": "BIGINT", "comment": "学校ID"}],
        }
    }

    result = service.generate_cube_draft_from_asset_evidence(
        source_id="7",
        database="df_cb_258187",
        schema="dw",
        table="dwd_interaction_comment_reports_df",
        evidence_bundle=evidence_bundle,
    )

    kw = cube_modeling_service.build_cube_draft_payload.call_args.kwargs
    assert kw["source_id"] == 7
    assert kw["data_source"] == "metadata_snapshot"
    assert result["asset_evidence"] == evidence_bundle
    assert result["asset_evidence"] is not evidence_bundle
    evidence_bundle["schema_snapshot"]["columns"][0]["name"] = "polluted"
    assert result["asset_evidence"]["schema_snapshot"]["columns"][0]["name"] == "school_id"


def test_asset_evidence_normalizes_fields_and_partition_flags():
    cube_modeling_service = MagicMock()
    cube_modeling_service.build_cube_draft_payload.return_value = {"name": "comment_cube"}
    service = _source_service(cube_modeling_service)

    service.generate_cube_draft_from_asset_evidence(
        source_id=7,
        database="df_cb_258187",
        schema="dw",
        table="dwd_interaction_comment_reports_df",
        evidence_bundle={
            "schema_snapshot": {
                "fields": [
                    {"field_name": "school_id", "data_type": "BIGINT", "display_name": "学校ID"},
                    {"field_name": "ds", "data_type": "STRING", "is_partition": True},
                ]
            }
        },
    )

    kw = cube_modeling_service.build_cube_draft_payload.call_args.kwargs
    assert kw["columns"] == [
        {"name": "school_id", "type": "BIGINT", "comment": "学校ID"},
        {"name": "ds", "type": "STRING", "comment": ""},
    ]
    assert kw["partitions"] == ["ds"]


def test_asset_evidence_requires_schema_columns_or_fields():
    service = _source_service()

    with pytest.raises(ApplicationException, match="缺少 columns 或 fields"):
        service.generate_cube_draft_from_asset_evidence(
            source_id=7,
            database="df_cb_258187",
            schema="dw",
            table="dwd_interaction_comment_reports_df",
            evidence_bundle={"schema_snapshot": {"columns": []}},
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
    assert spec["ontology"]["metrics"][0]["binding_status"] == "approved"
    assert spec["ontology"]["metrics"][0]["grain"] == "comment_time,comment_id"
    assert spec["ontology"]["metrics"][0]["time_dimension"] == "comment_time"
    assert spec["ontology"]["metrics"][0]["additivity"] == "additive"
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


def test_apply_and_publish_include_relations_and_actions():
    ontology_service = MagicMock()
    for method_name in (
        "save_object",
        "save_metric",
        "save_glossary",
        "save_policy",
        "save_relation",
        "save_action",
    ):
        getattr(ontology_service, method_name).side_effect = lambda payload: payload
    ontology_service.publish_entity.side_effect = lambda entity_type, entity_name, validation=None: {
        "entity_type": entity_type,
        "name": entity_name,
        "status": "active",
    }
    cube_modeling_service = MagicMock()
    cube_modeling_service.create_cube.return_value = SimpleNamespace(
        name="student_comments",
        model_dump=lambda mode="json": _cube_draft(),
    )
    cube_modeling_service.activate_cube.return_value = SimpleNamespace(
        name="student_comments",
        model_dump=lambda mode="json": {**_cube_draft(), "status": "active"},
    )
    builder = _builder(ontology_service=ontology_service, cube_modeling_service=cube_modeling_service)
    spec = builder.create_spec_draft(
        {
            "source_kind": "physical_table",
            "source_id": 7,
            "database": "dw",
            "table": "dwd_student_comment_events",
            "business_subject": "学生评论",
        }
    )["spec"]
    spec["ontology"]["object"]["status"] = "active"
    for key in ("metrics", "glossary", "policies"):
        for item in spec["ontology"][key]:
            item["status"] = "active"
    spec["ontology"]["relations"] = [
        {
            "name": "student_comment_commenter",
            "title": "评论由学生发布",
            "source_object_name": "student_comment",
            "target_object_name": "student",
            "relation_type": "belongs_to",
            "status": "active",
        }
    ]
    spec["ontology"]["actions"] = [
        {
            "name": "student_comment_reported",
            "title": "评论被举报",
            "object_name": "student_comment",
            "event_cube_refs": ["student_comments"],
            "status": "active",
        }
    ]

    apply_result = builder.apply(spec)
    publish_result = builder.publish(spec, publish_targets={"cube": True, "ontology": True})

    assert apply_result["assets"]["ontology"]["relations"][0]["name"] == "student_comment_commenter"
    assert apply_result["assets"]["ontology"]["actions"][0]["name"] == "student_comment_reported"
    ontology_service.save_relation.assert_called_once()
    ontology_service.save_action.assert_called_once()
    published_types = [call.args[0] for call in ontology_service.publish_entity.call_args_list]
    assert "relations" in published_types
    assert "actions" in published_types
    assert publish_result["published"]["ontology"]["relations"][0]["name"] == "student_comment_commenter"
    assert publish_result["published"]["ontology"]["actions"][0]["name"] == "student_comment_reported"


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
