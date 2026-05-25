"""
Integration smoke tests for the Semantic Layer API.

Blueprint Factory 模式的核心优势体现在这里：
通过直接向工厂注入 Mock，无需运行任何 SQLAlchemy / Redis 基础设施，
就能以完整的 HTTP 路径（Flask 测试客户端）验证端点行为。
"""
import pytest
from unittest.mock import MagicMock
from flask import Flask

from app.interfaces.api.v1.semantic import create_semantic_blueprint
from app.interfaces.api.middleware.error_handler import register_error_handlers


# ============================================================================
# Fixtures
# ============================================================================

def _make_cube(name="orders", title="订单"):
    cube = MagicMock()
    cube.name = name
    cube.title = title
    cube.dimensions = {}
    cube.measures = {}
    cube.joins = {}
    cube.description = "测试 Cube"
    cube.table = "ods.orders"
    cube.data_source = "mc"
    cube.status = "active"
    cube.source_id = 1
    cube.source_database = "mock_project"
    cube.source_schema = None
    return cube


def _make_view(name="v_sales", title="销售视图", cubes=None):
    view = MagicMock()
    view.name = name
    view.title = title
    view.description = "销售综合视图"
    view.public = True
    view.cubes = cubes or ["orders"]
    view.model_dump.return_value = {
        "name": name,
        "title": title,
        "description": "销售综合视图",
        "public": True,
        "cubes": cubes or ["orders"],
    }
    return view


@pytest.fixture
def mock_semantic_service():
    svc = MagicMock()
    svc.list_cubes.return_value = [{
        "name": "orders",
        "title": "订单",
        "domain_id": "academic",
        "domain_name": "学业域",
        "domain_ids": ["academic"],
        "domains": [{"id": "academic", "code": "academic", "name": "学业域"}],
        "domain_count": 1,
        "state_summary": {"sync_status": "ok"},
    }]
    svc.describe_cube.return_value = {
        "name": "orders",
        "title": "订单",
        "domain_id": "academic",
        "domain_name": "学业域",
        "domain_ids": ["academic"],
        "domains": [{"id": "academic", "code": "academic", "name": "学业域"}],
        "domain_count": 1,
        "dimensions": {},
        "measures": {},
        "diagnostics": [],
        "state_summary": {"sync_status": "ok"},
    }
    svc.list_views.return_value = [_make_view()]
    svc.describe_view.return_value = {
        **_make_view().model_dump(),
        "publish_summary": {"publish_status": "unpublished"},
        "drift_summary": {"last_drift_status": "unknown"},
    }
    svc.list_view_summaries.return_value = [
        {
            "name": "v_sales",
            "title": "销售视图",
            "description": "销售综合视图",
            "public": True,
            "cube_count": 1,
            "cubes": ["orders"],
            "status": "active",
            "state_summary": {"object_type": "view", "status": "active"},
            "publish_summary": {
                "publish_status": "unpublished",
                "last_published_at": None,
            },
        }
    ]
    svc.list_recipe_summaries.return_value = [
        {
            "name": "orders_recipe",
            "title": "订单问法",
            "tags": ["orders"],
            "example_count": 1,
            "related_cubes": ["orders"],
            "state_summary": {"object_type": "recipe", "status": "active"},
        }
    ]
    svc._view_repo.list_all.return_value = [_make_view()]
    svc._view_repo.get.return_value = _make_view()
    svc._cube_repo.list_all.return_value = [_make_cube()]
    svc._recipe_repo.list_all.return_value = []
    svc.query.return_value = {
        "sql": "SELECT 1",
        "columns": ["col1"],
        "data": [[1]],
        "row_count": 1,
        "execution_time_ms": 5,
        "primary_cube": "orders",
        "joined_cubes": [],
        "retryable": False,
    }
    return svc


@pytest.fixture
def mock_dataset_repo():
    repo = MagicMock()
    repo.find_by_code.return_value = None
    return repo


@pytest.fixture
def mock_dataset_handler():
    handler = MagicMock()
    ds = MagicMock()
    ds.id = 99
    ds.dataset_code = "view_v_sales"
    handler.handle.return_value = ds
    return handler


