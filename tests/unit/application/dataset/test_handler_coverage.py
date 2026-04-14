"""
数据集应用层 Handler 覆盖测试
"""
from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, PropertyMock, patch

import pandas as pd
import pytest

from app.application.dataset.commands.create_dataset import CreateDatasetCommand
from app.application.dataset.commands.delete_dataset import DeleteDatasetCommand
from app.application.dataset.commands.sync_schema import SyncSchemaCommand
from app.application.dataset.commands.update_dataset import UpdateDatasetCommand
from app.application.dataset.handlers.create_dataset_handler import CreateDatasetHandler
from app.application.dataset.handlers.delete_dataset_handler import DeleteDatasetHandler
from app.application.dataset.handlers.get_dataset_handler import GetDatasetHandler
from app.application.dataset.handlers.get_statistics_handler import GetStatisticsHandler
from app.application.dataset.handlers.list_datasets_handler import ListDatasetsHandler
from app.application.dataset.handlers.preview_dataset_handler import PreviewDatasetHandler
from app.application.dataset.handlers.sync_schema_handler import SyncSchemaHandler
from app.application.dataset.handlers.update_dataset_handler import UpdateDatasetHandler
from app.application.dataset.queries.get_dataset import GetDatasetQuery
from app.application.dataset.queries.get_statistics import GetStatisticsQuery
from app.application.dataset.queries.list_datasets import ListDatasetsQuery
from app.application.dataset.queries.preview_dataset import PreviewDatasetQuery
from app.domain.entities.data_source import DataSource
from app.domain.entities.dataset import Dataset
from app.domain.entities.dataset_field import DatasetField
from app.shared.enums import DatasetSyncStatus
from app.shared.exceptions import ApplicationException, ValidationError


def _make_scalar_result(value):
    result = MagicMock()
    result.scalar.return_value = value
    return result


def _make_dataset(**overrides) -> Dataset:
    payload = {
        "id": 1,
        "dataset_code": "orders",
        "dataset_name": "订单",
        "dataset_type": "physical",
        "source_id": 1,
        "physical_table": "dw.orders",
        "description": "订单数据集",
        "owner": "alice",
        "created_by": "alice",
        "sync_status": DatasetSyncStatus.SYNCED.value,
        "is_deleted": False,
    }
    payload.update(overrides)
    return Dataset(**payload)


class _FakeFieldCollection:
    def __init__(self, items=None):
        self.items = list(items or [])

    def all(self):
        return list(self.items)

    def append(self, item):
        self.items.append(item)


class _FakeDatasetRow:
    def __init__(self, dataset, source_type, field_count):
        self._dataset = dataset
        self.source_type = source_type
        self.field_count = field_count

    def __getitem__(self, index):
        if index != 0:
            raise IndexError(index)
        return self._dataset


def test_create_dataset_handler_normalize_fields_and_handle_success(monkeypatch):
    repository = MagicMock()
    event_bus = MagicMock()
    repository.find_by_code.return_value = SimpleNamespace(is_deleted=True)
    repository.save.side_effect = lambda dataset: dataset
    handler = CreateDatasetHandler(repository=repository, event_bus=event_bus)

    identified_fields = [
        {
            "field_name": "order_id",
            "display_name": "订单ID",
            "data_type": "bigint",
            "business_type": "metric",
            "sensitivity_level": "internal",
            "mask_rule": None,
            "comment": "主键",
        },
        {
            "field_name": "ds",
            "display_name": "分区",
            "data_type": "date",
            "business_type": "partition",
            "sensitivity_level": "public",
            "mask_rule": None,
            "comment": "日期分区",
        },
    ]
    monkeypatch.setattr(
        "app.application.dataset.handlers.create_dataset_handler.FieldIdentifier.identify_fields_batch",
        lambda fields: identified_fields,
    )

    normalized = handler._normalize_fields(
        [
            {"physical_name": "order_id", "data_type": "bigint", "comment": "主键"},
            {"name": "order_id", "type": "bigint"},
            {"name": "ds", "type": "date", "business_type": "partition"},
            {"name": "", "type": "varchar"},
        ]
    )

    assert normalized == [
        {
            "physical_name": "order_id",
            "data_type": "bigint",
            "display_name": "订单ID",
            "business_type": "metric",
            "sensitivity_level": "internal",
            "mask_rule": None,
            "comment": "主键",
            "field_order": 0,
        },
        {
            "physical_name": "ds",
            "data_type": "date",
            "display_name": "分区",
            "business_type": "partition",
            "sensitivity_level": "public",
            "mask_rule": None,
            "comment": "日期分区",
            "field_order": 2,
        },
    ]
    assert handler._normalize_fields([]) == []

    command = CreateDatasetCommand(
        dataset_code="orders",
        dataset_name="订单",
        source_id=1,
        physical_table="dw.orders",
        fields=[{"physical_name": "order_id", "data_type": "bigint"}],
        created_by="alice",
    )
    dataset = handler.handle(command)

    assert dataset.dataset_code == "orders"
    assert dataset.sync_status == DatasetSyncStatus.SYNCED.value
    assert dataset.last_sync_at is not None
    repository.commit.assert_called_once()
    event_bus.publish_batch.assert_called_once()


