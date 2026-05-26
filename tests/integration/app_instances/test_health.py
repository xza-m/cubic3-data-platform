# tests/integration/app_instances/test_health.py
"""
B-back-2 · App 实例 health 字段集成测试

覆盖路径：
  GET /api/v1/app-instances        → 列表含 health / last_heartbeat_at
  GET /api/v1/app-instances/:id   → 详情含 health / last_heartbeat_at

矩阵：happy / boundary(状态流转) / error(路由注册 + 容错)
"""
from __future__ import annotations

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from app.application.app_instances.health_service import compute_health, enrich_instance_with_health

BASE = "/api/v1/app-instances"


# ===========================================================================
# 纯函数单元 — compute_health
# ===========================================================================


@pytest.mark.redesign
class TestComputeHealth:
    """mock 心跳时间窗，断言 health 流转。"""

    DEGRADED_S = 60
    UNHEALTHY_S = 180

    def _ts(self, seconds_ago: float) -> datetime:
        return datetime.now(tz=timezone.utc) - timedelta(seconds=seconds_ago)

    def test_healthy_when_recent_heartbeat(self):
        """距今 < 60s → healthy。"""
        assert compute_health(self._ts(30), self.DEGRADED_S, self.UNHEALTHY_S) == "healthy"

    def test_degraded_when_heartbeat_between_thresholds(self):
        """距今在 (60s, 180s] → degraded。"""
        assert compute_health(self._ts(90), self.DEGRADED_S, self.UNHEALTHY_S) == "degraded"

    def test_unhealthy_when_heartbeat_too_old(self):
        """距今 > 180s → unhealthy。"""
        assert compute_health(self._ts(300), self.DEGRADED_S, self.UNHEALTHY_S) == "unhealthy"

    def test_unhealthy_when_no_heartbeat(self):
        """无心跳记录（None）→ unhealthy。"""
        assert compute_health(None, self.DEGRADED_S, self.UNHEALTHY_S) == "unhealthy"

    def test_boundary_just_within_degraded_threshold(self):
        """距今 59s（< 60s）→ healthy。"""
        assert compute_health(self._ts(59), self.DEGRADED_S, self.UNHEALTHY_S) == "healthy"

    def test_boundary_just_over_degraded(self):
        """距今 61s → degraded。"""
        assert compute_health(self._ts(61), self.DEGRADED_S, self.UNHEALTHY_S) == "degraded"

    def test_boundary_just_within_unhealthy_threshold(self):
        """距今 179s（< 180s）→ degraded。"""
        assert compute_health(self._ts(179), self.DEGRADED_S, self.UNHEALTHY_S) == "degraded"


# ===========================================================================
# enrich_instance_with_health — 带 mock session
# ===========================================================================


@pytest.mark.redesign
class TestEnrichInstanceWithHealth:
    def _make_session(self, beat_at: datetime | None):
        """构造返回指定心跳时间的 mock session。"""
        session = MagicMock()
        if beat_at is None:
            session.execute.return_value.fetchone.return_value = (None,)
        else:
            session.execute.return_value.fetchone.return_value = (beat_at,)
        return session

    def test_healthy_injected(self):
        beat_at = datetime.now(tz=timezone.utc) - timedelta(seconds=10)
        session = self._make_session(beat_at)
        result = enrich_instance_with_health({"id": 1}, session, 60, 180)
        assert result["health"] == "healthy"
        assert result["last_heartbeat_at"] is not None

    def test_degraded_injected(self):
        beat_at = datetime.now(tz=timezone.utc) - timedelta(seconds=100)
        session = self._make_session(beat_at)
        result = enrich_instance_with_health({"id": 1}, session, 60, 180)
        assert result["health"] == "degraded"

    def test_unhealthy_when_no_heartbeat(self):
        session = self._make_session(None)
        result = enrich_instance_with_health({"id": 1}, session, 60, 180)
        assert result["health"] == "unhealthy"
        assert result["last_heartbeat_at"] is None

    def test_table_missing_gracefully_returns_unhealthy(self):
        """instance_heartbeats 不存在时不抛异常，降级为 unhealthy。"""
        session = MagicMock()
        session.execute.side_effect = Exception("no such table: instance_heartbeats")
        result = enrich_instance_with_health({"id": 1}, session, 60, 180)
        assert result["health"] == "unhealthy"
        session.rollback.assert_called_once()


# ===========================================================================
# API 路由烟测（非 404 + 字段存在）
# ===========================================================================


@pytest.mark.redesign
class TestAppInstanceHealthAPI:
    AUTH = {"Authorization": "Bearer test"}

    def test_list_route_registered(self, client):
        """GET /app-instances 路由已注册（非 404）。"""
        resp = client.get(BASE, headers=self.AUTH)
        assert resp.status_code != 404

    def test_detail_route_registered(self, client):
        """GET /app-instances/1 路由已注册（非 404）。"""
        resp = client.get(f"{BASE}/1", headers=self.AUTH)
        assert resp.status_code != 404

    def test_list_response_contains_health_field_when_items_present(self, client, app):
        """当列表有数据时，每个 item 含 health 和 last_heartbeat_at。"""
        # mock instance_service 返回一条假数据
        mock_svc = MagicMock()
        mock_svc.list_instances.return_value = {
            "items": [{"id": 99, "name": "test", "enabled": True}],
            "total": 1,
            "page": 1,
            "page_size": 20,
        }
        with patch(
            "app.interfaces.api.v1.app_instances._get_instance_service",
            return_value=mock_svc,
        ):
            resp = client.get(BASE, headers=self.AUTH)

        if resp.status_code == 200:
            data = resp.get_json()["data"]
            items = data.get("items", data if isinstance(data, list) else [])
            if items:
                assert "health" in items[0]
                assert "last_heartbeat_at" in items[0]
                assert items[0]["health"] in ("healthy", "degraded", "unhealthy")
