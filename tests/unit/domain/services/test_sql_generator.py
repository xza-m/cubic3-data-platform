"""
SQL生成服务测试
"""
import pytest
from unittest.mock import MagicMock
from app.domain.services.sql_generator import SQLGeneratorService
from app.domain.entities.dataset import Dataset
from app.domain.entities.dataset_field import DatasetField


def _mock_dataset(table: str = "db.orders", fields=None) -> Dataset:
    """构建用于测试的 Dataset mock（fields 模拟 SQLAlchemy relationship，支持 .all()）"""
    ds = MagicMock(spec=Dataset)
    ds.physical_table = table
    ds.dataset_code = "test_dataset"

    if fields is None:
        fields = [
            _mock_field("id", "BIGINT"),
            _mock_field("name", "STRING"),
            _mock_field("amount", "DOUBLE"),
        ]
    # dataset.fields 是 relationship，使用 .all() 获取列表
    mock_query = MagicMock()
    mock_query.all.return_value = fields
    ds.fields = mock_query
    return ds


def _mock_field(name: str, dtype: str = "STRING", mask_rule=None) -> DatasetField:
    f = MagicMock(spec=DatasetField)
    f.physical_name = name
    f.data_type = dtype
    f.mask_rule = mask_rule
    f.sensitivity_level = "public"
    return f


class TestSQLGeneratorService:
    """SQL生成服务测试"""

    @pytest.fixture
    def sql_generator(self):
        return SQLGeneratorService()

    def test_generate_simple_select(self, sql_generator):
        """测试生成简单 SELECT 语句"""
        dataset = _mock_dataset(fields=[_mock_field("id"), _mock_field("name"), _mock_field("email")])

        sql = sql_generator.generate_sql(
            dataset=dataset,
            select_fields=["id", "name", "email"],
            filter_conditions={},
            limit=10,
            apply_masking=False,
        )

        assert "SELECT" in sql
        assert "id" in sql
        assert "name" in sql
        assert "email" in sql
        assert "db.orders" in sql

    def test_generate_select_with_where(self, sql_generator):
        """测试生成带 WHERE 条件的 SELECT"""
        dataset = _mock_dataset(fields=[_mock_field("id"), _mock_field("amount")])

        sql = sql_generator.generate_sql(
            dataset=dataset,
            select_fields=["id", "amount"],
            filter_conditions={
                "logic": "AND",
                "filters": [{"field": "amount", "operator": ">", "value": 0}],
            },
            limit=100,
            apply_masking=False,
        )

        assert "WHERE" in sql
        assert "amount" in sql

    def test_generate_select_with_limit(self, sql_generator):
        """测试生成带 LIMIT 的 SELECT"""
        dataset = _mock_dataset(fields=[_mock_field("id"), _mock_field("name")])

        sql = sql_generator.generate_sql(
            dataset=dataset,
            select_fields=["id", "name"],
            filter_conditions={},
            limit=100,
            apply_masking=False,
        )

        assert "LIMIT" in sql

    def test_validate_sql_injection(self, sql_generator):
        """测试 SQL 注入防护"""
        dangerous_input = "users; DROP TABLE users--"

        with pytest.raises(Exception):
            sql_generator.validate_identifier(dangerous_input)
