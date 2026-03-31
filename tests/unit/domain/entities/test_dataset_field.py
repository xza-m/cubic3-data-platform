"""
数据集字段实体测试
"""
from app.domain.entities.dataset_field import DatasetField
from app.shared.enums import FieldCategory, MaskRule, SensitivityLevel


class TestDatasetField:
    def test_sensitivity_partition_and_measure_flags(self):
        field = DatasetField(
            physical_name="mobile",
            data_type="string",
            sensitivity_level=SensitivityLevel.PII.value,
            business_type=FieldCategory.PARTITION.value,
        )

        assert field.is_sensitive() is True
        assert field.is_partition_key() is True
        assert field.is_measure() is False

        field.sensitivity_level = SensitivityLevel.PUBLIC.value
        field.business_type = FieldCategory.METRIC.value

        assert field.is_sensitive() is False
        assert field.is_partition_key() is False
        assert field.is_measure() is True

    def test_masked_select_expression_returns_raw_when_not_sensitive_or_no_rule(self):
        public_field = DatasetField(
            physical_name="user_name",
            data_type="string",
            sensitivity_level=SensitivityLevel.PUBLIC.value,
        )
        pii_without_rule = DatasetField(
            physical_name="mobile",
            data_type="string",
            sensitivity_level=SensitivityLevel.PII.value,
        )

        assert public_field.get_masked_select_expression() == "user_name"
        assert pii_without_rule.get_masked_select_expression() == "mobile"

    def test_masked_select_expression_supports_all_rules_and_fallback(self):
        cases = {
            MaskRule.MOBILE.value: "REGEXP_REPLACE(mobile, '(\\d{3})\\d{4}(\\d{4})', '$1****$2') AS mobile",
            MaskRule.EMAIL.value: "REGEXP_REPLACE(email, '(\\w{1,3})\\w+(@.*)', '$1***$2') AS email",
            MaskRule.ID_CARD.value: "REGEXP_REPLACE(id_card, '(\\d{6})\\d{8}(\\d{4})', '$1********$2') AS id_card",
            MaskRule.NAME.value: "CONCAT(SUBSTR(real_name, 1, 1), '**') AS real_name",
            MaskRule.AMOUNT.value: "CASE WHEN amount > 0 THEN '***' ELSE NULL END AS amount",
            MaskRule.FULL_MASK.value: "'***' AS secret_value",
            "unknown": "unknown_field AS unknown_field",
        }

        for rule, expected in cases.items():
            name = {
                MaskRule.MOBILE.value: "mobile",
                MaskRule.EMAIL.value: "email",
                MaskRule.ID_CARD.value: "id_card",
                MaskRule.NAME.value: "real_name",
                MaskRule.AMOUNT.value: "amount",
                MaskRule.FULL_MASK.value: "secret_value",
            }.get(rule, "unknown_field")
            field = DatasetField(
                physical_name=name,
                data_type="string",
                sensitivity_level=SensitivityLevel.CONFIDENTIAL.value,
                mask_rule=rule,
            )
            assert field.get_masked_select_expression() == expected

    def test_mark_as_sensitive_and_update_display_name(self):
        field = DatasetField(
            physical_name="mobile",
            data_type="string",
            sensitivity_level=SensitivityLevel.PUBLIC.value,
            display_name="手机号",
        )

        field.mark_as_sensitive(SensitivityLevel.SECRET.value, MaskRule.MOBILE.value)
        assert field.sensitivity_level == SensitivityLevel.SECRET.value
        assert field.mask_rule == MaskRule.MOBILE.value
        assert field.updated_at is not None

        original_rule = field.mask_rule
        field.mark_as_sensitive(SensitivityLevel.CONFIDENTIAL.value)
        assert field.sensitivity_level == SensitivityLevel.CONFIDENTIAL.value
        assert field.mask_rule == original_rule

        field.update_display_name("用户手机号")
        assert field.display_name == "用户手机号"

    def test_to_dict_and_repr(self):
        field = DatasetField(
            id=5,
            dataset_id=7,
            physical_name="mobile",
            data_type="string",
            is_nullable=False,
            default_value="",
            comment="手机号",
            display_name="用户手机号",
            business_type=FieldCategory.DIMENSION.value,
            sensitivity_level=SensitivityLevel.PII.value,
            mask_rule=MaskRule.MOBILE.value,
            field_tags={"pii": True},
            sample_values=["13800001111"],
            field_order=1,
        )

        payload = field.to_dict()

        assert payload["id"] == 5
        assert payload["dataset_id"] == 7
        assert payload["physical_name"] == "mobile"
        assert payload["is_sensitive"] is True
        assert payload["is_partition_key"] is False
        assert payload["field_tags"] == {"pii": True}
        assert payload["sample_values"] == ["13800001111"]
        assert repr(field) == "<DatasetField mobile (dimension)>"
