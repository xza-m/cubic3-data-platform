from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.application.semantic.cube_modeling_source_service import CubeModelingSourceService
from app.shared.exceptions import ApplicationException


def _field(name: str, data_type: str, *, comment: str = "", display_name: str = "", business_type: str = "dimension"):
    return SimpleNamespace(
        physical_name=name,
        data_type=data_type,
        comment=comment,
        display_name=display_name,
        business_type=business_type,
    )


def _dataset(*, dataset_id: int, dataset_type: str, source_id: int = 7, physical_table: str = "", sql_query: str = "", fields=None):
    return SimpleNamespace(
        id=dataset_id,
        dataset_code=f"dataset_{dataset_id}",
        dataset_name=f"数据集_{dataset_id}",
        dataset_type=dataset_type,
        source_id=source_id,
        physical_table=physical_table,
        sql_query=sql_query,
        description="测试数据集",
        is_deleted=False,
        fields=SimpleNamespace(all=lambda: list(fields or [])),
    )


def test_generate_from_physical_dataset_uses_underlying_table():
    cube_modeling_service = MagicMock()
    cube_modeling_service.generate_cube_draft.return_value = {"name": "orders_cube", "status": "draft"}
    dataset_repo = MagicMock()
    dataset_repo.find_by_id.return_value = _dataset(
        dataset_id=9,
        dataset_type="physical",
        physical_table="dw.public.orders",
    )
    datasource_repo = MagicMock()

    service = CubeModelingSourceService(
        cube_modeling_service=cube_modeling_service,
        dataset_repository=dataset_repo,
        datasource_repository=datasource_repo,
    )

    result = service.generate_cube_draft_from_source(source_kind="dataset", dataset_id=9)

    assert result["status"] == "draft"
    cube_modeling_service.generate_cube_draft.assert_called_once_with(
        source_id=7,
        database="dw",
        schema="public",
        table="orders",
        name="dataset_9",
        title="数据集_9",
        description="测试数据集",
    )


def test_generate_from_virtual_dataset_builds_sql_backed_cube_draft():
    cube_modeling_service = MagicMock()
    cube_modeling_service.build_cube_draft_payload.return_value = {
        "name": "dataset_10",
        "status": "draft",
        "source_sql": "SELECT * FROM orders",
        "source_dataset_type": "virtual",
    }
    dataset_repo = MagicMock()
    dataset_repo.find_by_id.return_value = _dataset(
        dataset_id=10,
        dataset_type="virtual",
        sql_query="SELECT * FROM orders",
        fields=[
            _field("order_id", "bigint", business_type="dimension"),
            _field("amount", "double", business_type="metric"),
        ],
    )
    datasource_repo = MagicMock()
    datasource_repo.find_by_id.return_value = SimpleNamespace(connection_config={"database": "dw"})

    service = CubeModelingSourceService(
        cube_modeling_service=cube_modeling_service,
        dataset_repository=dataset_repo,
        datasource_repository=datasource_repo,
    )

    result = service.generate_cube_draft_from_source(source_kind="dataset", dataset_id=10)

    assert result["source_dataset_type"] == "virtual"
    cube_modeling_service.build_cube_draft_payload.assert_called_once()
    payload = cube_modeling_service.build_cube_draft_payload.call_args.kwargs
    assert payload["database"] == "dw"
    assert payload["table"] == "dataset_10"
    assert payload["source_sql"] == "SELECT * FROM orders"
    assert payload["source_dataset_type"] == "virtual"


def test_generate_from_file_dataset_is_rejected():
    cube_modeling_service = MagicMock()
    dataset_repo = MagicMock()
    dataset_repo.find_by_id.return_value = _dataset(
        dataset_id=11,
        dataset_type="file",
    )
    datasource_repo = MagicMock()
    service = CubeModelingSourceService(
        cube_modeling_service=cube_modeling_service,
        dataset_repository=dataset_repo,
        datasource_repository=datasource_repo,
    )

    with pytest.raises(ApplicationException, match="file 数据集"):
        service.generate_cube_draft_from_source(source_kind="dataset", dataset_id=11)


