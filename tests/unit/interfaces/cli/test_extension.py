"""延伸命令单测：view 读 / ontology 写(upsert/publish/status) / schema 内省。"""
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
    ns = types.SimpleNamespace()
    for name, service in providers.items():
        setattr(ns, name, (lambda s=service: s))
    return ns


def _payload(result):
    return json.loads(result.output)


# --- view 读 -------------------------------------------------------------------

def test_view_list_serializes_pydantic(runner, patch_ctx):
    captured = {}

    def list_views(public_only=True):
        captured["public_only"] = public_only
        return [types.SimpleNamespace(model_dump=lambda mode="json": {"name": "v1"})]

    svc = types.SimpleNamespace(list_views=list_views)
    patch_ctx(_container(semantic_definition_service=svc))
    result = runner.invoke(cli, ["view", "list"])
    assert result.exit_code == 0
    data = _payload(result)["data"]
    assert data["items"][0]["name"] == "v1"
    assert captured["public_only"] is True  # 默认只 public


def test_view_show_zero_write_from_list(runner, patch_ctx):
    # show 走 list_views（零写），不调 describe_view（后者会同步 registry）
    called = {"describe": 0}

    def describe_view(name, include_private=False):
        called["describe"] += 1
        return {}

    svc = types.SimpleNamespace(
        list_views=lambda public_only=True: [types.SimpleNamespace(name="v1", model_dump=lambda mode="json": {"name": "v1"})],
        describe_view=describe_view,
    )
    patch_ctx(_container(semantic_definition_service=svc))
    result = runner.invoke(cli, ["view", "show", "v1"])
    assert result.exit_code == 0
    assert _payload(result)["data"]["name"] == "v1"
    assert called["describe"] == 0


def test_view_show_not_found(runner, patch_ctx):
    svc = types.SimpleNamespace(list_views=lambda public_only=True: [])
    patch_ctx(_container(semantic_definition_service=svc))
    result = runner.invoke(cli, ["view", "show", "zzz"])
    assert result.exit_code == 4


def test_view_describe_passes_through_service_error(runner, patch_ctx):
    svc = types.SimpleNamespace(describe_view=lambda name, include_private=False: {"error": "View 'v' 未公开暴露"})
    patch_ctx(_container(semantic_definition_service=svc))
    result = runner.invoke(cli, ["view", "describe", "v"])
    assert result.exit_code == 4
    assert "未公开暴露" in _payload(result)["message"]  # 透传真实原因，非"未找到"


# --- ontology 写 ---------------------------------------------------------------

def test_ontology_upsert_dry_run(runner, patch_ctx):
    called = {"n": 0}

    def save_metric(p):
        called["n"] += 1
        return {}

    svc = types.SimpleNamespace(save_metric=save_metric)
    patch_ctx(_container(ontology_definition_service=svc))
    result = runner.invoke(cli, ["ontology", "metric", "upsert", '{"name":"m"}', "--dry-run"])
    assert result.exit_code == 0
    assert _payload(result)["data"]["dry_run"] is True
    assert called["n"] == 0


def test_ontology_upsert_without_yes_exit2(runner, patch_ctx):
    svc = types.SimpleNamespace(save_metric=lambda p: {})
    patch_ctx(_container(ontology_definition_service=svc))
    result = runner.invoke(cli, ["ontology", "metric", "upsert", '{"name":"m"}'])
    assert result.exit_code == 2


def test_ontology_publish_uses_plural_entity_type(runner, patch_ctx):
    captured = {}

    def publish_entity(entity_type, name, validation=None):
        captured["entity_type"] = entity_type
        return {"status": "active"}

    svc = types.SimpleNamespace(
        get_metric=lambda name: {"name": name},  # 存在性预检命中
        publish_entity=publish_entity,
    )
    patch_ctx(_container(ontology_definition_service=svc))
    result = runner.invoke(cli, ["ontology", "metric", "publish", "comment_count", "--yes"])
    assert result.exit_code == 0
    assert captured["entity_type"] == "metrics"  # 复数（_entity_repo_and_dump 口径）


def test_ontology_publish_nonexistent_is_not_found4(runner, patch_ctx):
    # 发布不存在实体 → not_found(4)，与 status/show 一致（非裸 ValueError exit 1）
    svc = types.SimpleNamespace(
        get_metric=lambda name: None,
        publish_entity=lambda *a, **k: {},
    )
    patch_ctx(_container(ontology_definition_service=svc))
    result = runner.invoke(cli, ["ontology", "metric", "publish", "zzz", "--yes"])
    assert result.exit_code == 4


def test_ontology_status_reads(runner, patch_ctx):
    captured = {}

    def entity_status(entity_type, name):
        captured["entity_type"] = entity_type
        return "active"

    svc = types.SimpleNamespace(entity_status=entity_status)
    patch_ctx(_container(ontology_definition_service=svc))
    result = runner.invoke(cli, ["ontology", "object", "status", "x"])
    assert result.exit_code == 0
    assert _payload(result)["data"]["status"] == "active"
    assert captured["entity_type"] == "objects"


def test_ontology_glossary_publish_uses_canonical_name(runner, patch_ctx):
    captured = {}

    def publish_entity(entity_type, name, validation=None):
        captured["entity_type"] = entity_type
        captured["name"] = name
        return {}

    svc = types.SimpleNamespace(get_glossary=lambda cn: {"canonical_name": cn}, publish_entity=publish_entity)
    patch_ctx(_container(ontology_definition_service=svc))
    result = runner.invoke(cli, ["ontology", "glossary", "publish", "term_x", "--yes"])
    assert result.exit_code == 0
    assert captured["entity_type"] == "glossary"  # glossary 不复数
    assert captured["name"] == "term_x"


# --- schema 内省（不 boot app）-------------------------------------------------

def test_schema_command_dumps_params(runner):
    result = runner.invoke(cli, ["schema", "cube", "draft"])
    assert result.exit_code == 0
    data = _payload(result)["data"]
    assert data["type"] == "command"
    opt_names = [o["name"] for o in data["options"]]
    assert "source_id" in opt_names and "columns_from" in opt_names


def test_schema_group_lists_subcommands(runner):
    result = runner.invoke(cli, ["schema", "ontology", "object"])
    assert result.exit_code == 0
    data = _payload(result)["data"]
    assert data["type"] == "group"
    assert {"list", "show", "upsert", "publish", "status"}.issubset(set(data["subcommands"]))


def test_schema_unknown_command_exit4(runner):
    result = runner.invoke(cli, ["schema", "nope"])
    assert result.exit_code == 4