def test_create_dataset_handler_rejects_existing_code():
    repository = MagicMock()
    repository.find_by_code.return_value = SimpleNamespace(is_deleted=False)
    handler = CreateDatasetHandler(repository=repository, event_bus=MagicMock())

    with pytest.raises(ApplicationException, match="数据集编码 'orders' 已存在"):
        handler.handle(
            CreateDatasetCommand(
                dataset_code="orders",
                dataset_name="订单",
                source_id=1,
                physical_table="dw.orders",
                fields=[],
                created_by="alice",
            )
        )


def test_delete_dataset_handler_covers_not_found_and_success():
    repository = MagicMock()
    event_bus = MagicMock()
    repository.find_by_id.return_value = None
    handler = DeleteDatasetHandler(repository=repository, event_bus=event_bus)

    with pytest.raises(ApplicationException, match="数据集不存在"):
        handler.handle(DeleteDatasetCommand(dataset_id=1))

    dataset = _make_dataset()
    repository.find_by_id.return_value = dataset
    command = DeleteDatasetCommand(dataset_id=1)
    command.deleted_by = "alice"
    handler.handle(command)

    assert dataset.is_deleted is True
    repository.save.assert_called_once_with(dataset)
    repository.commit.assert_called_once()
    event_bus.publish_batch.assert_called_once()


def test_get_dataset_handler_covers_not_found_and_success():
    repository = MagicMock()
    repository.find_by_id.return_value = None
    handler = GetDatasetHandler(repository=repository)

    with pytest.raises(ApplicationException, match="数据集不存在"):
        handler.handle(GetDatasetQuery(dataset_id=1))

    dataset = _make_dataset()
    repository.find_by_id.return_value = dataset
    assert handler.handle(GetDatasetQuery(dataset_id=1)) is dataset


def test_dataset_statistics_handler_returns_expected_counts():
    engine = MagicMock()
    conn = MagicMock()
    conn.execute.side_effect = [
        _make_scalar_result(5),
        [
            SimpleNamespace(sync_status="active", count=1),
            SimpleNamespace(sync_status="syncing", count=2),
            SimpleNamespace(sync_status="synced", count=1),
            SimpleNamespace(sync_status="failed", count=1),
        ],
        [SimpleNamespace(source_id=1, count=3)],
        [SimpleNamespace(owner="alice", count=2)],
    ]
    engine.connect.return_value.__enter__.return_value = conn
    engine.connect.return_value.__exit__.return_value = False
    handler = GetStatisticsHandler(engine=engine)

    result = handler.handle(GetStatisticsQuery())
    assert result == {
        "total": 5,
        "active": 1,
        "syncing": 2,
        "synced": 1,
        "failed": 1,
        "pending": 0,
        "by_source": {1: 3},
        "by_owner": {"alice": 2},
    }


