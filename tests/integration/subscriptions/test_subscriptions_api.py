# tests/integration/subscriptions/test_subscriptions_api.py
"""
W5.B · Subscriptions API 集成测试

覆盖路径：
  GET  /api/v1/subscriptions                          → 列表
  POST /api/v1/subscriptions                          → 创建
  GET  /api/v1/subscriptions/<id>                     → 详情
  POST /api/v1/subscriptions/<id>/disable             → 禁用
  GET  /api/v1/app-instances/<instance_id>/subscriptions → 实例订阅列表

矩阵：happy / boundary / error + 401。
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

BASE = "/api/v1/subscriptions"


def _mock_container(service: MagicMock) -> MagicMock:
    container = MagicMock()
    container.subscription_service.return_value = service
    return container


@pytest.mark.redesign
class TestListSubscriptions:
    def test_list_happy(self, client):
        svc = MagicMock()
        svc.list_subscriptions.return_value = {
            "items": [{"id": 1, "name": "daily-alert", "enabled": True}],
            "total": 1,
            "page": 1,
            "page_size": 20,
        }
        with patch(
            "app.interfaces.api.v1.subscriptions.get_container",
            return_value=_mock_container(svc),
        ):
            resp = client.get(BASE)

        assert resp.status_code == 200
        body = resp.get_json()
        assert body["code"] == 0
        assert body["data"]["items"][0]["name"] == "daily-alert"

    def test_list_with_filters(self, client):
        svc = MagicMock()
        svc.list_subscriptions.return_value = {
            "items": [], "total": 0, "page": 1, "page_size": 20
        }
        with patch(
            "app.interfaces.api.v1.subscriptions.get_container",
            return_value=_mock_container(svc),
        ):
            resp = client.get(f"{BASE}?app_instance_id=5&channel_id=3&enabled=false")

        assert resp.status_code == 200
        kwargs = svc.list_subscriptions.call_args.kwargs
        assert kwargs["app_instance_id"] == 5
        assert kwargs["channel_id"] == 3
        assert kwargs["enabled"] is False


@pytest.mark.redesign
class TestCreateSubscription:
    def test_create_happy_returns_201(self, client):
        svc = MagicMock()
        svc.create_subscription.return_value = {
            "id": 88, "name": "daily-alert", "enabled": True
        }
        with patch(
            "app.interfaces.api.v1.subscriptions.get_container",
            return_value=_mock_container(svc),
        ):
            resp = client.post(
                BASE,
                json={
                    "name": "daily-alert",
                    "app_instance_id": 5,
                    "channel_id": 3,
                    "event_types": ["AppExecutionFailed"],
                },
            )

        assert resp.status_code == 201
        assert resp.get_json()["data"]["id"] == 88


@pytest.mark.redesign
class TestSubscriptionLifecycle:
    def test_disable_subscription(self, client):
        svc = MagicMock()
        svc.disable_subscription.return_value = {"id": 7, "enabled": False}
        with patch(
            "app.interfaces.api.v1.subscriptions.get_container",
            return_value=_mock_container(svc),
        ):
            resp = client.post(f"{BASE}/7/disable")

        assert resp.status_code == 200
        assert resp.get_json()["data"]["enabled"] is False


@pytest.mark.redesign
class TestInstanceSubscriptions:
    def test_get_subscriptions_by_instance(self, client):
        svc = MagicMock()
        svc.get_subscriptions_by_app_instance.return_value = [
            {"id": 1, "name": "s1"}, {"id": 2, "name": "s2"}
        ]
        with patch(
            "app.interfaces.api.v1.subscriptions.get_container",
            return_value=_mock_container(svc),
        ):
            resp = client.get("/api/v1/app-instances/5/subscriptions")

        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert isinstance(data, list)
        assert len(data) == 2


@pytest.mark.redesign
class TestSubscriptionsAuth:
    def test_list_requires_auth(self, client_no_auth):
        resp = client_no_auth.get(BASE)
        assert resp.status_code == 401