def test_generate_from_source_covers_validation_and_helper_paths():
    cube_modeling_service = MagicMock()
    dataset_repo = MagicMock()
    datasource_repo = MagicMock()
    service = CubeModelingSourceService(
        cube_modeling_service=cube_modeling_service,
        dataset_repository=dataset_repo,
        datasource_repository=datasource_repo,
    )

    with pytest.raises(ApplicationException, match="physical_table 建模源缺少必要字段"):
        service.generate_cube_draft_from_source(source_kind="physical_table", source_id=None, database="dw", table="orders")

    with pytest.raises(ApplicationException, match="不支持的建模源类型"):
        service.generate_cube_draft_from_source(source_kind="stream")

    with pytest.raises(ApplicationException, match="dataset 建模源缺少必要字段"):
        service.generate_cube_draft_from_source(source_kind="dataset")

    dataset_repo.find_by_id.return_value = None
    with pytest.raises(ApplicationException, match="数据集不存在"):
        service.generate_cube_draft_from_source(source_kind="dataset", dataset_id=99)

    deleted_dataset = _dataset(dataset_id=12, dataset_type="physical")
    deleted_dataset.is_deleted = True
    dataset_repo.find_by_id.return_value = deleted_dataset
    with pytest.raises(ApplicationException, match="数据集不存在"):
        service.generate_cube_draft_from_source(source_kind="dataset", dataset_id=12)

    dataset_repo.find_by_id.return_value = _dataset(dataset_id=13, dataset_type="stream")
    with pytest.raises(ApplicationException, match="不支持的数据集类型"):
        service.generate_cube_draft_from_source(source_kind="dataset", dataset_id=13)

    dataset_repo.find_by_id.return_value = _dataset(dataset_id=14, dataset_type="physical", source_id=None, physical_table="")
    with pytest.raises(ApplicationException, match="physical 数据集缺少可用于建模的 source_id 或 physical_table"):
        service.generate_cube_draft_from_source(source_kind="dataset", dataset_id=14)

    dataset_repo.find_by_id.return_value = _dataset(
        dataset_id=15,
        dataset_type="virtual",
        source_id=None,
        sql_query="select 1",
        fields=[_field("id", "bigint")],
    )
    with pytest.raises(ApplicationException, match="virtual 数据集缺少 source_id"):
        service.generate_cube_draft_from_source(source_kind="dataset", dataset_id=15)

    dataset_repo.find_by_id.return_value = _dataset(
        dataset_id=16,
        dataset_type="virtual",
        sql_query="",
        fields=[_field("id", "bigint")],
    )
    with pytest.raises(ApplicationException, match="virtual 数据集缺少 sql_query"):
        service.generate_cube_draft_from_source(source_kind="dataset", dataset_id=16)

    dataset_repo.find_by_id.return_value = _dataset(
        dataset_id=17,
        dataset_type="virtual",
        sql_query="select 1",
        fields=[_field("id", "bigint")],
    )
    datasource_repo.find_by_id.return_value = None
    with pytest.raises(ApplicationException, match="数据源不存在"):
        service.generate_cube_draft_from_source(source_kind="dataset", dataset_id=17)

    dataset_repo.find_by_id.return_value = _dataset(
        dataset_id=18,
        dataset_type="virtual",
        sql_query="select 1",
        fields=[],
    )
    datasource_repo.find_by_id.return_value = SimpleNamespace(connection_config={"project": "dw"})
    with pytest.raises(ApplicationException, match="virtual 数据集缺少字段定义"):
        service.generate_cube_draft_from_source(source_kind="dataset", dataset_id=18)

    cube_modeling_service.generate_cube_draft.return_value = {"name": "orders_cube"}
    physical_result = service.generate_cube_draft_from_source(
        source_kind="physical_table",
        source_id=7,
        database="dw",
        schema="ods",
        table="orders",
    )
    assert physical_result["name"] == "orders_cube"
    cube_modeling_service.generate_cube_draft.assert_called_with(
        source_id=7,
        database="dw",
        schema="ods",
        table="orders",
        name=None,
        title=None,
        description=None,
    )

    assert service._parse_physical_table("dw.orders") == ("dw", None, "orders")
    assert service._parse_physical_table("orders") == ("", None, "orders")
    assert service._collect_dataset_fields(SimpleNamespace(fields=None)) == []
    assert service._collect_dataset_fields(SimpleNamespace(fields=[_field("id", "bigint")]))[0].physical_name == "id"
    assert service._collect_dataset_fields(SimpleNamespace(fields=123)) == []