def test_list_datasets_handler_covers_filters_and_field_count(monkeypatch):
    count_session = MagicMock()
    count_session.execute.return_value = _make_scalar_result(1)
    list_session = MagicMock()
    dataset = _make_dataset()
    row = _FakeDatasetRow(dataset, "postgresql", None)
    data_result = MagicMock()
    data_result.all.return_value = [row]
    list_session.execute.return_value = data_result

    count_ctx = MagicMock()
    count_ctx.__enter__.return_value = count_session
    count_ctx.__exit__.return_value = False
    list_ctx = MagicMock()
    list_ctx.__enter__.return_value = list_session
    list_ctx.__exit__.return_value = False

    session_factory = MagicMock(side_effect=[count_ctx, list_ctx])
    monkeypatch.setattr("app.application.dataset.handlers.list_datasets_handler.Session", session_factory)

    handler = ListDatasetsHandler(engine=MagicMock())
    result = handler.handle(ListDatasetsQuery(source_id=1, owner="alice", search="订单", page=2, page_size=10))

    assert result["total"] == 1
    assert result["page"] == 2
    assert result["items"][0].source_type == "postgresql"
    assert result["items"][0].field_count == 0


def test_preview_dataset_handler_covers_not_found_and_success(monkeypatch):
    import app.application.dataset.handlers.preview_dataset_handler as preview_module

    datasource_repository = MagicMock()
    datasource_repository.find_by_id.return_value = None
    handler = PreviewDatasetHandler(datasource_repository=datasource_repository)

    with pytest.raises(ApplicationException, match="数据源不存在"):
        handler.handle(PreviewDatasetQuery(datasource_id=1, database="dw", table="orders"))

    datasource_repository.find_by_id.return_value = DataSource(
        id=1,
        name="warehouse",
        source_type="postgresql",
        connection_config={"host": "db.local"},
    )
    adapter = MagicMock()
    adapter.get_table_schema.return_value = {
        "comment": "订单表",
        "row_count": 100,
        "size": 2048,
        "create_time": "2026-01-01",
        "last_modified": "2026-01-02",
        "columns": [
            {"name": "order_id", "type": "bigint", "comment": "主键"},
            {"name": "ds", "type": "date", "comment": "分区"},
        ],
        "partitions": [{"name": "ds"}],
    }
    monkeypatch.setattr(
        "app.application.dataset.handlers.preview_dataset_handler.AdapterFactory.create_adapter",
        lambda *_args, **_kwargs: adapter,
    )
    monkeypatch.setattr(
        "app.application.dataset.handlers.preview_dataset_handler.FieldIdentifier.identify_fields_batch",
        lambda fields: fields,
    )
    monkeypatch.setattr(
        "app.application.dataset.handlers.preview_dataset_handler.FieldIdentifier.get_statistics",
        lambda fields: {"total": len(fields), "partition": 1},
    )
    monkeypatch.setattr(
        preview_module,
        "PreviewTableDataHandler",
        lambda datasource_repository: SimpleNamespace(
            handle=lambda _query: {
                "columns": [
                    {"name": "order_id", "type": "bigint"},
                    {"name": "ds", "type": "date"},
                ],
                "data": [{"order_id": 1, "ds": "2026-01-01"}],
                "row_count": 1,
            }
        ),
        raising=False,
    )

    result = handler.handle(PreviewDatasetQuery(datasource_id=1, database="dw", table="orders"))
    assert result["table_info"]["comment"] == "订单表"
    assert result["fields"][1]["is_partition"] is True
    assert result["statistics"] == {"total": 2, "partition": 1}
    assert result["preview_limit"] == 20
    assert result["sample_columns"] == ["order_id", "ds"]
    assert result["sample_rows"] == [{"order_id": 1, "ds": "2026-01-01"}]


