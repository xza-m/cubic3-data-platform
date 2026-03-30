"""ViewPublishService 单元测试"""
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

from app.application.semantic.view_publish_service import ViewPublishService, _to_iso_datetime


class _DatasetRepo:
    def __init__(self, existing=None):
        self.existing = existing
        self.saved = []
        self.deleted_fields = []
        self.saved_fields = []
        self.committed = False

    def find_by_code(self, _code):
        return self.existing

    def save(self, dataset):
        self.saved.append(dataset)
        return dataset

    def delete_fields(self, dataset_id, field_names):
        self.deleted_fields.append((dataset_id, field_names))
        return len(field_names)

    def save_fields_batch(self, fields):
        self.saved_fields.extend(fields)
        return fields

    def commit(self):
        self.committed = True


class _DatasetHandler:
    def __init__(self):
        self.commands = []

    def handle(self, command):
        self.commands.append(command)
        return SimpleNamespace(
            id=101,
            dataset_code=command.dataset_code,
            updated_at=None,
        )


class _FieldsManager:
    def __init__(self, names):
        self._names = names

    def all(self):
        return [SimpleNamespace(physical_name=name) for name in self._names]


class _ViewRepo:
    def __init__(self, view):
        self._view = view

    def get(self, name):
        return self._view if self._view and self._view.name == name else None


class _RegistryRepo:
    def __init__(self, entry=None):
        self.entry = entry
        self.upserts = []
        self.commit_count = 0

    def upsert(self, object_type, object_name, **kwargs):
        self.upserts.append((object_type, object_name, kwargs))

    def commit(self):
        self.commit_count += 1

    def get(self, object_type, object_name):
        return self.entry


class _SemanticService:
    def __init__(self, view):
        self._view_repo = _ViewRepo(view)
        self._cube_repo = SimpleNamespace(get=self._get_cube)
        self._cubes = {
            "orders": SimpleNamespace(
                dimensions={"order_id": SimpleNamespace(type="string", title="订单ID")},
                measures={"order_count": SimpleNamespace(type="count", title="订单数")},
            )
        }

    def _get_cube(self, name):
        return self._cubes.get(name)

    def expand_view_to_dsl(self, _view):
        return {
            "dimensions": ["orders.order_id"],
            "measures": ["orders.order_count"],
            "field_mappings": [
                {
                    "physical_name": "orders__order_id",
                    "source_ref": "orders.order_id",
                    "source_cube": "orders",
                    "source_field": "order_id",
                    "display_name": "订单ID",
                    "business_type": "dimension",
                },
                {
                    "physical_name": "orders__order_count",
                    "source_ref": "orders.order_count",
                    "source_cube": "orders",
                    "source_field": "order_count",
                    "display_name": "订单数",
                    "business_type": "metric",
                },
            ],
        }

    def compile_query(self, _dsl):
        return SimpleNamespace(sql="SELECT orders.order_id, COUNT(orders.order_id) FROM fact_orders orders")

    def list_views(self, public_only=True):
        if self._view_repo._view is None:
            return []
        if public_only and not self._view_repo._view.public:
            return []
        return [self._view_repo._view]


def _make_view(name="sales_view"):
    return SimpleNamespace(
        name=name,
        title="销售视图",
        description="销售视图描述",
        public=True,
        model_dump=lambda: {"name": name, "title": "销售视图"},
    )


def test_publish_view_creates_virtual_dataset_without_physical_materialization():
    view = _make_view()
    dataset_repo = _DatasetRepo(existing=None)
    dataset_handler = _DatasetHandler()
    service = ViewPublishService(
        semantic_service=_SemanticService(view),
        dataset_repo=dataset_repo,
        dataset_handler=dataset_handler,
        default_source_id_getter=lambda: 7,
    )

    result = service.publish_view("sales_view")

    assert result["action"] == "created"
    assert result["source_view"] == "sales_view"
    assert result["publish_status"] == "published"
    assert result["definition_hash"]
    assert dataset_handler.commands[0].dataset_type == "virtual"
    assert dataset_handler.commands[0].physical_table == ""
    assert dataset_handler.commands[0].file_metadata["semantic_publish"]["source_view"] == "sales_view"


def test_publish_view_updates_existing_dataset_and_status_reads_metadata():
    view = _make_view()
    existing = SimpleNamespace(
        id=88,
        dataset_code="view_sales_view",
        dataset_name="旧视图",
        is_deleted=False,
        fields=_FieldsManager(["legacy_field"]),
        updated_at=None,
        file_metadata={},
        complete_sync=lambda _count: None,
    )
    dataset_repo = _DatasetRepo(existing=existing)
    dataset_handler = _DatasetHandler()
    service = ViewPublishService(
        semantic_service=_SemanticService(view),
        dataset_repo=dataset_repo,
        dataset_handler=dataset_handler,
        default_source_id_getter=lambda: 7,
    )

    result = service.publish_view("sales_view")
    status = service.get_publish_status("sales_view")

    assert result["action"] == "updated"
    assert dataset_repo.committed is True
    assert existing.dataset_type == "virtual"
    assert existing.physical_table == ""
    assert existing.file_metadata["semantic_publish"]["publish_status"] == "published"
    assert status["materialized"] is True
    assert status["source_view"] == "sales_view"
    assert status["definition_hash"] == existing.file_metadata["semantic_publish"]["definition_hash"]


