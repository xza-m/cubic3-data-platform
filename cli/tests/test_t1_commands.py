"""cubic3-dp T1 命令单测（mock client.call）：验证 envelope 输出契约 + 退出码 + 投影。

与 semctl 对齐：成功输出完整 {code,message,data,trace_id}；not_ready→5、404→4、坏JSON→2。
"""
from __future__ import annotations

import json

import pytest
from typer.testing import CliRunner

from cubic3_dp_cli import client as client_mod
from cubic3_dp_cli.app import app
from cubic3_dp_cli.main import main as cli_main

runner = CliRunner()


@pytest.fixture
def mock_call(monkeypatch):
    captured: dict = {}

    def _set(payload, status=200):
        def fake_call(self, method, path, *, params=None, json_body=None):
            captured.update(method=method, path=path, params=params, json_body=json_body)
            return payload, status

        monkeypatch.setattr(client_mod.Cubic3DpClient, "call", fake_call)
        return captured

    return _set


def _env(data, code=0):
    return {"code": code, "message": "success", "data": data, "trace_id": "t1"}


def _invoke(*args):
    return runner.invoke(app, ["--base-url", "http://x", "--access-token", "tok", *args])


def _out(result):
    return json.loads(result.stdout)


def test_datasource_list_emits_full_envelope(mock_call):
    cap = mock_call(_env({"items": [], "total": 0}))
    res = _invoke("datasource", "list")
    assert res.exit_code == 0
    out = _out(res)
    assert out["code"] == 0 and "data" in out and "trace_id" in out  # 与 semctl 同契约
    assert cap["path"] == "/api/v1/data-center/datasources"


def test_asset_fields_path(mock_call):
    cap = mock_call(_env({"items": [], "total": 0}))
    res = _invoke("asset", "fields", "tbl_x")
    assert res.exit_code == 0
    assert cap["path"] == "/api/v1/semantic/assets/tables/tbl_x/fields"


def test_manifest_not_ready_exit5(mock_call):
    mock_call(_env({"ok": False, "error_code": "semantic_runtime_not_ready"}))
    res = _invoke("manifest", "show")
    assert res.exit_code == 5


def test_manifest_ready_exit0(mock_call):
    mock_call(_env({"ok": True, "release_id": "rel_x"}))
    res = _invoke("manifest", "show")
    assert res.exit_code == 0
    assert _out(res)["data"]["release_id"] == "rel_x"


def test_cube_show_not_found_exit4(mock_call):
    mock_call({"code": -1, "message": "未找到", "trace_id": "t"}, status=404)
    res = _invoke("cube", "show", "zzz")
    assert res.exit_code == 4


def test_intent_extract_projects_route(mock_call):
    cap = mock_call(_env({
        "route_type": "cube",
        "business_intent": {
            "intent_understanding": {"grounded": ["答题总数"], "confidence": 0.9},
            "matched_entities": [{"name": "答题总数"}],
            "answerability": {"state": "answerable"},
        },
    }))
    res = _invoke("intent", "extract", "各年级答题")
    assert res.exit_code == 0
    data = _out(res)["data"]
    assert data["route_type"] == "cube"
    assert data["intent_understanding"]["grounded"] == ["答题总数"]
    assert cap["path"] == "/api/v1/semantic-router/route"  # extract 走 route


def test_intent_answerability_projects(mock_call):
    mock_call(_env({"route_type": "cube", "business_intent": {"answerability": {"state": "out_of_coverage"}}}))
    res = _invoke("intent", "answerability", "郑州基石中学学情")
    assert res.exit_code == 0
    assert _out(res)["data"]["answerability"]["state"] == "out_of_coverage"


def test_query_compile_bad_json_exit2(mock_call):
    mock_call(_env({}))
    res = _invoke("query", "compile", "{bad json")
    assert res.exit_code == 2  # BadParameter → usage


def test_query_compile_missing_file_exit2():
    # @缺失文件 → usage exit 2（与 semctl 对齐，不抛裸 traceback）
    res = _invoke("query", "compile", "@/no/such/file.json")
    assert res.exit_code == 2


def test_intent_route_passes_runtime_mode(mock_call):
    cap = mock_call(_env({"route_type": "cube", "business_intent": {}}))
    res = _invoke("intent", "route", "各年级答题", "--runtime-mode", "official")
    assert res.exit_code == 0
    assert cap["json_body"] == {"question": "各年级答题", "runtime_mode": "official"}


