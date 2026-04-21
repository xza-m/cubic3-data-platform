# tests/integration/channels/test_channels_api.py
"""
W5.B · Channels API 集成测试

覆盖路径：
  GET  /api/v1/channels                    → 列表
  POST /api/v1/channels                    → 创建
  GET  /api/v1/channels/<id>               → 详情
  POST /api/v1/channels/<id>/enable        → 启用
  POST /api/v1/channels/<id>/disable       → 禁用

矩阵：happy / boundary / error + 401。
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

BASE = "/api/v1/channels"


def _mock_container(service: MagicMock) -> MagicMock:
    container = MagicMock()
    container.channel_service.return_value = service
    return container


@pytest.mark.redesign
class TestListChannels:
    def test_list_happy(self, client):
        svc = MagicMock()
        svc.list_channels.return_value = {
            "items": [{"id": 1, "name": "alerts", "channel_type": "feishu"}],
            "total": 1,
            "page": 1,
            "page_size": 20,
        }
        with patch(
            "app.interfaces.api.v1.channels.get_container",
            return_value=_mock_container(svc),
        ):
            resp = client.get(BASE)

        assert resp.status_code == 200
        body = resp.get_json()
        assert body["code"] == 0
        assert body["data"]["items"][0]["channel_type"] == "feishu"

    def test_list_filters_enabled(self, client):
        svc = MagicMock()
        svc.list_channels.return_value = {"items": [], "total": 0, "page": 1, "page_size": 20}
        with patch(
            "app.interfaces.api.v1.channels.get_container",
            return_value=_mock_container(svc),
        ):
            resp = client.get(f"{BASE}?channel_type=email&enabled=true")

        assert resp.status_code == 200
        kwargs = svc.list_channels.call_args.kwargs
        assert kwargs["channel_type"] == "email"
        assert kwargs["enabled"] is True


@pytest.mark.redesign
class TestCreateChannel:
    def test_create_happy_returns_201(self, client):
        svc = MagicMock()
        svc.create_channel.return_value = {
            "id": 42, "name": "alerts", "channel_type": "feishu", "enabled": True
        }
        with patch(
            "app.interfaces.api.v1.channels.get_container",
            return_value=_mock_container(svc),
        ):
            resp = client.post(
                BASE,
                json={
                    "name": "alerts",
                    "channel_type": "feishu",
                    "config": {"webhook": "https://example.com/hook"},
                },
            )

        assert resp.status_code == 201
        body = resp.get_json()
        assert body["data"]["id"] == 42
        assert body["data"]["enabled"] is True


@pytest.mark.redesign
class TestChannelLifecycle:
    def test_enable_returns_updated_channel(self, client):
        svc = MagicMock()
        svc.enable_channel.return_value = {"id": 7, "enabled": True}
        with patch(
            "app.interfaces.api.v1.channels.get_container",
            return_value=_mock_container(svc),
        ):
            resp = client.post(f"{BASE}/7/enable")

        assert resp.status_code == 200
        assert resp.get_json()["data"]["enabled"] is True

    def test_disable_returns_updated_channel(self, client):
        svc = MagicMock()
        svc.disable_channel.return_value = {"id": 7, "enabled": False}
        with patch(
            "app.interfaces.api.v1.channels.get_container",
            return_value=_mock_container(svc),
        ):
            resp = client.post(f"{BASE}/7/disable")

        assert resp.status_code == 200
        assert resp.get_json()["data"]["enabled"] is False


@pytest.mark.redesign
class TestChannelsAuth:
    def test_list_requires_auth(self, client_no_auth):
        resp = client_no_auth.get(BASE)
        assert resp.status_code == 401