@pytest.fixture
def mock_publish_service():
    service = MagicMock()
    service.publish_view.return_value = {
        "dataset_id": 99,
        "dataset_code": "view_v_sales",
        "sql_query": "SELECT 1",
        "field_count": 1,
        "source_view": "v_sales",
        "field_mappings": [],
        "updated_at": None,
        "published_at": "2026-03-12T12:00:00",
        "definition_hash": "abc123",
        "definition_summary": {"field_count": 1},
        "publish_status": "published",
        "action": "created",
    }
    service.get_publish_status.return_value = {
        "materialized": True,
        "publish_status": "published",
        "view_name": "v_sales",
        "dataset_id": 99,
        "dataset_code": "view_v_sales",
        "dataset_name": "销售视图",
        "sql_query": "SELECT 1",
        "updated_at": None,
        "published_at": "2026-03-12T12:00:00",
        "source_view": "v_sales",
        "field_mappings": [],
        "definition_hash": "abc123",
        "definition_summary": {"field_count": 1},
        "state_summary": {"publish_status": "published"},
    }
    service.get_batch_publish_status.return_value = {
        "v_sales": {
            "materialized": False,
            "publish_status": "unpublished",
        }
    }
    return service


@pytest.fixture
def mock_modeling_service():
    service = MagicMock()
    service.generate_cube_draft.return_value = {
        "name": "orders_draft",
        "title": "Orders Draft",
        "table": "ods.orders",
        "domain_id": "academic",
        "source_id": 1,
        "source_database": "mock_project",
        "status": "draft",
        "dimensions": {"id": {"title": "ID", "type": "string", "sql": "{CUBE}.id"}},
        "measures": {"total_count": {"title": "总数", "type": "count", "sql": "{CUBE}.id"}},
    }
    service.create_cube.return_value = MagicMock(model_dump=MagicMock(return_value={
        "name": "orders_draft",
        "title": "Orders Draft",
        "status": "draft",
    }))
    service.create_revision_draft.return_value = MagicMock(model_dump=MagicMock(return_value={
        "name": "orders__revision_draft",
        "title": "订单",
        "status": "draft",
    }))
    service.update_cube.return_value = MagicMock(model_dump=MagicMock(return_value={
        "name": "orders",
        "title": "订单",
        "status": "draft",
    }))
    service.activate_cube.return_value = MagicMock(model_dump=MagicMock(return_value={
        "name": "orders",
        "title": "订单",
        "status": "active",
    }))
    service.deprecate_cube.return_value = MagicMock(model_dump=MagicMock(return_value={
        "name": "orders",
        "title": "订单",
        "status": "deprecated",
    }))
    return service


@pytest.fixture
def mock_modeling_source_service():
    service = MagicMock()
    service.generate_cube_draft_from_source.return_value = {
        "name": "orders_draft",
        "title": "Orders Draft",
        "table": "ods.orders",
        "domain_id": "academic",
        "source_id": 1,
        "source_database": "mock_project",
        "status": "draft",
        "dimensions": {"id": {"title": "ID", "type": "string", "sql": "{CUBE}.id"}},
        "measures": {"total_count": {"title": "总数", "type": "count", "sql": "{CUBE}.id"}},
        "field_candidate_trace": {"draft_source_mode": "compatibility_facade"},
    }
    return service


@pytest.fixture
def mock_domain_modeling_service():
    service = MagicMock()
    service.list_domains.return_value = [
        {
            "id": "academic",
            "code": "academic",
            "name": "学业域",
            "catalog_code": "learning",
            "catalog_name": "学习分析",
            "status": "draft",
            "cube_count": 1,
            "state_summary": {"status": "draft"},
        }
    ]
    service.list_catalogs.return_value = [
        {
            "code": "learning",
            "name": "学习分析",
            "description": "学业和学习行为目录",
            "status": "active",
            "sort_order": 10,
            "domain_count": 1,
            "active_count": 0,
            "draft_count": 1,
            "domains": service.list_domains.return_value,
        }
    ]
    domain = MagicMock()
    draft_domain = {
        "id": "academic",
        "code": "academic",
        "name": "学业域",
        "catalog_code": "learning",
        "catalog_name": "学习分析",
        "status": "draft",
        "cubes": ["orders"],
        "state_summary": {"status": "draft"},
    }
    active_domain = {
        **draft_domain,
        "status": "active",
        "state_summary": {"status": "active"},
    }
    domain.model_dump.return_value = draft_domain
    service.create_domain.return_value = domain
    service.get_domain_detail.return_value = draft_domain
    service.update_domain.return_value = domain
    service.create_catalog.return_value = MagicMock(model_dump=MagicMock(return_value={
        "code": "learning",
        "name": "学习分析",
        "description": "学业和学习行为目录",
        "status": "active",
        "sort_order": 10,
    }))
    service.update_catalog.return_value = MagicMock(model_dump=MagicMock(return_value={
        "code": "learning",
        "name": "学习分析",
        "description": "学业和学习行为目录",
        "status": "archived",
        "sort_order": 10,
    }))
    service.delete_catalog.return_value = None
    service.add_cube.return_value = domain
    published = MagicMock()
    published.model_dump.return_value = active_domain
    service.publish_domain.return_value = published
    service.validate_domain.return_value = []
    service._domain_repo.reload.return_value = None
    return service