def test_preview_dataset_handler_covers_schema_and_preview_error_paths(monkeypatch):
    datasource_repository = MagicMock()
    datasource_repository.find_by_id.return_value = DataSource(
        id=1,
        name="warehouse",
        source_type="postgresql",
        connection_config={"host": "db.local", "database": "dw"},
    )
    adapter = MagicMock()
    monkeypatch.setattr(
        "app.application.dataset.handlers.preview_dataset_handler.AdapterFactory.create_adapter",
        lambda *_args, **_kwargs: adapter,
    )

    handler = PreviewDatasetHandler(datasource_repository=datasource_repository)
    adapter.get_table_schema.side_effect = RuntimeError("schema boom")
    with pytest.raises(ApplicationException, match="表结构获取失败: schema boom"):
        handler.handle(PreviewDatasetQuery(datasource_id=1, database="dw", table="orders"))

    adapter.get_table_schema.side_effect = None
    adapter.get_table_schema.return_value = {
        "comment": "订单表",
        "row_count": 100,
        "size": 2048,
        "create_time": "2026-01-01",
        "last_modified": "2026-01-02",
        "columns": [
            {"name": "order_id", "type": "bigint", "comment": "主键"},
            {"name": "pt", "type": "string", "comment": "分区"},
        ],
        "partitions": ["pt"],
    }
    monkeypatch.setattr(
        "app.application.dataset.handlers.preview_dataset_handler.FieldIdentifier.identify_fields_batch",
        lambda fields: fields,
    )
    monkeypatch.setattr(
        "app.application.dataset.handlers.preview_dataset_handler.FieldIdentifier.get_statistics",
        lambda fields: {"total": len(fields), "partition": 1},
    )
    preview_handler = MagicMock()
    preview_handler.handle.side_effect = RuntimeError("preview boom")
    handler = PreviewDatasetHandler(
        datasource_repository=datasource_repository,
        preview_table_data_handler=preview_handler,
    )

    result = handler.handle(PreviewDatasetQuery(datasource_id=1, database="dw", table="orders"))

    assert result["fields"][1]["is_partition"] is True
    assert result["sample_rows"] == []
    assert result["sample_columns"] == []
    assert result["preview_error"] == "preview boom"
    assert result["table_info"]["table"] == "orders"


def test_dataset_metadata_refresh_service_supports_physical_virtual_and_file(monkeypatch, tmp_path):
    from app.application.dataset.services.dataset_metadata_refresh_service import DatasetMetadataRefreshService

    datasource_repository = MagicMock()
    datasource = DataSource(
        id=1,
        name="warehouse",
        source_type="postgresql",
        connection_config={"database": "dw"},
    )
    datasource_repository.find_by_id.return_value = datasource
    service = DatasetMetadataRefreshService(datasource_repository=datasource_repository)

    adapter = MagicMock()
    adapter.get_table_schema.return_value = {
        "columns": [{"name": "order_id", "type": "bigint", "comment": "主键"}],
        "partitions": [],
    }
    monkeypatch.setattr(
        "app.application.dataset.services.dataset_metadata_refresh_service.AdapterFactory.create_adapter",
        lambda *_args, **_kwargs: adapter,
    )
    monkeypatch.setattr(
        "app.application.dataset.services.dataset_metadata_refresh_service.FieldIdentifier.identify_fields_batch",
        lambda fields: [{
            "physical_name": fields[0]["name"],
            "data_type": fields[0]["type"],
            "display_name": "订单ID",
            "business_type": "dimension",
            "sensitivity_level": "public",
            "mask_rule": None,
            "comment": "主键",
        }],
    )

    physical_fields = service.refresh(_make_dataset(dataset_type="physical", physical_table="dw.orders"))
    assert physical_fields[0]["physical_name"] == "order_id"

    monkeypatch.setattr(
        "app.application.dataset.services.dataset_metadata_refresh_service.ExecuteSQLPreviewHandler",
        lambda datasource_repository: SimpleNamespace(
            handle=lambda command: {
                "fields": [{
                    "physical_name": "total_amount",
                    "data_type": "decimal",
                    "display_name": "总金额",
                    "business_type": "metric",
                    "sensitivity_level": "public",
                    "mask_rule": None,
                    "comment": "",
                }]
            }
        ),
    )
    virtual_fields = service.refresh(
        _make_dataset(dataset_type="virtual", source_id=1, sql_query="select sum(amount) as total_amount from orders")
    )
    assert virtual_fields[0]["physical_name"] == "total_amount"

    file_path = tmp_path / "orders.xlsx"
    file_path.write_bytes(b"fake-excel")
    monkeypatch.setattr(
        "app.application.dataset.services.dataset_metadata_refresh_service.parse_tabular_file_metadata",
        lambda _path, preview_limit=20: {
            "fields": [{
                "physical_name": "order_no",
                "data_type": "object",
                "display_name": "订单号",
                "business_type": "dimension",
                "sensitivity_level": "public",
                "mask_rule": None,
                "comment": "",
            }]
        },
    )
    file_fields = service.refresh(
        _make_dataset(dataset_type="file", file_metadata={"file_path": str(file_path)})
    )
    assert file_fields[0]["physical_name"] == "order_no"


