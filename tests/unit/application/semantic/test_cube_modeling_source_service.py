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