@pytest.fixture
def mock_domain_canvas_service():
    service = MagicMock()
    service.get_canvas.return_value = {
        "domain": {
            "id": "academic",
            "code": "academic",
            "name": "学业域",
            "status": "draft",
            "state_summary": {"status": "draft"},
        },
        "nodes": [],
        "edges": [],
        "library_cubes": [],
    }
    return service


@pytest.fixture
def mock_runtime_snapshot_service():
    service = MagicMock()
    service.get_active_manifest.return_value = {
        "ok": True,
        "version_pin": {
            "namespace": "default",
            "snapshot_id": "snap_1",
            "snapshot_status": "active",
            "release_id": "rel_1",
            "release_no": 3,
            "release_status": "published",
            "previous_release_id": "rel_0",
            "rollback_of_release_id": None,
            "manifest_schema_version": "semantic-runtime-manifest/v1",
            "asset_count": 2,
            "asset_revision_ids": ["rev_metric", "rev_cube"],
        },
        "asset_trace": [
            {"asset_key": "metric:comment_count", "revision_id": "rev_metric"},
            {"asset_key": "student_comment_cube", "revision_id": "rev_cube"},
        ],
        "binding_trace": {"schema_version": "semantic-runtime-manifest/v1", "count": 1},
        "policy_trace": {"schema_version": "semantic-runtime-manifest/v1", "count": 1},
    }
    return service


@pytest.fixture
def semantic_client(mock_semantic_service, mock_dataset_repo, mock_dataset_handler, mock_publish_service, mock_modeling_service, mock_modeling_source_service, mock_domain_modeling_service, mock_domain_canvas_service, mock_runtime_snapshot_service):
    """Create a minimal Flask app with only the semantic blueprint registered."""
    app = Flask(__name__)
    app.config["TESTING"] = True

    bp = create_semantic_blueprint(
        semantic_service=mock_semantic_service,
        publish_service=mock_publish_service,
        modeling_service=mock_modeling_service,
        modeling_source_service=mock_modeling_source_service,
        domain_modeling_service=mock_domain_modeling_service,
        domain_canvas_service=mock_domain_canvas_service,
        runtime_snapshot_service=mock_runtime_snapshot_service,
        dataset_repo=mock_dataset_repo,
        dataset_handler=mock_dataset_handler,
        query_adapter_getter=lambda: (MagicMock(), "mock_project"),
    )
    app.register_blueprint(bp)
    register_error_handlers(app)

    from tests.conftest import install_default_admin_auth
    return install_default_admin_auth(app.test_client())


# ============================================================================
# /cubes
# ============================================================================

def test_semantic_health_returns_runtime_snapshot_version_pin(semantic_client):
    resp = semantic_client.get("/api/v1/semantic/health")

    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert data["status"] == "healthy"
    assert data["runtime"]["manifest_status"] == "ready"
    assert data["runtime"]["version_pin"]["release_id"] == "rel_1"
    assert data["runtime"]["version_pin"]["release_no"] == 3
    assert data["runtime"]["asset_count"] == 2