def test_publish_view_raises_for_missing_view_and_blocking_dependency():
    missing_service = ViewPublishService(
        definition_service=SimpleNamespace(_view_repo=_ViewRepo(None)),
        query_service=SimpleNamespace(),
        dataset_repo=_DatasetRepo(),
        dataset_handler=_DatasetHandler(),
    )

    try:
        missing_service.publish_view("missing")
        raise AssertionError("缺失 View 时应抛错")
    except ValueError as exc:
        assert "未找到 View" in str(exc)

    view = _make_view()
    blocking_service = ViewPublishService(
        definition_service=SimpleNamespace(
            _view_repo=_ViewRepo(view),
            validate_view=lambda _view: [
                {"kind": "inactive_view_dependency", "level": "error", "message": "依赖 Cube 已冻结"}
            ],
        ),
        query_service=SimpleNamespace(),
        dataset_repo=_DatasetRepo(),
        dataset_handler=_DatasetHandler(),
    )

    try:
        blocking_service.publish_view("sales_view")
        raise AssertionError("阻塞诊断时应抛错")
    except ValueError as exc:
        assert "依赖 Cube 已冻结" in str(exc)


def test_publish_status_helpers_cover_unpublished_registry_and_expand_failure():
    view = _make_view()
    registry_entry = SimpleNamespace(
        to_summary=lambda: {
            "publish_status": "published",
            "definition_hash": "hash-1",
            "last_published_at": "2026-01-01T00:00:00",
        }
    )
    registry_repo = _RegistryRepo(entry=registry_entry)
    service = ViewPublishService(
        semantic_service=_SemanticService(view),
        dataset_repo=_DatasetRepo(existing=None),
        dataset_handler=_DatasetHandler(),
        registry_repo=registry_repo,
    )

    unpublished = service.get_publish_status("sales_view")
    batch = service.get_batch_publish_status(public_only=False)

    assert unpublished["materialized"] is False
    assert unpublished["publish_status"] == "published"
    assert unpublished["state_summary"]["last_published_at"] == "2026-01-01T00:00:00"
    assert batch["sales_view"]["view_name"] == "sales_view"
    assert service._resolve_default_source_id() == 1
    assert service._extract_publish_metadata(SimpleNamespace(file_metadata="bad")) == {}
    assert _to_iso_datetime(datetime(2026, 1, 1)) == "2026-01-01T00:00:00"
    assert _to_iso_datetime("bad") is None
    assert service._resolve_source_id_from_dsl({"dimensions": ["order_id"], "measures": []}) is None

    broken_existing = SimpleNamespace(
        id=8,
        dataset_code="view_sales_view",
        dataset_name="视图",
        is_deleted=False,
        sql_query="SELECT 1",
        updated_at=datetime(2026, 1, 1),
        file_metadata={"semantic_publish": {"publish_status": "published", "field_mappings": []}},
        fields=_FieldsManager([]),
    )
    broken_definition = SimpleNamespace(
        _view_repo=_ViewRepo(view),
        _cube_repo=SimpleNamespace(get=lambda _name: None),
        list_views=lambda public_only=True: [view],
        expand_view_to_dsl=lambda _view: (_ for _ in ()).throw(RuntimeError("expand failed")),
    )
    broken_service = ViewPublishService(
        definition_service=broken_definition,
        query_service=SimpleNamespace(),
        dataset_repo=_DatasetRepo(existing=broken_existing),
        dataset_handler=_DatasetHandler(),
        registry_repo=registry_repo,
    )

    with patch("app.application.semantic.view_publish_service.logger") as mock_logger:
        status = broken_service.get_publish_status("sales_view")

    assert status["materialized"] is True
    assert status["field_mappings"] == []
    mock_logger.warning.assert_called_once()


def test_publish_helpers_cover_source_resolution_and_registry_sync():
    view = _make_view()
    registry_repo = _RegistryRepo()
    semantic = _SemanticService(view)
    semantic._cubes["orders"].source_id = 9
    service = ViewPublishService(
        semantic_service=semantic,
        dataset_repo=_DatasetRepo(),
        dataset_handler=_DatasetHandler(),
        default_source_id_getter=lambda: 0,
        registry_repo=registry_repo,
    )

    source_id = service._resolve_source_id_from_dsl({"dimensions": ["orders.order_id", "broken"], "measures": []})
    service._sync_registry("sales_view", {"semantic_publish": {"definition_hash": "hash", "publish_status": "published", "published_at": "2026-01-01T00:00:00"}})

    assert source_id == 9
    assert registry_repo.commit_count == 1
    assert registry_repo.upserts[0][0:2] == ("view", "sales_view")
