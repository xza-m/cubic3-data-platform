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
    candidate_set = SimpleNamespace(candidate_set_id="fcand_dataset")
    cube_modeling_service._field_candidate_service.preview_from_columns.return_value = candidate_set
    cube_modeling_service.build_cube_draft_from_candidate_set.return_value = {
        "name": "dataset_10",
        "status": "draft",
        "source_sql": "SELECT * FROM orders",
        "source_dataset_type": "virtual",
        "field_candidate_trace": {"candidate_set_id": "fcand_dataset"},
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
    cube_modeling_service._field_candidate_service.preview_from_columns.assert_called_once()
    preview = cube_modeling_service._field_candidate_service.preview_from_columns.call_args.kwargs
    assert preview["source"]["source_kind"] == "dataset_virtual"
    assert preview["source"]["source_ref"] == "dataset:10"
    assert preview["source"]["dataset_id"] == 10
    assert preview["source"]["database"] == "dw"
    assert preview["source"]["table"] == "dataset_10"
    cube_modeling_service.build_cube_draft_from_candidate_set.assert_called_once()
    payload = cube_modeling_service.build_cube_draft_from_candidate_set.call_args.kwargs
    assert payload["candidate_set"] is candidate_set
    assert payload["database"] == "dw"
    assert payload["table"] == "dataset_10"
    assert payload["source_sql"] == "SELECT * FROM orders"
    assert payload["source_dataset_type"] == "virtual"
    assert payload["draft_source_mode"] == "dataset_virtual"


def test_asset_evidence_generates_candidate_trace_before_cube_draft():
    cube_modeling_service = MagicMock()
    candidate_set = SimpleNamespace(candidate_set_id="fcand_asset")
    cube_modeling_service._field_candidate_service.preview_from_evidence_bundle.return_value = candidate_set
    cube_modeling_service.build_cube_draft_from_candidate_set.return_value = {
        "name": "comment_cube",
        "field_candidate_trace": {
            "candidate_set_id": "fcand_asset",
            "draft_source_mode": "asset_evidence",
        },
    }
    service = CubeModelingSourceService(
        cube_modeling_service=cube_modeling_service,
        dataset_repository=MagicMock(),
        datasource_repository=MagicMock(),
    )
    evidence_bundle = {
        "schema_snapshot": {
            "columns": [{"name": "school_id", "type": "BIGINT", "comment": "学校ID"}],
            "partitions": ["ds"],
        }
    }

    result = service.generate_cube_draft_from_asset_evidence(
        source_id="7",
        database="df_cb_258187",
        schema="dw",
        table="dwd_interaction_comment_reports_df",
        evidence_bundle=evidence_bundle,
        name="comment_cube",
        title="评论",
        description="评论事实",
    )

    cube_modeling_service._field_candidate_service.preview_from_evidence_bundle.assert_called_once_with(
        source_id="7",
        database="df_cb_258187",
        schema="dw",
        table="dwd_interaction_comment_reports_df",
        evidence_bundle=evidence_bundle,
    )
    cube_modeling_service.build_cube_draft_from_candidate_set.assert_called_once()
    cube_modeling_service.build_cube_draft_payload.assert_not_called()
    payload = cube_modeling_service.build_cube_draft_from_candidate_set.call_args.kwargs
    assert payload["candidate_set"] is candidate_set
    assert payload["source_id"] == 7
    assert payload["database"] == "df_cb_258187"
    assert payload["schema"] == "dw"
    assert payload["table"] == "dwd_interaction_comment_reports_df"
    assert payload["partitions"] == ["ds"]
    assert payload["name"] == "comment_cube"
    assert payload["title"] == "评论"
    assert payload["description"] == "评论事实"
    assert payload["data_source"] == "metadata_snapshot"
    assert payload["draft_source_mode"] == "asset_evidence"
    assert result["field_candidate_trace"]["candidate_set_id"] == "fcand_asset"
    assert result["asset_evidence"] == evidence_bundle
    assert result["asset_evidence"] is not evidence_bundle


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