class TestCubesEndpoint:
    def test_list_cubes_returns_200(self, semantic_client):
        resp = semantic_client.get("/api/v1/semantic/cubes")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["code"] == 0
        assert "cubes" in data["data"]
        assert data["data"]["total"] == 1
        assert data["data"]["cubes"][0]["domain_ids"] == ["academic"]

    def test_describe_cube_returns_200(self, semantic_client):
        resp = semantic_client.get("/api/v1/semantic/cubes/orders")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["data"]["name"] == "orders"
        assert data["data"]["domain_count"] == 1

    def test_describe_cube_not_found(self, semantic_client, mock_semantic_service):
        mock_semantic_service.describe_cube.return_value = {"error": "not found"}
        resp = semantic_client.get("/api/v1/semantic/cubes/ghost")
        assert resp.status_code == 404

    def test_draft_cube_from_source_returns_200(self, semantic_client, mock_modeling_source_service):
        resp = semantic_client.post(
            "/api/v1/semantic/cubes/draft-from-source",
            json={"source_kind": "physical_table", "source_id": 1, "database": "mock_project", "table": "orders"},
        )
        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert data["status"] == "draft"
        assert data["field_candidate_trace"]["draft_source_mode"] == "compatibility_facade"
        mock_modeling_source_service.generate_cube_draft_from_source.assert_called_once()

    def test_create_cube_returns_201(self, semantic_client, mock_modeling_service):
        resp = semantic_client.post(
            "/api/v1/semantic/cubes",
            json={"name": "orders_draft", "title": "Orders Draft", "table": "ods.orders", "domain_id": "academic", "source_id": 1, "dimensions": {"id": {"title": "ID", "type": "string", "sql": "{CUBE}.id"}}, "measures": {"total_count": {"title": "总数", "type": "count", "sql": "{CUBE}.id"}}},
        )
        assert resp.status_code == 201
        assert resp.get_json()["data"]["name"] == "orders_draft"

    def test_create_revision_route_returns_created_payload(self, semantic_client, mock_modeling_service):
        resp = semantic_client.post("/api/v1/semantic/cubes/orders/revisions")
        assert resp.status_code == 201
        assert resp.get_json()["data"]["name"] == "orders__revision_draft"
        assert resp.get_json()["data"]["status"] == "draft"
        mock_modeling_service.create_revision_draft.assert_called_once_with("orders")

    def test_create_cube_without_domain_id_returns_201(self, semantic_client, mock_modeling_service):
        resp = semantic_client.post(
            "/api/v1/semantic/cubes",
            json={"name": "orders_draft", "title": "Orders Draft", "table": "ods.orders", "source_id": 1, "dimensions": {"id": {"title": "ID", "type": "string", "sql": "{CUBE}.id"}}, "measures": {"total_count": {"title": "总数", "type": "count", "sql": "{CUBE}.id"}}},
        )
        assert resp.status_code == 201
        assert resp.get_json()["data"]["name"] == "orders_draft"
        called_payload = mock_modeling_service.create_cube.call_args_list[-1].args[0]
        assert "domain_id" not in called_payload

    def test_activate_cube_returns_200(self, semantic_client, mock_modeling_service):
        resp = semantic_client.post("/api/v1/semantic/cubes/orders/activate")
        assert resp.status_code == 200
        assert resp.get_json()["data"]["status"] == "active"
        mock_modeling_service.activate_cube.assert_called_once_with("orders")


