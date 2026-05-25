from app.application.semantic.field_candidates.types import (
    PhysicalTypeMapper,
    TypeCompatibilityPolicy,
)


def test_parse_numeric_physical_types_with_precision_and_aliases():
    mapper = PhysicalTypeMapper()

    decimal_type = mapper.parse("DECIMAL(10,4)")
    assert decimal_type.normalized_type == "decimal"
    assert decimal_type.family == "number"
    assert decimal_type.precision == 10
    assert decimal_type.scale == 4

    assert mapper.parse("DOUBLE PRECISION").normalized_type == "double"
    assert mapper.parse("NUMERIC(20,6)").family == "number"
    assert mapper.parse("FLOAT(24)").family == "number"
    assert mapper.parse("INT64").normalized_type == "bigint"


def test_type_compatibility_policy_does_not_treat_number_as_role():
    policy = TypeCompatibilityPolicy()

    assert policy.is_compatible("DECIMAL(10,4)", "number") is True
    assert policy.is_compatible("DOUBLE PRECISION", "number") is True
    assert policy.is_compatible("VARCHAR(32)", "number") is False
    assert policy.semantic_primitive("DECIMAL(10,4)") == "number"
    assert policy.semantic_primitive("VARCHAR(32)") == "string"
    assert policy.semantic_primitive("JSON") == "json"


def test_boolean_compatibility_only_allows_boolean_and_tinyint():
    policy = TypeCompatibilityPolicy()

    assert policy.is_compatible("BOOLEAN", "boolean") is True
    assert policy.is_compatible("BOOL", "boolean") is True
    assert policy.is_compatible("TINYINT", "boolean") is True
    assert policy.is_compatible("BIGINT", "boolean") is False
    assert policy.is_compatible("DECIMAL(10,4)", "boolean") is False