def test_dataset_metadata_refresh_service_helper_and_error_paths(monkeypatch, tmp_path):
    from app.application.dataset.services.dataset_metadata_refresh_service import (
        DatasetMetadataRefreshService,
        _normalize_identified_fields,
        _read_tabular_file,
        _split_physical_table,
        parse_tabular_file_metadata,
    )

    csv_df = pd.DataFrame([{"order_id": 1, "pt": "2026-01-01"}])
    excel_df = pd.DataFrame([{"student_id": 1}])
    read_csv = MagicMock(side_effect=[csv_df, csv_df.head(1)])
    read_excel = MagicMock(side_effect=[excel_df, excel_df.head(1)])
    monkeypatch.setattr("app.application.dataset.services.dataset_metadata_refresh_service.pd.read_csv", read_csv)
    monkeypatch.setattr("app.application.dataset.services.dataset_metadata_refresh_service.pd.read_excel", read_excel)

    full_df, preview_df = _read_tabular_file(str(tmp_path / "orders.csv"))
    assert full_df.equals(csv_df)
    assert preview_df.equals(csv_df.head(1))

    full_excel_df, preview_excel_df = _read_tabular_file(str(tmp_path / "students.xlsx"))
    assert full_excel_df.equals(excel_df)
    assert preview_excel_df.equals(excel_df.head(1))

    with pytest.raises(ValidationError, match="不支持的文件类型"):
        _read_tabular_file(str(tmp_path / "orders.txt"))

    monkeypatch.setattr(
        "app.application.dataset.services.dataset_metadata_refresh_service.pd.read_csv",
        MagicMock(side_effect=[csv_df, csv_df.head(1)]),
    )

    monkeypatch.setattr(
        "app.application.dataset.services.dataset_metadata_refresh_service.FieldIdentifier.identify_fields_batch",
        lambda fields: [
            {
                "physical_name": fields[0]["name"],
                "data_type": fields[0]["type"],
                "display_name": "订单ID",
                "business_type": "dimension",
                "sensitivity_level": "public",
                "mask_rule": None,
                "comment": "",
            },
            {
                "field_name": fields[1]["name"],
                "type": fields[1]["type"],
                "comment": "分区字段",
            },
            {
                "comment": "应跳过",
            },
        ],
    )
    monkeypatch.setattr(
        "app.application.dataset.services.dataset_metadata_refresh_service.FieldIdentifier.get_statistics",
        lambda fields: {"total": len(fields), "partition": 1},
    )

    metadata = parse_tabular_file_metadata(str(tmp_path / "orders.csv"), preview_limit=5)
    assert metadata["columns"][0]["name"] == "order_id"
    assert metadata["fields"][1]["physical_name"] == "pt"
    assert metadata["sample_rows"] == [{"order_id": 1, "pt": "2026-01-01"}]
    assert metadata["sample_columns"] == ["order_id", "pt"]
    assert metadata["preview_limit"] == 5
    assert metadata["row_count"] == 1

    monkeypatch.setattr(
        "app.application.dataset.services.dataset_metadata_refresh_service._read_tabular_file",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(ValidationError("bad file")),
    )
    with pytest.raises(ValidationError, match="bad file"):
        parse_tabular_file_metadata(str(tmp_path / "bad.csv"))

    monkeypatch.setattr(
        "app.application.dataset.services.dataset_metadata_refresh_service._read_tabular_file",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("decode failed")),
    )
    with pytest.raises(ValidationError, match="文件解析失败: decode failed"):
        parse_tabular_file_metadata(str(tmp_path / "broken.csv"))

    normalized = _normalize_identified_fields(
        [
            {"name": "order_id", "type": "bigint"},
            {"field_name": "pt", "data_type": "string", "display_name": "分区"},
            {"comment": "missing"},
        ]
    )
    assert normalized == [
        {
            "physical_name": "order_id",
            "data_type": "bigint",
            "display_name": "order_id",
            "business_type": "dimension",
            "sensitivity_level": "public",
            "mask_rule": None,
            "comment": None,
        },
        {
            "physical_name": "pt",
            "data_type": "string",
            "display_name": "分区",
            "business_type": "dimension",
            "sensitivity_level": "public",
            "mask_rule": None,
            "comment": None,
        },
    ]

    assert _split_physical_table("dw.orders", {"database": "fallback"}) == ("dw", "orders")
    assert _split_physical_table("orders", {"database": "fallback"}) == ("fallback", "orders")

    datasource_repository = MagicMock()
    datasource_repository.find_by_id.return_value = None
    service = DatasetMetadataRefreshService(datasource_repository=datasource_repository)

    with pytest.raises(ApplicationException, match="数据源不存在: 1"):
        service.refresh(_make_dataset(dataset_type="physical", source_id=1, physical_table="orders"))

    with pytest.raises(ValidationError, match="文件数据集缺少 file_path"):
        service.refresh(_make_dataset(dataset_type="file", file_metadata={}))

    with pytest.raises(ApplicationException, match="不支持的数据集类型: stream"):
        service.refresh(_make_dataset(dataset_type="stream"))


