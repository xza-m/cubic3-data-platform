"""P2 query/intent/chat 命令 wiring 单测（CliRunner + 桩容器，不 boot 真实 app）。"""
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


# --- query --------------------------------------------------------------------

def test_query_compile_serializes_compile_result(runner, patch_ctx):
    compile_result = types.SimpleNamespace(
        sql="SELECT 1", primary_cube="c", joined_cubes=["c2"], scoped_table_refs=["t"]
    )
    svc = types.SimpleNamespace(compile_query=lambda dsl: compile_result)
    patch_ctx(_container(semantic_query_service=svc))
    result = runner.invoke(cli, ["query", "compile", '{"measures":["c.m"]}'])
    assert result.exit_code == 0
    data = _payload(result)["data"]
    assert data == {"sql": "SELECT 1", "primary_cube": "c", "joined_cubes": ["c2"], "scoped_table_refs": ["t"]}


def test_query_compile_bad_json_errors(runner, patch_ctx):
    svc = types.SimpleNamespace(compile_query=lambda dsl: None)
    patch_ctx(_container(semantic_query_service=svc))
    result = runner.invoke(cli, ["query", "compile", "{not json"])
    assert result.exit_code == 1
    assert _payload(result)["code"] == -1


def test_query_plan_passthrough(runner, patch_ctx):
    captured = {}

    def plan(*, question, principal_context, runtime_mode):
        captured.update(question=question, runtime_mode=runtime_mode, principal_context=principal_context)
        return {"semantic_plan_id": "plan_x", "steps": []}

    svc = types.SimpleNamespace(plan=plan)
    patch_ctx(_container(semantic_router_preview_service=svc))
    result = runner.invoke(cli, ["query", "plan", "各知识点正确率", "--runtime-mode", "preview"])
    assert result.exit_code == 0
    assert _payload(result)["data"]["semantic_plan_id"] == "plan_x"
    assert captured["runtime_mode"] == "preview"
    assert captured["principal_context"] is None  # 无 --principal → 匿名


def test_query_explain_uses_execute_plan_preview(runner, patch_ctx):
    svc = types.SimpleNamespace(
        execute_plan_preview=lambda *, question, principal_context, runtime_mode: {"compiled_targets": [{"sql": "S"}]}
    )
    patch_ctx(_container(semantic_router_preview_service=svc))
    result = runner.invoke(cli, ["query", "explain", "各知识点正确率"])
    assert result.exit_code == 0
    assert _payload(result)["data"]["compiled_targets"][0]["sql"] == "S"


# --- intent -------------------------------------------------------------------

def test_intent_route_passthrough(runner, patch_ctx):
    svc = types.SimpleNamespace(
        route=lambda *, question, principal_context, runtime_mode: {"route_type": "cube", "targets": [1]}
    )
    patch_ctx(_container(semantic_router_preview_service=svc))
    result = runner.invoke(cli, ["intent", "route", "各知识点正确率"])
    assert result.exit_code == 0
    assert _payload(result)["data"]["route_type"] == "cube"


def test_intent_extract_available(runner, patch_ctx):
    extraction = types.SimpleNamespace(
        intent_type="analysis", target_asset="答题总数", metrics=["答题总数"],
        dimensions=["年级"], required_dimensions=["学校"], confidence=0.9,
    )
    svc = types.SimpleNamespace(extract_intent=lambda q, principal_id=None: extraction)
    patch_ctx(_container(semantic_intent_extraction_service=svc))
    result = runner.invoke(cli, ["intent", "extract", "各年级答题"])
    assert result.exit_code == 0
    data = _payload(result)["data"]
    assert data["available"] is True
    assert data["target_asset"] == "答题总数"
    assert data["required_dimensions"] == ["学校"]


def test_intent_extract_unavailable_when_none(runner, patch_ctx):
    svc = types.SimpleNamespace(extract_intent=lambda q, principal_id=None: None)
    patch_ctx(_container(semantic_intent_extraction_service=svc))
    result = runner.invoke(cli, ["intent", "extract", "x"])
    assert result.exit_code == 0
    assert _payload(result)["data"]["available"] is False


def test_intent_answerability_projects_state(runner, patch_ctx):
    svc = types.SimpleNamespace(
        route=lambda *, question, principal_context, runtime_mode: {
            "route_type": "blocked",
            "business_intent": {"answerability": {"state": "out_of_coverage", "missing": ["学校"]}},
        }
    )
    patch_ctx(_container(semantic_router_preview_service=svc))
    result = runner.invoke(cli, ["intent", "answerability", "郑州基石中学的学情"])
    assert result.exit_code == 0
    data = _payload(result)["data"]
    assert data["answerability"]["state"] == "out_of_coverage"


def test_intent_answerability_none_is_graceful(runner, patch_ctx):
    svc = types.SimpleNamespace(
        route=lambda *, question, principal_context, runtime_mode: {"route_type": "cube", "business_intent": {}}
    )
    patch_ctx(_container(semantic_router_preview_service=svc))
    result = runner.invoke(cli, ["intent", "answerability", "x"])
    assert result.exit_code == 0
    data = _payload(result)["data"]
    assert data["state"] is None
    assert "note" in data


# --- chat observe -------------------------------------------------------------

def test_chat_observe_aggregates(runner, patch_ctx, monkeypatch):
    rows = [
        types.SimpleNamespace(status="out_of_coverage", agent_response="当前建模没有「学校」维度", user_message="郑州基石中学", id=2),
        types.SimpleNamespace(status="success", agent_response="ok", user_message="各知识点正确率", id=1),
    ]

    class _Q:
        def filter(self, *a, **k):
            return self

        def order_by(self, *a, **k):
            return self

        def limit(self, *a, **k):
            return self

        def all(self):
            return rows

    fake_db = types.SimpleNamespace(session=types.SimpleNamespace(query=lambda *a, **k: _Q()))
    monkeypatch.setattr("app.extensions.db", fake_db, raising=False)
    patch_ctx(_container())
    result = runner.invoke(cli, ["chat", "observe", "--limit", "50"])
    assert result.exit_code == 0
    data = _payload(result)["data"]
    assert data["total"] == 2
    assert data["status_distribution"]["out_of_coverage"] == 1
    assert data["missing_dimensions"][0] == {"dimension": "学校", "count": 1}
