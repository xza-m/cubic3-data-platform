"""P3 写域命令单测：写操作三件套守卫 + cube/proposal/release wiring（CliRunner + 桩容器）。"""
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


# --- 写操作三件套守卫（以 proposal create 为载体）---------------------------------

def test_write_dry_run_does_not_call_service(runner, patch_ctx):
    called = {"n": 0}

    def create_proposal(p):
        called["n"] += 1
        return {}

    svc = types.SimpleNamespace(create_proposal=create_proposal)
    patch_ctx(_container(semantic_modeling_proposal_service=svc))
    result = runner.invoke(cli, ["proposal", "create", "--payload", "{}", "--dry-run"])
    assert result.exit_code == 0
    assert _payload(result)["data"]["dry_run"] is True
    assert called["n"] == 0  # dry-run 不调服务


def test_write_without_yes_is_usage_exit2(runner, patch_ctx):
    svc = types.SimpleNamespace(create_proposal=lambda p: {})
    patch_ctx(_container(semantic_modeling_proposal_service=svc))
    result = runner.invoke(cli, ["proposal", "create", "--payload", "{}"])
    assert result.exit_code == 2


def test_write_with_yes_calls_service(runner, patch_ctx):
    svc = types.SimpleNamespace(create_proposal=lambda p: {"id": "proposal_x", "status": "created"})
    patch_ctx(_container(semantic_modeling_proposal_service=svc))
    result = runner.invoke(cli, ["proposal", "create", "--payload", '{"business_subject":"x"}', "--yes"])
    assert result.exit_code == 0
    assert _payload(result)["data"]["id"] == "proposal_x"


# --- cube draft（只读生成，绕 MaxCompute）------------------------------------------

def test_cube_draft_reads_cached_columns(runner, patch_ctx):
    captured = {}

    def build_cube_draft_payload(*, source_id, database, schema, table, columns, partitions, name, title):
        captured.update(source_id=source_id, columns=columns, partitions=partitions)
        return {"name": table, "dimensions": {}, "measures": {}}

    asset_svc = types.SimpleNamespace(
        list_fields=lambda tid: {"items": [{"name": "school_name", "type": "string"}], "total": 1}
    )
    cube_svc = types.SimpleNamespace(build_cube_draft_payload=build_cube_draft_payload)
    patch_ctx(_container(data_asset_service=asset_svc, cube_modeling_service=cube_svc))
    result = runner.invoke(cli, [
        "cube", "draft", "--source-id", "1", "--database", "df", "--table", "t",
        "--columns-from", "tbl_x", "--partitions", "ds",
    ])
    assert result.exit_code == 0
    assert captured["source_id"] == 1
    assert captured["columns"][0]["name"] == "school_name"
    assert captured["partitions"] == ["ds"]


def test_cube_create_serializes_model(runner, patch_ctx):
    cube_def = types.SimpleNamespace(model_dump=lambda mode="json": {"name": "t", "status": "draft"})
    cube_svc = types.SimpleNamespace(create_cube=lambda payload: cube_def)
    patch_ctx(_container(cube_modeling_service=cube_svc))
    result = runner.invoke(cli, ["cube", "create", '{"name":"t","table":"t"}', "--yes"])
    assert result.exit_code == 0
    assert _payload(result)["data"]["status"] == "draft"


# --- proposal 关键步 -----------------------------------------------------------

def test_proposal_publish_requires_yes(runner, patch_ctx):
    svc = types.SimpleNamespace(publish=lambda pid, targets=None: {})
    patch_ctx(_container(semantic_modeling_proposal_service=svc))
    result = runner.invoke(cli, ["proposal", "publish", "proposal_x"])
    assert result.exit_code == 2  # 保护 live manifest


def test_proposal_gap_is_read_only(runner, patch_ctx):
    svc = types.SimpleNamespace(get_gap_view=lambda pid: {"id": pid, "primary_action": {"action": "validate"}})
    patch_ctx(_container(semantic_modeling_proposal_service=svc))
    result = runner.invoke(cli, ["proposal", "gap", "proposal_x"])
    assert result.exit_code == 0
    assert _payload(result)["data"]["primary_action"]["action"] == "validate"


def test_proposal_draft_refuses_live_without_flag(runner, patch_ctx):
    svc = types.SimpleNamespace(draft=lambda pid: {})
    patch_ctx(_container(semantic_modeling_proposal_service=svc))
    result = runner.invoke(cli, ["proposal", "draft", "proposal_x", "--yes"])
    assert result.exit_code == 2  # 默认拒绝打 MaxCompute


# --- release -------------------------------------------------------------------

def test_release_list(runner, patch_ctx):
    svc = types.SimpleNamespace(
        list_releases=lambda *, namespace, status, limit, offset: {"items": [{"id": "rel_x", "status": "published"}], "total": 1}
    )
    patch_ctx(_container(semantic_release_service=svc))
    result = runner.invoke(cli, ["release", "list"])
    assert result.exit_code == 0
    assert _payload(result)["data"]["items"][0]["id"] == "rel_x"


def test_release_rollback_dry_run_shows_anchor(runner, patch_ctx):
    svc = types.SimpleNamespace(rollback_to=lambda **k: {})
    patch_ctx(_container(semantic_release_service=svc))
    result = runner.invoke(cli, ["release", "rollback", "rel_anchor", "--dry-run"])
    assert result.exit_code == 0
    assert _payload(result)["data"]["preview"]["release_id"] == "rel_anchor"
    assert _payload(result)["data"]["preview"]["idempotency_key"] == "rollback:rel_anchor"