def test_sync_schema_handler_queues_jobs_for_supported_dataset_types():
    dataset_repository = MagicMock()
    task_queue = MagicMock()
    task_queue.enqueue.return_value = SimpleNamespace(id="job-1")
    dataset_repository.find_by_id.return_value = None
    handler = SyncSchemaHandler(dataset_repository=dataset_repository, task_queue=task_queue)

    with pytest.raises(ApplicationException, match="数据集不存在"):
        handler.handle(SyncSchemaCommand(dataset_id=1))

    for dataset_type in ("physical", "virtual", "file"):
        dataset_repository.find_by_id.return_value = _make_dataset(dataset_type=dataset_type)
        result = handler.handle(SyncSchemaCommand(dataset_id=1))
        assert result == {"job_id": "job-1", "status": "queued"}

    assert task_queue.enqueue.call_count == 3


def test_sync_schema_handler_rejects_unsupported_type_and_falls_back_to_container(monkeypatch):
    dataset_repository = MagicMock()
    dataset_repository.find_by_id.return_value = _make_dataset(dataset_type="stream")
    handler = SyncSchemaHandler(dataset_repository=dataset_repository, task_queue=MagicMock())

    with pytest.raises(ApplicationException, match="不支持的数据集类型: stream"):
        handler.handle(SyncSchemaCommand(dataset_id=1))

    queue = MagicMock()
    queue.enqueue.return_value = SimpleNamespace(id="job-2")
    dataset_repository.find_by_id.return_value = _make_dataset(dataset_type="physical")
    monkeypatch.setattr(
        "app.di.container.get_container",
        lambda: SimpleNamespace(task_queue=lambda: queue),
    )
    handler = SyncSchemaHandler(dataset_repository=dataset_repository, task_queue=None)

    result = handler.handle(SyncSchemaCommand(dataset_id=2))

    assert result == {"job_id": "job-2", "status": "queued"}
    queue.enqueue.assert_called_once()


