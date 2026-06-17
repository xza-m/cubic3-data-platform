"""RuntimeSemanticToolService（Agent 语义工具运行时门面）单测。"""
from __future__ import annotations

from app.application.agent.services.runtime_semantic_tool_service import RuntimeSemanticToolService
from app.application.agent.services.tool_registry import BUILTIN_TOOLS


def _cube_spec() -> dict:
    return {
        "cube": {
            "name": "student_comment",
            "title": "学生评论",
            "table": "df_cb_258187.dwd_interaction_comment_reports_df",
            "source_id": 1,
            "status": "active",
            "dimensions": {
                "comment_id": {"title": "评论ID", "type": "string", "sql": "{CUBE}.comment_id"}
            },
            "measures": {
                "comment_count": {
                    "title": "评论数",
                    "type": "count",
                    "sql": "{CUBE}.comment_id",
                }
            },
        },
    }


def _manifest(ok: bool = True) -> dict:
    if not ok:
        return {"ok": False, "error_code": "semantic_runtime_not_ready"}
    return {
        "ok": True,
        "snapshot_id": "snap_1",
        "release_id": "rel_1",
        "version_pin": {"release_no": 7},
        "asset_manifest_json": {
            "schema_version": "semantic-runtime-manifest/v1",
            "assets": [
                {
                    "asset_id": "a1",
                    "asset_type": "cube",
                    "asset_key": "student_comment",
                    "revision_id": "rev_1",
                    "spec_checksum": "0" * 64,
                    "spec": _cube_spec(),
                    "status": "published",
                }
            ],
        },
    }


class _SnapshotService:
    def __init__(self, manifest):
        self._manifest = manifest

    def get_active_manifest(self, namespace="default"):
        return self._manifest


class _Adapter:
    def __init__(self):
        self.executed_sql = None

    def execute_query(self, sql, limit=None):
        self.executed_sql = sql
        return {"columns": ["comment_count"], "data": [[42]]}


def test_list_cubes_reads_manifest_catalog_and_carries_release_id():
    service = RuntimeSemanticToolService(runtime_snapshot_service=_SnapshotService(_manifest()))
    cubes = service.list_cubes()
    assert [cube["name"] for cube in cubes] == ["student_comment"]
    assert cubes[0]["runtime"]["release_id"] == "rel_1"
    assert cubes[0]["runtime"]["snapshot_id"] == "snap_1"
    assert cubes[0]["runtime"]["catalog_source"] == "runtime_manifest"


def test_describe_cube_returns_definition_with_runtime_metadata():
    service = RuntimeSemanticToolService(runtime_snapshot_service=_SnapshotService(_manifest()))
    described = service.describe_cube("student_comment")
    assert described["name"] == "student_comment"
    assert described["status"] == "active"
    assert described["runtime"]["release_id"] == "rel_1"

    missing = service.describe_cube("not_exists")
    assert missing["error_code"] == "cube_not_found"
    assert missing["available_cubes"] == ["student_comment"]


def test_query_executes_via_manifest_catalog_and_pins_release():
    service = RuntimeSemanticToolService(runtime_snapshot_service=_SnapshotService(_manifest()))
    adapter = _Adapter()
    result = service.compile_and_execute({"measures": ["student_comment.comment_count"]}, adapter)
    assert result.get("error") is None
    assert result["row_count"] == 1
    assert result["runtime"]["release_id"] == "rel_1"
    assert "COUNT" in adapter.executed_sql.upper()


def test_manifest_not_ready_returns_structured_error():
    service = RuntimeSemanticToolService(runtime_snapshot_service=_SnapshotService(_manifest(ok=False)))
    result = service.compile_and_execute({"measures": ["student_comment.comment_count"]}, _Adapter())
    assert result["error_code"] == "semantic_runtime_not_ready"

    described = service.describe_cube("student_comment")
    assert described["error_code"] == "semantic_runtime_not_ready"


class _PinnableSnapshotService:
    def __init__(self, manifest):
        self._manifest = manifest
        self.active_calls = 0
        self.release_calls: list[str] = []

    def get_active_manifest(self, namespace="default"):
        self.active_calls += 1
        return self._manifest

    def get_manifest_for_release(self, release_id):
        self.release_calls.append(release_id)
        manifest = dict(self._manifest)
        manifest["release_id"] = release_id
        return manifest


def test_pinned_consumer_resolves_manifest_by_release_id():
    """§6.1：pin_policy=pinned 时按不可变 release_id 解析 manifest。"""
    snapshot = _PinnableSnapshotService(_manifest())
    service = RuntimeSemanticToolService(
        runtime_snapshot_service=snapshot,
        pin_config_provider=lambda: {
            "semantic_pin": {"pin_policy": "pinned", "release_id": "rel_pinned_9"}
        },
    )

    cubes = service.list_cubes()

    assert snapshot.release_calls == ["rel_pinned_9"]
    assert snapshot.active_calls == 0
    assert cubes[0]["runtime"]["catalog_source"] == "runtime_manifest"


def test_track_active_or_broken_pin_falls_back_to_active_manifest():
    snapshot = _PinnableSnapshotService(_manifest())
    track_active = RuntimeSemanticToolService(
        runtime_snapshot_service=snapshot,
        pin_config_provider=lambda: {"semantic_pin": {"pin_policy": "track_active"}},
    )
    track_active.list_cubes()
    assert snapshot.release_calls == []
    assert snapshot.active_calls == 1

    broken = RuntimeSemanticToolService(
        runtime_snapshot_service=snapshot,
        pin_config_provider=lambda: (_ for _ in ()).throw(RuntimeError("boom")),
    )
    broken.list_cubes()
    assert snapshot.release_calls == []
    assert snapshot.active_calls == 2


def test_semantic_tools_open_to_feishu_and_datachat_channels():
    semantic_tools = {t.name: t.channels for t in BUILTIN_TOOLS if t.name in {"list_cubes", "describe_cube", "query"}}
    assert set(semantic_tools) == {"list_cubes", "describe_cube", "query"}
    for channels in semantic_tools.values():
        assert "feishu" in channels
        assert "datachat" in channels
