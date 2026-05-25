from app.application.semantic.field_candidates.classifier import (
    MeasureSemanticsInferer,
    SemanticFieldClassifier,
)
from app.application.semantic.field_candidates.types import PhysicalTypeMapper


def test_classifier_marks_percentile_and_rate_as_non_additive_measures():
    mapper = PhysicalTypeMapper()
    classifier = SemanticFieldClassifier(mapper=mapper)
    inferer = MeasureSemanticsInferer()

    p75 = classifier.classify_field({"name": "p75_difficulty", "type": "DECIMAL(10,4)", "comment": "P75难度"})
    rate = classifier.classify_field({"name": "completion_rate", "type": "DOUBLE", "comment": "完成率"})

    assert p75.selected_role == "measure.non_additive"
    assert p75.semantic_type == "number"
    assert p75.risk_level == "high"
    assert "non_additive_unconfirmed" in p75.issue_codes
    assert p75.measure_semantics.aggregation == "percentile"
    assert p75.measure_semantics.percentile == 75
    assert p75.to_dict()["measure_semantics"]["percentile"] == 75
    assert inferer.infer("p75_difficulty", "P75难度").aggregation == "percentile"

    assert rate.selected_role == "measure.non_additive"
    assert rate.measure_semantics.is_ratio is True
    assert "ratio_sum_risk" in rate.issue_codes


def test_measure_inferer_recognizes_percentile_in_comment_only():
    semantics = MeasureSemanticsInferer().infer("difficulty", "P75 难度")

    assert semantics.aggregation == "percentile"
    assert semantics.additivity == "non_additive"
    assert semantics.percentile == 75
    assert semantics.warnings


def test_measure_inferer_parses_percentile_variants():
    inferer = MeasureSemanticsInferer()

    assert inferer.infer("difficulty", "percentile 75").percentile == 75
    assert inferer.infer("difficulty", "75分位数").percentile == 75


def test_measure_inferer_recognizes_bare_ratio_names_and_comment_only_rate():
    inferer = MeasureSemanticsInferer()

    for field_name in ["rate", "ratio", "percent"]:
        semantics = inferer.infer(field_name, "")
        assert semantics.additivity == "non_additive"
        assert semantics.is_ratio is True

    comment_only = inferer.infer("completion", "完成率")
    assert comment_only.additivity == "non_additive"
    assert comment_only.is_ratio is True


def test_measure_inferer_marks_bare_max_min_as_non_additive():
    inferer = MeasureSemanticsInferer()

    assert inferer.infer("max", "").additivity == "non_additive"
    assert inferer.infer("max", "").aggregation == "max"
    assert inferer.infer("min", "").additivity == "non_additive"
    assert inferer.infer("min", "").aggregation == "min"


def test_classifier_keeps_numeric_ids_and_levels_as_dimensions():
    classifier = SemanticFieldClassifier()

    student_id = classifier.classify_field({"name": "student_id", "type": "BIGINT", "comment": "学生ID"})
    grade_level = classifier.classify_field({"name": "grade_level", "type": "INT", "comment": "年级等级"})

    assert student_id.selected_role == "dimension.identifier"
    assert student_id.semantic_type == "number"
    assert grade_level.selected_role == "dimension.numeric"
    assert grade_level.risk_level in {"low", "medium"}


def test_classifier_marks_unknown_types_as_blocking_unknown():
    classifier = SemanticFieldClassifier()

    candidate = classifier.classify_field({"name": "payload", "type": "BINARY", "comment": "原始载荷"})

    assert candidate.selected_role == "unknown"
    assert candidate.risk_level == "high"
    assert "field_type_unknown" in candidate.issue_codes


def test_classifier_marks_bare_numeric_dimension_names_as_numeric_dimensions():
    classifier = SemanticFieldClassifier()

    for field_name in ["level", "grade", "rank", "status", "type"]:
        candidate = classifier.classify_field({"name": field_name, "type": "INT", "comment": "数值枚举"})
        assert candidate.selected_role == "dimension.numeric"


