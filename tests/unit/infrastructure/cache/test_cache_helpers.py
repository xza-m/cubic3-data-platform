from unittest.mock import MagicMock, patch

import pytest

from app.infrastructure.cache.decorators import (
    _generate_cache_key,
    _serialize_result,
    invalidate_cache,
    query_cache,
)
from app.infrastructure.cache.redis_client import RedisClient


class ModelDumpItem:
    def __init__(self, payload):
        self.payload = payload

    def model_dump(self):
        return self.payload


class DictItem:
    def __init__(self, payload):
        self.payload = payload

    def dict(self):
        return self.payload


class TestCacheDecorators:
    def test_query_cache_returns_cached_value_without_calling_function(self):
        redis_client = MagicMock(get=MagicMock(return_value={"cached": True}))

        @query_cache("list_tasks", ttl=30)
        def _query():
            raise AssertionError("cache hit 时不应执行函数")

        with patch("app.infrastructure.cache.decorators.get_redis_client", return_value=redis_client):
            result = _query()

        assert result == {"cached": True}
        redis_client.set.assert_not_called()

    def test_query_cache_serializes_result_and_writes_cache_on_miss(self):
        redis_client = MagicMock(get=MagicMock(return_value=None))
        payload = {"items": [ModelDumpItem({"id": 1}), DictItem({"id": 2}), {"id": 3}]}

        @query_cache("list_tasks", ttl=30)
        def _query():
            return payload

        with patch("app.infrastructure.cache.decorators.get_redis_client", return_value=redis_client):
            result = _query()

        assert result is payload
        redis_client.set.assert_called_once()
        stored_value = redis_client.set.call_args.args[1]
        assert stored_value["items"] == [{"id": 1}, {"id": 2}, {"id": 3}]

    def test_invalidate_cache_deletes_pattern_after_call(self):
        redis_client = MagicMock()

        @invalidate_cache("tasks:*")
        def _command():
            return "done"

        with patch("app.infrastructure.cache.decorators.get_redis_client", return_value=redis_client):
            result = _command()

        assert result == "done"
        redis_client.delete_pattern.assert_called_once_with("tasks:*")

    def test_generate_cache_key_is_stable_for_sorted_kwargs(self):
        key_a = _generate_cache_key("prefix", ("a",), {"b": 2, "a": 1})
        key_b = _generate_cache_key("prefix", ("a",), {"a": 1, "b": 2})

        assert key_a == key_b
        assert key_a.startswith("query_cache:prefix:")

    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            ({"items": [ModelDumpItem({"id": 1}), DictItem({"id": 2}), {"id": 3}]}, {"items": [{"id": 1}, {"id": 2}, {"id": 3}]}),
            (ModelDumpItem({"id": 10}), {"id": 10}),
            (DictItem({"id": 20}), {"id": 20}),
            ("plain", "plain"),
        ],
    )
    def test_serialize_result_covers_supported_shapes(self, value, expected):
        assert _serialize_result(value) == expected


class TestRedisClient:
    def test_client_property_uses_configured_url(self, app):
        app.config["REDIS_URL"] = "redis://localhost:6379/9"

        with app.app_context():
            with patch("app.infrastructure.cache.redis_client.redis.from_url", return_value=MagicMock()) as mock_from_url:
                client = RedisClient()
                _ = client.client
                _ = client.client

        mock_from_url.assert_called_once_with(
            "redis://localhost:6379/9",
            decode_responses=True,
            socket_timeout=10,
            socket_connect_timeout=10,
            socket_keepalive=True,
            retry_on_timeout=False,
            max_connections=50,
        )

    def test_get_returns_json_or_none(self, app):
        with app.app_context():
            backend = MagicMock()
            backend.get.side_effect = ['{"ok": true}', None, RuntimeError("boom")]
            client = RedisClient("redis://localhost:6379/1")
            client._client = backend

            assert client.get("k1") == {"ok": True}
            assert client.get("k2") is None
            assert client.get("k3") is None

    def test_set_delete_exists_ttl_and_pattern_cover_success_and_failure(self, app):
        with app.app_context():
            backend = MagicMock()
            backend.keys.return_value = ["a", "b"]
            backend.exists.return_value = 1
            backend.ttl.return_value = 120
            client = RedisClient("redis://localhost:6379/1")
            client._client = backend

            client.set("k1", {"ok": True}, ttl=10)
            client.delete("k1")
            client.delete_pattern("cache:*")
            assert client.exists("k1") is True
            assert client.ttl("k1") == 120
            backend.setex.assert_called_once()
            backend.delete.assert_any_call("k1")
            backend.delete.assert_any_call("a", "b")

            backend.setex.side_effect = RuntimeError("set failed")
            backend.delete.side_effect = RuntimeError("delete failed")
            backend.keys.side_effect = RuntimeError("keys failed")
            backend.exists.side_effect = RuntimeError("exists failed")
            backend.ttl.side_effect = RuntimeError("ttl failed")

            client.set("k2", {"ok": True})
            client.delete("k2")
            client.delete_pattern("cache:*")
            assert client.exists("k2") is False
            assert client.ttl("k2") == -2
