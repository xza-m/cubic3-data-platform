"""
FieldIdentifier 单元测试
"""
import pytest

from app.domain.services.field_identifier import FieldIdentifier


class TestFieldIdentifier:
    """FieldIdentifier 测试"""

    def test_identify_field_partition_from_schema(self):
        """测试分区字段 - 从表结构直接获取"""
        field_info = {
            'name': 'custom_field',
            'type': 'string',
            'comment': '',
            'is_partition': True
        }
        result = FieldIdentifier.identify_field(field_info)
        assert result['business_type'] == 'partition'
        assert result['is_partition'] is True
        assert result['is_measure'] is False
        assert result['confidence_score'] == 1.0
        assert '从表结构直接获取' in result['matched_rules']

    def test_identify_field_partition_from_name_keyword(self):
        """测试分区字段 - 字段名包含分区关键词"""
        field_info = {'name': 'ds', 'type': 'string', 'comment': ''}
        result = FieldIdentifier.identify_field(field_info)
        assert result['business_type'] == 'partition'
        assert result['is_partition'] is True
        assert result['confidence_score'] == 0.8
        assert any('分区关键词' in r for r in result['matched_rules'])

    def test_identify_field_dimension_default(self):
        """测试维度字段 - 默认类型"""
        field_info = {'name': 'user_name', 'type': 'varchar', 'comment': '用户名称'}
        result = FieldIdentifier.identify_field(field_info)
        assert result['business_type'] == 'dimension'
        assert result['is_partition'] is False
        assert result['is_measure'] is False
        assert result['display_name'] == '用户名称'

    def test_identify_field_measure_by_suffix(self):
        """测试度量字段 - 后缀匹配"""
        field_info = {'name': 'order_amount', 'type': 'decimal', 'comment': ''}
        result = FieldIdentifier.identify_field(field_info)
        assert result['business_type'] == 'metric'
        assert result['is_measure'] is True
        assert result['confidence_score'] == 0.9
        assert any('后缀匹配' in r for r in result['matched_rules'])

    def test_identify_field_measure_by_keyword(self):
        """测试度量字段 - 关键词匹配（不含后缀，如 total_orders）"""
        field_info = {'name': 'total_orders', 'type': 'bigint', 'comment': ''}
        result = FieldIdentifier.identify_field(field_info)
        assert result['business_type'] == 'metric'
        assert result['is_measure'] is True
        assert result['confidence_score'] == 0.7

    def test_identify_field_dimension_id_excluded_from_measure(self):
        """测试主外键字段不识别为度量"""
        field_info = {'name': 'user_id', 'type': 'bigint', 'comment': '用户ID'}
        result = FieldIdentifier.identify_field(field_info)
        assert result['business_type'] == 'dimension'
        assert result['is_measure'] is False

    def test_identify_field_sensitive_pii_mobile(self):
        """测试敏感字段 - PII 手机号"""
        field_info = {'name': 'mobile_phone', 'type': 'string', 'comment': ''}
        result = FieldIdentifier.identify_field(field_info)
        assert result['is_sensitive'] is True
        assert result['sensitivity_level'] == 'pii'
        assert result['mask_rule'] == 'mobile'

    def test_identify_field_sensitive_pii_id_card(self):
        """测试敏感字段 - PII 身份证"""
        field_info = {'name': 'id_card_no', 'type': 'string', 'comment': ''}
        result = FieldIdentifier.identify_field(field_info)
        assert result['is_sensitive'] is True
        assert result['sensitivity_level'] == 'pii'
        assert result['mask_rule'] == 'id_card'

    def test_identify_field_sensitive_pii_email(self):
        """测试敏感字段 - PII 邮箱"""
        field_info = {'name': 'user_email', 'type': 'string', 'comment': ''}
        result = FieldIdentifier.identify_field(field_info)
        assert result['is_sensitive'] is True
        assert result['mask_rule'] == 'email'

    def test_identify_field_sensitive_pii_student_name(self):
        """B5：K12 学生姓名应判 PII（mask=name）。"""
        result = FieldIdentifier.identify_field({'name': 'student_name', 'type': 'varchar', 'comment': '学生姓名'})
        assert result['is_sensitive'] is True
        assert result['sensitivity_level'] == 'pii'
        assert result['mask_rule'] == 'name'

    def test_identify_field_sensitive_pii_student_id(self):
        """B5：学号 student_id 应判 PII（学生唯一标识）。"""
        result = FieldIdentifier.identify_field({'name': 'student_id', 'type': 'bigint', 'comment': '学号'})
        assert result['is_sensitive'] is True
        assert result['sensitivity_level'] == 'pii'

    def test_identify_field_student_business_dims_not_pii(self):
        """B5 收口：K12「学生*」业务维度（学生年级/学生人数/学生科目）非 PII，不得被裸「学生」误标。

        真 PII 零损失——学生姓名走「姓名」、student_name 走 name 正则、学号/学籍有专用词。
        """
        # 业务维度——非 PII
        for name, comment in [('stu_grade', '学生年级'), ('stu_cnt', '学生人数'), ('stu_subject', '学生科目')]:
            result = FieldIdentifier.identify_field({'name': name, 'type': 'string', 'comment': comment})
            assert result['is_sensitive'] is False, f'{comment} 不应被误标 PII'
            assert result['sensitivity_level'] == 'public', comment
        # 真 PII——仍命中
        assert FieldIdentifier.identify_field({'name': 'sname', 'type': 'string', 'comment': '学生姓名'})['sensitivity_level'] == 'pii'
        assert FieldIdentifier.identify_field({'name': 'xh', 'type': 'string', 'comment': '学号'})['sensitivity_level'] == 'pii'

    def test_identify_field_sensitive_pii_xuehao_chinese(self):
        """B5：中文学号字段应判 PII。"""
        result = FieldIdentifier.identify_field({'name': 'xh', 'type': 'string', 'comment': '学号'})
        assert result['is_sensitive'] is True
        assert result['sensitivity_level'] == 'pii'

    def test_identify_field_pii_name_word_boundary_real_and_user(self):
        """B5：real_name / user_name 仍判 PII（mask=name）。"""
        for name in ('real_name', 'user_name', 'full_name'):
            result = FieldIdentifier.identify_field({'name': name, 'type': 'varchar', 'comment': ''})
            assert result['is_sensitive'] is True, name
            assert result['sensitivity_level'] == 'pii', name
            assert result['mask_rule'] == 'name', name

    def test_identify_field_name_word_boundary_excludes_non_person_entities(self):
        """B5 守边界：school_name / class_name / product_name / file_name 不得误判为 PII。"""
        for name in ('school_name', 'class_name', 'product_name', 'file_name', 'table_name'):
            result = FieldIdentifier.identify_field({'name': name, 'type': 'varchar', 'comment': ''})
            assert result['is_sensitive'] is False, name
            assert result['sensitivity_level'] == 'public', name

    def test_identify_field_sensitive_confidential(self):
        """测试敏感字段 - 机密"""
        field_info = {'name': 'api_secret', 'type': 'string', 'comment': ''}
        result = FieldIdentifier.identify_field(field_info)
        assert result['is_sensitive'] is True
        assert result['sensitivity_level'] == 'confidential'
        assert result['mask_rule'] == 'full_mask'

    def test_identify_field_sensitive_internal(self):
        """测试敏感字段 - 内部"""
        field_info = {'name': 'salary_amount', 'type': 'decimal', 'comment': ''}
        result = FieldIdentifier.identify_field(field_info)
        assert result['is_sensitive'] is True
        assert result['sensitivity_level'] == 'internal'
        assert result['mask_rule'] == 'amount'

    def test_identify_field_empty_comment_uses_name_as_display(self):
        """测试无注释时使用字段名作为显示名"""
        field_info = {'name': 'order_id', 'type': 'bigint', 'comment': ''}
        result = FieldIdentifier.identify_field(field_info)
        assert result['display_name'] == 'order_id'

    def test_identify_field_missing_keys_defaults(self):
        """测试缺少字段时的默认值"""
        field_info = {}
        result = FieldIdentifier.identify_field(field_info)
        assert result['field_name'] is None
        assert result['data_type'] is None
        assert result['business_type'] == 'dimension'
        assert result['sensitivity_level'] == 'public'

    def test_identify_fields_batch_empty(self):
        """测试批量识别 - 空列表"""
        result = FieldIdentifier.identify_fields_batch([])
        assert result == []

    def test_identify_fields_batch_multiple(self):
        """测试批量识别 - 多个字段"""
        fields = [
            {'name': 'ds', 'type': 'string', 'comment': ''},
            {'name': 'order_amt', 'type': 'decimal', 'comment': ''},
            {'name': 'user_name', 'type': 'varchar', 'comment': ''},
        ]
        result = FieldIdentifier.identify_fields_batch(fields)
        assert len(result) == 3
        assert result[0]['business_type'] == 'partition'
        assert result[1]['business_type'] == 'metric'
        assert result[2]['business_type'] == 'dimension'

    def test_get_statistics_empty(self):
        """测试统计 - 空列表"""
        result = FieldIdentifier.get_statistics([])
        assert result['total_fields'] == 0
        assert result['partition_fields'] == 0
        assert result['measure_fields'] == 0
        assert result['dimension_fields'] == 0
        assert result['sensitive_fields'] == 0
        assert result['avg_confidence'] == 0

    def test_get_statistics_with_fields(self):
        """测试统计 - 各类字段"""
        identified = [
            {'business_type': 'partition', 'is_sensitive': False, 'confidence_score': 1.0},
            {'business_type': 'metric', 'is_sensitive': False, 'confidence_score': 0.9},
            {'business_type': 'metric', 'is_sensitive': False, 'confidence_score': 0.7},
            {'business_type': 'dimension', 'is_sensitive': True, 'sensitivity_level': 'pii', 'confidence_score': 0.9},
        ]
        result = FieldIdentifier.get_statistics(identified)
        assert result['total_fields'] == 4
        assert result['partition_fields'] == 1
        assert result['measure_fields'] == 2
        assert result['dimension_fields'] == 1
        assert result['sensitive_fields'] == 1
        assert result['sensitivity_breakdown'] == {'pii': 1}
        assert result['avg_confidence'] == pytest.approx(0.875)
