"""in-process CLI 命令 wiring 单测（CliRunner + 桩容器，不 boot 真实 app）。

通过 monkeypatch bootstrap.app_context 注入桩容器，验证：命令→服务→envelope/退出码 接缝。
"""
from __future__ import annotations

import contextlib
import json
import types

import pytest
from click.testing import CliRunner

from app.interfaces.cli.root import cli


@pytest.fixture
def runner():
    return CliRunner()


@pytest.fixture
def patch_ctx(monkeypatch):
    def _apply(container):
        @contextlib.contextmanager
        def _fake_app_context():
            yield (object(), container)

        monkeypatch.setattr("app.interfaces.cli.bootstrap.app_context", _fake_app_context)

    return _apply


def _container(**providers):
    """providers: name -> 已构造服务对象；包成无参 provider（container.x() 取用）。"""
    ns = types.SimpleNamespace()
    for name, service in providers.items():
        setattr(ns, name, (lambda s=service: s))
    return ns


def _payload(result):
    return json.loads(result.output)


class _FakeEntity:
    def __init__(self, data):
        self._data = data

    def to_dict(self, mask_sensitive=True):
        out = dict(self._data)
        out["_masked"] = mask_sensitive
        return out


# --- datasource ---------------------------------------------------------------

def test_datasource_list_serializes_entities(runner, patch_ctx):
    handler = types.SimpleNamespace(
        handle=lambda q: {"items": [_FakeEntity({"id": 1, "name": "x"})], "total": 1, "page": 1}
    )
    patch_ctx(_container(list_datasources_handler=handler))
    result = runner.invoke(cli, ["datasource", "list"])
    assert result.exit_code == 0
    data = _payload(result)["data"]
    assert data["items"][0]["name"] == "x"
    assert data["items"][0]["_masked"] is True  # mask_sensitive=True 透传


def test_datasource_show_not_found_exit4(runner, patch_ctx):
    handler = types.SimpleNamespace(handle=lambda q: None)
    patch_ctx(_container(get_datasource_handler=handler))
    result = runner.invoke(cli, ["datasource", "show", "999"])
    assert result.exit_code == 4
    assert _payload(result)["code"] == -1


# --- cube ---------------------------------------------------------------------

def test_cube_show_filters_list_zero_write(runner, patch_ctx):
    called = {"describe": 0}

    def describe_cube(name):  # 不应被 show 调用（show 走 list_cubes，零写）
        called["describe"] += 1
        return {}

    svc = types.SimpleNamespace(
        list_cubes=lambda: [{"name": "a"}, {"name": "b"}],
        describe_cube=describe_cube,
    )
    patch_ctx(_container(semantic_definition_service=svc))
    result = runner.invoke(cli, ["cube", "show", "b"])
    assert result.exit_code == 0
    assert _payload(result)["data"]["name"] == "b"
    assert called["describe"] == 0


def test_cube_show_not_found_exit4(runner, patch_ctx):
    svc = types.SimpleNamespace(list_cubes=lambda: [{"name": "a"}])
    patch_ctx(_container(semantic_definition_service=svc))
    result = runner.invoke(cli, ["cube", "show", "zzz"])
    assert result.exit_code == 4


def test_cube_describe_error_is_not_found(runner, patch_ctx):
    svc = types.SimpleNamespace(describe_cube=lambda n: {"error": "未找到 Cube: zzz"})
    patch_ctx(_container(semantic_definition_service=svc))
    result = runner.invoke(cli, ["cube", "describe", "zzz"])
    assert result.exit_code == 4


# --- manifest -----------------------------------------------------------------

def test_manifest_not_ready_exit5(runner, patch_ctx):
    svc = types.SimpleNamespace(
        get_active_manifest=lambda ns: {"ok": False, "error_code": "semantic_runtime_not_ready"}
    )
    patch_ctx(_container(runtime_snapshot_service=svc))
    result = runner.invoke(cli, ["manifest", "show"])
    assert result.exit_code == 5
    payload = _payload(result)
    assert payload["code"] == -1
    assert payload["details"]["error_code"] == "semantic_runtime_not_ready"


def test_manifest_show_ok(runner, patch_ctx):
    svc = types.SimpleNamespace(get_active_manifest=lambda ns: {"ok": True, "release_id": "rel_x"})
    patch_ctx(_container(runtime_snapshot_service=svc))
    result = runner.invoke(cli, ["manifest", "show"])
    assert result.exit_code == 0
    assert _payload(result)["data"]["release_id"] == "rel_x"


# --- ontology -----------------------------------------------------------------

def test_ontology_metric_list(runner, patch_ctx):
    svc = types.SimpleNamespace(list_metrics=lambda: {"items": [{"name": "m1"}], "total": 1})
    patch_ctx(_container(ontology_definition_service=svc))
    result = runner.invoke(cli, ["ontology", "metric", "list"])
    assert result.exit_code == 0
    assert _payload(result)["data"]["total"] == 1


def test_ontology_glossary_show_uses_canonical_name_key(runner, patch_ctx):
    captured = {}

    def get_glossary(canonical_name):
        captured["cn"] = canonical_name
        return {"canonical_name": canonical_name}

    svc = types.SimpleNamespace(get_glossary=get_glossary)
    patch_ctx(_container(ontology_definition_service=svc))
    result = runner.invoke(cli, ["ontology", "glossary", "show", "comment_count"])
    assert result.exit_code == 0
    assert captured["cn"] == "comment_count"


# --- 错误兜底 / 自检 ------------------------------------------------------------

def test_exception_becomes_error_envelope_exit1(runner, patch_ctx):
    def boom():
        raise RuntimeError("kaboom")

    svc = types.SimpleNamespace(list_cubes=boom)
    patch_ctx(_container(semantic_definition_service=svc))
    result = runner.invoke(cli, ["cube", "list"])
    assert result.exit_code == 1
    payload = _payload(result)
    assert payload["code"] == -1
    assert "kaboom" in payload["message"]


def test_me_anonymous_without_principal(runner, patch_ctx):
    patch_ctx(_container())
    result = runner.invoke(cli, ["me"])
    assert result.exit_code == 0
    assert _payload(result)["data"]["anonymous"] is True


def test_describe_does_not_boot_app(runner):
    # describe 不进 app_context（无需桩容器）→ 自描述目录
    result = runner.invoke(cli, ["describe"])
    assert result.exit_code == 0
    assert _payload(result)["data"]["cli"] == "semctl"
