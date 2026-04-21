# tests/integration/semantic/test_cube_list_derivatives.py
"""
B-back-7 集成测试：Cube 列表派生字段。

覆盖：
  - happy:    cube list 返回四个派生字段
  - boundary: dimension_count=0、downstream_bi_count=0（无关联表）
  - error:    CubeListingService 异常时降级为普通 list_cubes
  - perf:     100 cube P95 ≤ 300ms（基准压测，使用 timeit / time 计时）

@pytest.mark.redesign
"""
import time
import pytest
from unittest.mock import MagicMock, patch
from flask import Flask

from app.interfaces.api.v1.semantic import create_semantic_blueprint
from app.interfaces.api.middleware.error_handler import register_error_handlers
from app.application.semantic.cube_listing_service import CubeListingService


# ============================================================================
# Helper factories
# ============================================================================

def _make_cube_dict(name: str, dim: int = 3, meas: int = 2) -> dict:
    return {
        "name": name,
        "title": f"Cube {name}",
        "description": "",
        "dimension_count": dim,
        "measure_count": meas,
        "join_count": 0,
        "status": "active",
        "domain_id": None,
        "domain_name": None,
        "domain_ids": [],
        "domains": [],
        "domain_count": 0,
        "source_id": None,
        "source_database": None,
        "source_schema": None,
        "state_summary": {},
        "sync_status": None,
    }


def _make_semantic_service(n: int = 5):
    svc = MagicMock()
    svc.list_cubes.return_value = [_make_cube_dict(f"cube_{i}", dim=i, meas=i + 1) for i in range(n)]
    svc.list_views.return_value = []
    svc.list_view_summaries = MagicMock(return_value=[])
    svc.describe_cube.return_value = {"name": "cube_0"}
    svc._cube_repo = MagicMock()
    svc._cube_repo._dir = None
    svc.invalidate_cache = MagicMock()
    return svc


def _make_publish_service():
    ps = MagicMock()
    ps.get_publish_status.return_value = {"status": "idle"}
    ps.get_batch_publish_status.return_value = {}
    return ps


@pytest.fixture
def app_5cubes():
    flask_app = Flask(__name__)
    flask_app.config["TESTING"] = True
    svc = _make_semantic_service(n=5)
    bp = create_semantic_blueprint(
        semantic_service=svc,
        dataset_repo=MagicMock(),
        dataset_handler=MagicMock(),
        publish_service=_make_publish_service(),
    )
    flask_app.register_blueprint(bp)
    register_error_handlers(flask_app)
    return flask_app


@pytest.fixture
def client_5(app_5cubes):
    from tests.conftest import install_default_admin_auth
    return install_default_admin_auth(app_5cubes.test_client())


# ============================================================================
# Tests
# ============================================================================

@pytest.mark.redesign
class TestCubeListDerivativeFields:

    def test_cube_list_has_derivative_fields(self, client_5):
        """Happy: 每条 cube 含四个派生字段。"""
        resp = client_5.get("/api/v1/semantic/cubes")
        assert resp.status_code == 200
        body = resp.get_json()
        cubes = body["data"]["cubes"]
        assert len(cubes) > 0
        for cube in cubes:
            assert "dimension_count" in cube, f"cube {cube['name']} 缺少 dimension_count"
            assert "measure_count" in cube, f"cube {cube['name']} 缺少 measure_count"
            assert "downstream_bi_count" in cube, f"cube {cube['name']} 缺少 downstream_bi_count"
            assert "last_modified_at" in cube, f"cube {cube['name']} 缺少 last_modified_at"

    def test_downstream_bi_count_is_int(self, client_5):
        """Happy: downstream_bi_count 为整数（当前无关联表则为 0）。"""
        resp = client_5.get("/api/v1/semantic/cubes")
        cubes = resp.get_json()["data"]["cubes"]
        for cube in cubes:
            assert isinstance(cube["downstream_bi_count"], int)

    def test_dimension_count_matches_value(self, client_5):
        """Boundary: dimension_count 与底层数据一致。"""
        resp = client_5.get("/api/v1/semantic/cubes")
        cubes = resp.get_json()["data"]["cubes"]
        # cube_0 有 dim=0，cube_1 有 dim=1，...
        counts = {c["name"]: c["dimension_count"] for c in cubes}
        for i in range(5):
            assert counts.get(f"cube_{i}") == i

    def test_no_n_plus_1_queries(self):
        """Boundary: CubeListingService 仅调用一次 list_cubes。"""
        svc = _make_semantic_service(n=10)
        listing_svc = CubeListingService(semantic_service=svc)
        listing_svc.list_cubes_with_derivatives()
        svc.list_cubes.assert_called_once()

    def test_fallback_on_listing_service_error(self):
        """Error: CubeListingService 抛异常时，路由降级为原始 list_cubes。"""
        flask_app = Flask(__name__)
        flask_app.config["TESTING"] = True
        svc = _make_semantic_service(n=3)
        err_listing = MagicMock(spec=CubeListingService)
        err_listing.list_cubes_with_derivatives.side_effect = RuntimeError("模拟失败")
        bp = create_semantic_blueprint(
            semantic_service=svc,
            dataset_repo=MagicMock(),
            dataset_handler=MagicMock(),
            publish_service=_make_publish_service(),
            cube_listing_service=err_listing,
        )
        flask_app.register_blueprint(bp)
        register_error_handlers(flask_app)
        from tests.conftest import install_default_admin_auth
        resp = install_default_admin_auth(flask_app.test_client()).get("/api/v1/semantic/cubes")
        assert resp.status_code == 200
        cubes = resp.get_json()["data"]["cubes"]
        assert len(cubes) == 3  # 降级成功，结果仍然有数据


@pytest.mark.redesign
class TestCubeListPerformance:
    """P95 ≤ 300ms 基准测试（100 cube 内存操作）。"""

    def test_p95_under_300ms_for_100_cubes(self):
        """Perf: 100 cube 派生字段计算 P95 ≤ 300ms。"""
        svc = _make_semantic_service(n=100)
        listing_svc = CubeListingService(semantic_service=svc, cubes_dir=None)

        N_RUNS = 30
        durations = []
        for _ in range(N_RUNS):
            start = time.perf_counter()
            listing_svc.list_cubes_with_derivatives()
            durations.append((time.perf_counter() - start) * 1000)

        durations.sort()
        p95_idx = int(N_RUNS * 0.95) - 1
        p95_ms = durations[max(0, p95_idx)]

        assert p95_ms < 300, (
            f"P95 ({p95_ms:.1f}ms) 超出 300ms 目标。"
            f"各轮耗时（ms）: min={durations[0]:.1f}, max={durations[-1]:.1f}"
        )

    def test_last_modified_at_none_when_no_dir(self):
        """Boundary: cubes_dir=None 时 last_modified_at 为 None（而非异常）。"""
        svc = _make_semantic_service(n=3)
        listing_svc = CubeListingService(semantic_service=svc, cubes_dir=None)
        result = listing_svc.list_cubes_with_derivatives()
        for cube in result:
            assert cube["last_modified_at"] is None