class TestDomainsEndpoint:
    def test_list_catalogs_returns_200(self, semantic_client):
        resp = semantic_client.get("/api/v1/semantic/catalogs")
        assert resp.status_code == 200
        assert resp.get_json()["data"]["total"] == 1
        assert resp.get_json()["data"]["catalogs"][0]["code"] == "learning"

    def test_create_catalog_returns_201(self, semantic_client, mock_domain_modeling_service):
        resp = semantic_client.post(
            "/api/v1/semantic/catalogs",
            json={"code": "learning", "name": "学习分析"},
        )
        assert resp.status_code == 201
        assert resp.get_json()["data"]["code"] == "learning"
        mock_domain_modeling_service.create_catalog.assert_called_once_with({"code": "learning", "name": "学习分析"})

    def test_update_catalog_returns_200(self, semantic_client, mock_domain_modeling_service):
        resp = semantic_client.put(
            "/api/v1/semantic/catalogs/learning",
            json={"name": "学习分析", "status": "archived"},
        )
        assert resp.status_code == 200
        assert resp.get_json()["data"]["status"] == "archived"
        mock_domain_modeling_service.update_catalog.assert_called_once_with(
            "learning",
            {"name": "学习分析", "status": "archived"},
        )

    def test_delete_catalog_returns_200(self, semantic_client, mock_domain_modeling_service):
        resp = semantic_client.delete("/api/v1/semantic/catalogs/learning")
        assert resp.status_code == 200
        assert resp.get_json()["data"]["code"] == "learning"
        mock_domain_modeling_service.delete_catalog.assert_called_once_with("learning")

    def test_list_domains_returns_200(self, semantic_client):
        resp = semantic_client.get("/api/v1/semantic/domains")
        assert resp.status_code == 200
        assert resp.get_json()["data"]["total"] == 1

    def test_create_domain_returns_201_with_draft(self, semantic_client, mock_domain_modeling_service):
        resp = semantic_client.post("/api/v1/semantic/domains", json={"name": "答题分析"})
        assert resp.status_code == 201
        assert resp.get_json()["data"]["status"] == "draft"
        mock_domain_modeling_service.create_domain.assert_called_once_with({"name": "答题分析"})

    def test_get_domain_canvas_returns_200(self, semantic_client):
        resp = semantic_client.get("/api/v1/semantic/domains/academic/canvas")
        assert resp.status_code == 200
        assert resp.get_json()["data"]["domain"]["code"] == "academic"

    def test_domain_context_preview_returns_candidate_scope(self, semantic_client, mock_domain_modeling_service):
        mock_domain_modeling_service.get_domain_context_preview.return_value = {
            "domain": {"code": "academic", "name": "学业域"},
            "role": "business_context",
            "candidate_scope": {
                "cube_refs": ["orders"],
                "ontology_refs": {"objects": ["order"], "metrics": ["order_count"]},
            },
            "default_context": {"time_dimension": "created_at"},
            "agent_hints": {"priority_terms": ["订单"]},
            "execution_truth_source": "cube",
        }

        resp = semantic_client.post("/api/v1/semantic/domains/academic/context-preview")

        assert resp.status_code == 200
        assert resp.get_json()["data"]["role"] == "business_context"
        assert resp.get_json()["data"]["execution_truth_source"] == "cube"
        mock_domain_modeling_service.get_domain_context_preview.assert_called_once_with("academic")

    def test_publish_domain_returns_200(self, semantic_client, mock_domain_modeling_service):
        mock_domain_modeling_service.get_domain_detail.return_value = {
            "id": "academic",
            "code": "academic",
            "name": "学业域",
            "status": "active",
            "cubes": ["orders"],
            "state_summary": {"status": "active"},
        }
        resp = semantic_client.post(
            "/api/v1/semantic/domains/academic/publish",
            json={"cubes": ["orders"]},
        )
        assert resp.status_code == 200
        assert resp.get_json()["data"]["status"] == "active"
        mock_domain_modeling_service.publish_domain.assert_called_once_with(
            "academic",
            cubes=["orders"],
        )

    def test_publish_domain_duplicate_returns_400(self, semantic_client, mock_domain_modeling_service):
        mock_domain_modeling_service.publish_domain.side_effect = Exception("领域发布失败: 当前资产范围与领域 'academic' 完全重复")
        resp = semantic_client.post(
            "/api/v1/semantic/domains/academic/publish",
            json={"cubes": ["orders"]},
        )
        assert resp.status_code == 400
        assert "资产范围" in resp.get_json()["message"]


# ============================================================================
# /views
# ============================================================================

