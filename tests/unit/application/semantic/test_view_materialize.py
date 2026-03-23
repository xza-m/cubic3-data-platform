"""View 逻辑发布服务的辅助方法单测。"""
import pytest
from unittest.mock import MagicMock, patch


from app.application.semantic.view_publish_service import (
    ViewPublishService,
    _semantic_type_to_data_type,
)


# ============================================================================
# _semantic_type_to_data_type
# ============================================================================

class TestSemanticTypeToDataType:
    def test_known_types(self):
        assert _semantic_type_to_data_type("string") == "STRING"
        assert _semantic_type_to_data_type("number") == "BIGINT"
        assert _semantic_type_to_data_type("time") == "STRING"
        assert _semantic_type_to_data_type("boolean") == "BOOLEAN"

    def test_unknown_type_defaults_to_string(self):
        assert _semantic_type_to_data_type("unknown_xyz") == "STRING"
        assert _semantic_type_to_data_type("") == "STRING"


# ============================================================================
# _build_field_list_from_dsl
# ============================================================================

def _make_mock_svc(dimensions: dict = None, measures: dict = None):
    """构造带指定字段的语义服务桩。"""
    svc = MagicMock()
    cube = MagicMock()

    # dimensions: {dim_name: (title, type)}
    def get_dim(name):
        if dimensions and name in dimensions:
            d = MagicMock()
            d.title = dimensions[name][0]
            d.type = dimensions[name][1]
            return d
        return None

    # measures: {m_name: (title, type)}
    def get_measure(name):
        if measures and name in measures:
            m = MagicMock()
            m.title = measures[name][0]
            m.type = measures[name][1]
            return m
        return None

    cube.dimensions = MagicMock()
    cube.dimensions.get = MagicMock(side_effect=get_dim)
    cube.measures = MagicMock()
    cube.measures.get = MagicMock(side_effect=get_measure)

    svc._cube_repo.get.return_value = cube
    return svc


def _make_publish_service(dimensions: dict = None, measures: dict = None):
    semantic_service = _make_mock_svc(dimensions=dimensions, measures=measures)
    return ViewPublishService(
        semantic_service=semantic_service,
        dataset_repo=MagicMock(),
        dataset_handler=MagicMock(),
    )


class TestBuildFieldListFromDsl:
    def test_empty_dsl_returns_empty_list(self):
        svc = _make_publish_service()
        result = svc._build_field_list_from_dsl({})
        assert result == []

    def test_dimension_fields_are_included(self):
        svc = _make_publish_service(dimensions={"user_id": ("用户ID", "string")})
        dsl = {"dimensions": ["users.user_id"]}
        fields = svc._build_field_list_from_dsl(dsl)

        assert len(fields) == 1
        f = fields[0]
        assert f["physical_name"] == "users__user_id"
        assert f["data_type"] == "STRING"
        assert f["display_name"] == "用户ID"
        assert f["business_type"] == "dimension"
        assert f["field_order"] == 0

    def test_measure_fields_are_included(self):
        svc = _make_publish_service(measures={"revenue": ("收入", "sum")})
        dsl = {"measures": ["orders.revenue"]}
        fields = svc._build_field_list_from_dsl(dsl)

        assert len(fields) == 1
        f = fields[0]
        assert f["physical_name"] == "orders__revenue"
        assert f["data_type"] == "BIGINT"
        assert f["business_type"] == "metric"

    def test_count_measure_maps_to_bigint(self):
        svc = _make_publish_service(measures={"cnt": ("计数", "count")})
        dsl = {"measures": ["t.cnt"]}
        fields = svc._build_field_list_from_dsl(dsl)
        assert fields[0]["data_type"] == "BIGINT"

    def test_non_count_measure_maps_to_double(self):
        svc = _make_publish_service(measures={"avg_val": ("均值", "avg")})
        dsl = {"measures": ["t.avg_val"]}
        fields = svc._build_field_list_from_dsl(dsl)
        assert fields[0]["data_type"] == "DOUBLE"

    def test_duplicate_dimensions_are_deduplicated(self):
        """重复字段名只保留一次。"""
        svc = _make_publish_service(dimensions={"id": ("ID", "string")})
        dsl = {"dimensions": ["cube_a.id", "cube_a.id"]}
        fields = svc._build_field_list_from_dsl(dsl)
        assert len(fields) == 1

    def test_duplicate_across_dim_and_measure_is_deduplicated(self):
        """维度和指标物理名冲突时仍然去重。"""
        svc = _make_publish_service(
            dimensions={"x": ("X", "number")},
            measures={"x": ("X measure", "sum")},
        )
        dsl = {"dimensions": ["c.x"], "measures": ["c.x"]}
        fields = svc._build_field_list_from_dsl(dsl)
        assert len(fields) == 1

    def test_field_order_is_sequential(self):
        svc = _make_publish_service(
            dimensions={"a": ("A", "string"), "b": ("B", "string")},
        )
        dsl = {"dimensions": ["c.a", "c.b"]}
        fields = svc._build_field_list_from_dsl(dsl)
        assert [f["field_order"] for f in fields] == [0, 1]

    def test_missing_cube_uses_fallback_values(self):
        svc = ViewPublishService(
            semantic_service=MagicMock(),
            dataset_repo=MagicMock(),
            dataset_handler=MagicMock(),
        )
        svc._semantic_service._cube_repo.get.return_value = None
        dsl = {"dimensions": ["ghost.dim1"]}
        fields = svc._build_field_list_from_dsl(dsl)
        assert len(fields) == 1
        assert fields[0]["data_type"] == "STRING"


# ============================================================================
# _replace_dataset_fields
# ============================================================================

class TestReplaceDatasetFields:
    def _make_dataset(self, existing_names):
        dataset = MagicMock()
        dataset.id = 42
        mock_fields = [MagicMock(physical_name=n) for n in existing_names]
        dataset.fields.all.return_value = mock_fields
        return dataset

    def test_deletes_existing_and_inserts_new(self):
        svc = _make_publish_service()
        dataset = self._make_dataset(["old_field"])

        field_list = [
            {"physical_name": "new_field", "data_type": "STRING",
             "display_name": "New", "business_type": "dimension",
             "field_order": 0},
        ]

        with patch("app.application.semantic.view_publish_service.DatasetField") as MockField:
            MockField.side_effect = lambda **kw: kw
            svc._replace_dataset_fields(dataset, field_list)

        svc._dataset_repo.delete_fields.assert_called_once_with(42, ["old_field"])
        svc._dataset_repo.save_fields_batch.assert_called_once()

    def test_no_delete_when_no_existing_fields(self):
        svc = _make_publish_service()
        dataset = self._make_dataset([])

        with patch("app.application.semantic.view_publish_service.DatasetField") as MockField:
            MockField.side_effect = lambda **kw: kw
            svc._replace_dataset_fields(dataset, [])

        svc._dataset_repo.delete_fields.assert_not_called()

    def test_no_save_when_field_list_is_empty(self):
        svc = _make_publish_service()
        dataset = self._make_dataset(["x"])

        with patch("app.application.semantic.view_publish_service.DatasetField") as MockField:
            MockField.side_effect = lambda **kw: kw
            svc._replace_dataset_fields(dataset, [])

        svc._dataset_repo.delete_fields.assert_called_once()
        svc._dataset_repo.save_fields_batch.assert_not_called()