def test_query_compile_inline_json(mock_call):
    cap = mock_call(_env({"sql": "SELECT 1"}))
    res = _invoke("query", "compile", '{"measures":["m"]}')
    assert res.exit_code == 0
    assert cap["json_body"] == {"measures": ["m"]}
    assert cap["path"] == "/api/v1/semantic/compile"


def test_cube_list_normalizes_to_items(mock_call):
    # 后端 {cubes:[...],total} → CLI 归一 {items:[...],total}（与 semctl 同形）
    mock_call(_env({"cubes": [{"name": "a"}, {"name": "b"}], "page": 1, "total": 2}))
    res = _invoke("cube", "list")
    assert res.exit_code == 0
    data = _out(res)["data"]
    assert set(data.keys()) == {"items", "total"}
    assert len(data["items"]) == 2 and data["total"] == 2


def test_datasource_list_normalizes(mock_call):
    # 真实后端键为 items（data-center 走平台 success() 约定）
    mock_call(_env({"items": [{"id": 1}], "total": 1, "page": 1}))
    res = _invoke("datasource", "list")
    assert _out(res)["data"] == {"items": [{"id": 1}], "total": 1}


def test_asset_list_normalizes_items_key(mock_call):
    mock_call(_env({"items": [{"asset_key": "a"}], "total": 1}))
    res = _invoke("asset", "list")
    assert _out(res)["data"]["items"] == [{"asset_key": "a"}]


def test_ontology_list_bare_list_normalizes(mock_call):
    # ontology list 后端返回裸 list → 归一 {items,total}
    mock_call(_env([{"name": "m1"}, {"name": "m2"}]))
    res = _invoke("ontology", "metric", "list")
    assert _out(res)["data"] == {"items": [{"name": "m1"}, {"name": "m2"}], "total": 2}


def test_ontology_metric_list_path_and_normalize(mock_call):
    cap = mock_call(_env({"metrics": [{"name": "m1"}], "total": 1}))
    res = _invoke("ontology", "metric", "list")
    assert res.exit_code == 0
    assert cap["path"] == "/api/v1/ontology/metrics"
    assert _out(res)["data"]["items"] == [{"name": "m1"}]


def test_ontology_status_projects(mock_call):
    cap = mock_call(_env({"name": "comment_count", "status": "active"}))
    res = _invoke("ontology", "metric", "status", "comment_count")
    assert res.exit_code == 0
    assert cap["path"] == "/api/v1/ontology/metrics/comment_count"
    assert _out(res)["data"] == {"entity_type": "metric", "name": "comment_count", "status": "active"}


def test_ontology_glossary_show_uses_glossary_path(mock_call):
    cap = mock_call(_env({"canonical_name": "x"}))
    res = _invoke("ontology", "glossary", "show", "x")
    assert res.exit_code == 0
    assert cap["path"] == "/api/v1/ontology/glossary/x"


def test_chat_observe_path_and_params(mock_call):
    cap = mock_call(_env({"total": 5, "status_distribution": {}, "missing_dimensions": [], "samples": {}}))
    res = _invoke("chat", "observe", "--limit", "50")
    assert res.exit_code == 0
    assert cap["path"] == "/api/v1/conversations/datachat/observe"
    assert cap["params"]["limit"] == 50
    assert _out(res)["data"]["total"] == 5


def test_proposal_publish_is_local_only_exit2(mock_call):
    # 写域 stub：不调 API，输出 local_only + exit 2
    mock_call(_env({}))
    res = _invoke("proposal", "publish")
    assert res.exit_code == 2
    data = _out(res)["data"]
    assert data["local_only"] is True and data["engine"] == "semctl"


def test_cube_create_local_only(mock_call):
    mock_call(_env({}))
    res = _invoke("cube", "create")
    assert res.exit_code == 2
    assert _out(res)["data"]["local_only"] is True


def test_ontology_upsert_local_only(mock_call):
    mock_call(_env({}))
    res = _invoke("ontology", "metric", "upsert")
    assert res.exit_code == 2
    assert _out(res)["data"]["local_only"] is True


def test_main_entrypoint_propagates_exit_code():
    # 经真实 main()（非 CliRunner）：standalone_mode=False 下退出码必须接住，否则恒 0
    assert cli_main(["proposal", "publish"]) == 2  # local_only → usage exit 2
    assert cli_main(["describe"]) == 0  # 成功 → 0


def test_describe_is_enveloped_new_vocab():
    res = runner.invoke(app, ["describe"])
    assert res.exit_code == 0
    out = json.loads(res.stdout)
    assert out["code"] == 0
    ids = [c["id"] for c in out["data"]["commands"]]
    assert "cube.list" in ids and not any(i.startswith("semantic.") for i in ids)