def test_execute_dataset_sync_job_covers_success_and_failure(monkeypatch):
    from app.infrastructure.tasks.jobs.dataset_sync_job import execute_dataset_sync_job

    dataset = _make_dataset(dataset_code="orders", physical_table="dw.orders")
    existing_field = DatasetField(
        physical_name="order_id",
        data_type="int",
        business_type="dimension",
        sensitivity_level="public",
        comment="旧注释",
    )
    fake_fields = _FakeFieldCollection([existing_field])
    success_query = MagicMock()
    success_query.filter_by.return_value.first.return_value = dataset
    success_session = MagicMock()
    success_session.query.return_value = success_query

    monkeypatch.setattr(
        "app.infrastructure.tasks.jobs.dataset_sync_job.get_db_session",
        lambda: success_session,
    )
    monkeypatch.setattr(
        "app.infrastructure.tasks.jobs.dataset_sync_job.DatasetMetadataRefreshService",
        lambda datasource_repository: SimpleNamespace(
            refresh=lambda _dataset: [
                {
                    "physical_name": "order_id",
                    "data_type": "bigint",
                    "display_name": "订单ID",
                    "business_type": "dimension",
                    "sensitivity_level": "internal",
                    "mask_rule": None,
                    "comment": "主键",
                },
                {
                    "physical_name": "amount",
                    "data_type": "decimal",
                    "display_name": "金额",
                    "business_type": "metric",
                    "sensitivity_level": "public",
                    "mask_rule": None,
                    "comment": "金额",
                },
            ]
        ),
    )

    with patch.object(Dataset, "fields", new_callable=PropertyMock, return_value=fake_fields):
        result = execute_dataset_sync_job(dataset.id)

    assert result["dataset_id"] == dataset.id
    assert result["status"] == DatasetSyncStatus.SYNCED.value
    assert result["updated_fields"] == 1
    assert result["added_fields"] == 1
    assert dataset.sync_status == DatasetSyncStatus.SYNCED.value
    assert existing_field.data_type == "bigint"
    assert len(fake_fields.items) == 2

    failing_dataset = _make_dataset(dataset_code="orders", physical_table="dw.orders")
    failing_query = MagicMock()
    failing_query.filter_by.return_value.first.side_effect = [failing_dataset, failing_dataset]
    failing_session = MagicMock()
    failing_session.query.return_value = failing_query
    monkeypatch.setattr(
        "app.infrastructure.tasks.jobs.dataset_sync_job.get_db_session",
        lambda: failing_session,
    )
    monkeypatch.setattr(
        "app.infrastructure.tasks.jobs.dataset_sync_job.DatasetMetadataRefreshService",
        lambda datasource_repository: SimpleNamespace(
            refresh=lambda _dataset: (_ for _ in ()).throw(RuntimeError("schema failure"))
        ),
    )

    with patch.object(Dataset, "fields", new_callable=PropertyMock, return_value=_FakeFieldCollection([])):
        with pytest.raises(RuntimeError, match="schema failure"):
            execute_dataset_sync_job(failing_dataset.id)

    assert failing_dataset.sync_status == DatasetSyncStatus.FAILED.value
    assert failing_dataset.sync_error == "schema failure"


def test_update_dataset_handler_covers_not_found_and_success():
    repository = MagicMock()
    repository.find_by_id.return_value = None
    repository.save.side_effect = lambda dataset: dataset
    handler = UpdateDatasetHandler(repository=repository)

    with pytest.raises(ApplicationException, match="数据集不存在"):
        handler.handle(UpdateDatasetCommand(dataset_id=1))

    dataset = _make_dataset()
    repository.find_by_id.return_value = dataset
    updated = handler.handle(
        UpdateDatasetCommand(dataset_id=1, dataset_name="订单宽表", description="新描述", owner="bob")
    )

    assert updated is dataset
    assert dataset.dataset_name == "订单宽表"
    assert dataset.description == "新描述"
    assert dataset.owner == "bob"
    repository.save.assert_called_once_with(dataset)