class TestViewsEndpoint:
    def test_list_views_returns_200(self, semantic_client):
        resp = semantic_client.get("/api/v1/semantic/views")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["data"]["total"] == 1
        assert data["data"]["views"][0]["name"] == "v_sales"
        assert data["data"]["views"][0]["publish_summary"]["publish_status"] == "unpublished"
        assert data["data"]["views"][0]["state_summary"]["object_type"] == "view"

    def test_describe_view_returns_200(self, semantic_client):
        resp = semantic_client.get("/api/v1/semantic/views/v_sales")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["data"]["name"] == "v_sales"

    def test_describe_view_not_found(self, semantic_client, mock_semantic_service):
        mock_semantic_service.describe_view.return_value = {"error": "not found"}
        resp = semantic_client.get("/api/v1/semantic/views/ghost")
        assert resp.status_code == 404

    def test_materialize_view_creates_new_dataset(
        self, semantic_client, mock_publish_service
    ):
        resp = semantic_client.post(
            "/api/v1/semantic/views/v_sales/materialize",
            json={"source_id": 1},
        )
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["data"]["action"] == "created"
        assert data["data"]["source_view"] == "v_sales"
        assert data["data"]["publish_status"] == "published"
        mock_publish_service.publish_view.assert_called_once_with("v_sales", source_id=1)

    def test_materialize_view_updates_existing_dataset(
        self, semantic_client, mock_publish_service
    ):
        mock_publish_service.publish_view.return_value = {
            **mock_publish_service.publish_view.return_value,
            "action": "updated",
        }

        resp = semantic_client.post(
            "/api/v1/semantic/views/v_sales/materialize",
            json={},
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["data"]["action"] == "updated"
        assert data["data"]["source_view"] == "v_sales"

    def test_materialize_status_not_materialized(self, semantic_client, mock_publish_service):
        mock_publish_service.get_publish_status.return_value = {
            "materialized": False,
            "publish_status": "unpublished",
            "view_name": "v_sales",
        }
        resp = semantic_client.get("/api/v1/semantic/views/v_sales/materialize-status")
        assert resp.status_code == 200
        assert resp.get_json()["data"]["materialized"] is False

    def test_batch_materialize_status(self, semantic_client):
        resp = semantic_client.get("/api/v1/semantic/views/materialize-status")
        assert resp.status_code == 200
        result = resp.get_json()["data"]
        assert "v_sales" in result
        assert result["v_sales"]["materialized"] is False


# ============================================================================
# /compile
# ============================================================================

class TestCompileEndpoint:
    def test_compile_valid_dsl(self, semantic_client, mock_semantic_service):
        compiled = MagicMock()
        compiled.sql = "SELECT * FROM orders"
        compiled.primary_cube = "orders"
        compiled.joined_cubes = []
        mock_semantic_service.compile_query.return_value = compiled

        resp = semantic_client.post(
            "/api/v1/semantic/compile",
            json={"dsl": {"dimensions": ["orders.id"]}},
        )
        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert "sql" in data
        assert "SELECT" in data["sql"]

    def test_compile_missing_dsl_field(self, semantic_client):
        resp = semantic_client.post(
            "/api/v1/semantic/compile",
            json={"other": "value"},
        )
        assert resp.status_code != 200 or resp.get_json()["code"] != 0

    def test_compile_empty_body(self, semantic_client):
        resp = semantic_client.post("/api/v1/semantic/compile")
        assert resp.status_code != 200 or resp.get_json()["code"] != 0

    def test_compile_exception_returns_error(self, semantic_client, mock_semantic_service):
        mock_semantic_service.compile_query.side_effect = ValueError("bad dsl")
        resp = semantic_client.post(
            "/api/v1/semantic/compile",
            json={"dsl": {"dimensions": []}},
        )
        data = resp.get_json()
        assert data["code"] != 0 or resp.status_code != 200


class TestQueryEndpoint:
    def test_query_valid_dsl(self, semantic_client, mock_semantic_service):
        resp = semantic_client.post(
            "/api/v1/semantic/query",
            json={"dsl": {"measures": ["orders.count"]}},
        )

        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert data["row_count"] == 1
        assert data["primary_cube"] == "orders"

    def test_query_returns_error_details(self, semantic_client, mock_semantic_service):
        mock_semantic_service.query.return_value = {
            "error": "DSL 编译失败",
            "hint": "bad query",
            "retryable": True,
        }
        resp = semantic_client.post(
            "/api/v1/semantic/query",
            json={"dsl": {"measures": ["orders.count"]}},
        )

        assert resp.status_code == 400
        payload = resp.get_json()
        assert payload["details"]["hint"] == "bad query"


# ============================================================================
# /graph
# ============================================================================

class TestGraphEndpoint:
    def test_graph_returns_nodes_and_edges(self, semantic_client, mock_semantic_service):
        cube = _make_cube()
        mock_semantic_service._cube_repo.list_all.return_value = [cube]
        resp = semantic_client.get("/api/v1/semantic/graph")
        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert "nodes" in data
        assert "edges" in data


# ============================================================================
# /recipes
# ============================================================================

class TestRecipesEndpoint:
    def test_list_recipes_returns_200(self, semantic_client):
        resp = semantic_client.get("/api/v1/semantic/recipes")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["data"]["total"] == 1
        assert data["data"]["recipes"][0]["related_cubes"] == ["orders"]
        assert data["data"]["recipes"][0]["state_summary"]["object_type"] == "recipe"