def test_classifier_outputs_structured_role_and_issue_fields():
    classifier = SemanticFieldClassifier()

    candidate = classifier.classify_field({"name": "completion_rate", "type": "DOUBLE", "comment": "完成率"})
    payload = candidate.to_dict()

    assert payload["category"] == "measure"
    assert payload["role_candidates"][0]["role"] == "measure.non_additive"
    assert payload["role_candidates"][0]["category"] == "measure"
    assert payload["role_candidates"][0]["semantic_type"] == "number"
    assert payload["role_candidates"][0]["confidence"] > 0
    assert {issue["code"] for issue in payload["issues"]} >= {"non_additive_unconfirmed", "ratio_sum_risk"}
    assert payload["measure_semantics"]["is_ratio"] is True


def test_classifier_marks_boolean_and_tinyint_flags_as_boolean_dimensions():
    classifier = SemanticFieldClassifier()

    native = classifier.classify_field({"name": "active", "type": "BOOLEAN", "comment": "是否活跃"})
    tinyint_flag = classifier.classify_field({"name": "has_warning_flag", "type": "TINYINT", "comment": "是否告警"})

    assert native.selected_role == "dimension.boolean"
    assert native.semantic_type == "boolean"
    assert tinyint_flag.selected_role == "dimension.boolean"
    assert tinyint_flag.semantic_type == "boolean"


def test_classifier_exposes_technical_and_partition_candidates():
    classifier = SemanticFieldClassifier()

    create_time = classifier.classify_field({"name": "create_time", "type": "DATETIME", "comment": "创建时间"})
    is_deleted = classifier.classify_field({"name": "is_deleted", "type": "TINYINT", "comment": "逻辑删除"})
    partition_date = classifier.classify_field({"name": "partition_date", "type": "DATE", "comment": "分区日期"})

    assert create_time.selected_role.startswith("technical.")
    assert create_time.role_candidates[0].confidence < 0.9
    assert create_time.to_dict()["issues"][0]["code"] == "technical_field_review"
    assert is_deleted.selected_role.startswith("technical.")
    assert partition_date.selected_role == "technical.partition"
    assert "partition_field_detected" in partition_date.issue_codes


def test_classifier_marks_pt_dt_ds_as_partition_fields():
    classifier = SemanticFieldClassifier()

    for field_name in ["pt", "dt", "ds"]:
        candidate = classifier.classify_field({"name": field_name, "type": "STRING", "comment": "分区"})
        assert candidate.selected_role == "technical.partition"
        assert "partition_field_detected" in candidate.issue_codes


def test_classifier_recognizes_comment_only_percentile_and_rate_as_measures():
    classifier = SemanticFieldClassifier()

    percentile = classifier.classify_field(
        {"name": "difficulty", "type": "DECIMAL(10,4)", "comment": "percentile 75"}
    )
    rate = classifier.classify_field({"name": "completion", "type": "DOUBLE", "comment": "完成率"})

    assert percentile.selected_role == "measure.non_additive"
    assert percentile.measure_semantics.aggregation == "percentile"
    assert percentile.measure_semantics.percentile == 75
    assert rate.selected_role == "measure.non_additive"
    assert rate.measure_semantics.is_ratio is True
    assert "ratio_sum_risk" in rate.issue_codes


def test_classifier_recognizes_bare_measure_names_as_measures():
    classifier = SemanticFieldClassifier()

    for field_name in ["rate", "ratio", "percent"]:
        candidate = classifier.classify_field({"name": field_name, "type": "DOUBLE", "comment": ""})
        assert candidate.selected_role == "measure.non_additive"
        assert candidate.measure_semantics.is_ratio is True

    for field_name, aggregation in [("max", "max"), ("min", "min")]:
        candidate = classifier.classify_field({"name": field_name, "type": "DOUBLE", "comment": ""})
        assert candidate.selected_role == "measure.non_additive"
        assert candidate.measure_semantics.aggregation == aggregation


def test_classifier_defaults_plain_numeric_fields_to_additive_measures():
    classifier = SemanticFieldClassifier()

    sales = classifier.classify_field({"name": "sales", "type": "DOUBLE", "comment": ""})
    amount = classifier.classify_field({"name": "amount", "type": "DECIMAL(12,2)", "comment": ""})

    assert sales.selected_role == "measure.additive"
    assert sales.measure_semantics.aggregation == "sum"
    assert amount.selected_role == "measure.additive"
    assert amount.measure_semantics.aggregation == "sum"
