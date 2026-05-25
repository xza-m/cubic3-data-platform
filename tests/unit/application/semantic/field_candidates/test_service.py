from types import SimpleNamespace

from app.application.semantic.field_candidates import FieldCandidateService


def test_preview_from_columns_returns_stable_id_summary_and_serializable_fields():
    service = FieldCandidateService()
    source = {"database": "dw", "schema": "public", "table": "student_stats", "source_ref": "manual:student_stats"}
    columns = [
        {"name": "school_id", "type": "BIGINT", "comment": "学校ID"},
        {"name": "p75_difficulty", "type": "DECIMAL(10,4)", "comment": "P75难度"},
        {"name": "dt", "type": "STRING", "comment": "分区日期", "is_partition": True},
    ]

    first = service.preview_from_columns(source, columns)
    second = service.preview_from_columns(source, columns)

    assert first.candidate_set_id == second.candidate_set_id
    assert first.summary["dimensions"] == 1
    assert first.summary["measures"] == 1
    assert first.summary["technical_fields"] == 1
    assert first.summary["warnings"] >= 2
    assert first.summary["high_risk"] == 1
    assert first.trace["override_scope"] == "session"
    assert first.source["source_kind"] == "unknown"

    by_field = {field.field: field for field in first.fields}
    assert by_field["school_id"].selected_role == "dimension.identifier"
    assert by_field["p75_difficulty"].selected_role == "measure.non_additive"
    assert by_field["dt"].selected_role == "technical.partition"
    assert by_field["school_id"].source["source_ref"] == "manual:student_stats"

    payload = first.to_dict()
    assert payload["candidate_set_id"].startswith("fcand_")
    assert payload["fields"][0]["field"] == "school_id"
    assert payload["fields"][1]["measure_semantics"]["percentile"] == 75


def test_preview_from_evidence_bundle_reads_fields_and_marks_rate_as_non_additive_measure():
    service = FieldCandidateService()
    bundle = {
        "schema_snapshot": {
            "snapshot_id": "snapshot_001",
            "fields": [
                {"field_name": "completion_rate", "data_type": "DOUBLE", "description": "完成率"},
                {"physical_name": "class_name", "field_type": "STRING", "display_name": "班级名称"},
            ],
        }
    }

    result = service.preview_from_evidence_bundle(
        "asset_001",
        "dw",
        "public",
        "lesson_progress",
        bundle,
    )

    by_field = {field.field: field for field in result.fields}
    rate = by_field["completion_rate"]
    assert result.source["source_kind"] == "asset_evidence"
    assert result.source["source_ref"] == "asset_001:dw.public.lesson_progress"
    assert result.source["evidence_snapshot_id"] == "snapshot_001"
    assert rate.selected_role == "measure.non_additive"
    assert rate.measure_semantics.additivity == "non_additive"
    assert rate.source["evidence_snapshot_id"] == "snapshot_001"
    assert by_field["class_name"].selected_role == "dimension.categorical"


def test_preview_from_evidence_bundle_accepts_object_columns():
    service = FieldCandidateService()
    bundle = SimpleNamespace(
        schema_snapshot=SimpleNamespace(
            snapshot_id="snapshot_obj",
            columns=[
                SimpleNamespace(name="dt", type="STRING", comment="分区日期", is_partition=True),
                SimpleNamespace(
                    field_name="completion_rate",
                    data_type="DOUBLE",
                    display_name="完成率",
                    partition=False,
                ),
            ],
        )
    )

    result = service.preview_from_evidence_bundle(
        "asset_obj",
        "dw",
        "public",
        "lesson_progress",
        bundle,
    )

    by_field = {field.field: field for field in result.fields}
    assert by_field["dt"].selected_role == "technical.partition"
    assert by_field["dt"].source["evidence_snapshot_id"] == "snapshot_obj"
    assert by_field["completion_rate"].selected_role == "measure.non_additive"


def test_selected_overrides_change_candidate_set_id_and_columns_key_is_supported():
    service = FieldCandidateService()
    source = {"source_kind": "manual", "source_ref": "manual:compat"}
    columns = [
        {"field_name": "completion_rate", "data_type": "DOUBLE", "description": "完成率"},
    ]

    base = service.preview_from_columns(source, columns)
    overridden = service.preview_from_columns(
        source,
        columns,
        selected_overrides={"completion_rate": {"selected_role": "dimension.numeric"}},
    )

    assert base.candidate_set_id != overridden.candidate_set_id
    assert base.fields[0].field == "completion_rate"
    assert overridden.fields[0].source["selected_override"] == {"selected_role": "dimension.numeric"}
