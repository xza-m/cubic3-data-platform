from __future__ import annotations

from app.application.execution_compiler.preview_service import ExecutionCompilerPreviewService
from app.application.semantic.release_validation_preview import (
    ReleaseValidationPreviewService,
    build_semantic_compile_preview_adapter,
)
from app.infrastructure.ontology.yaml_metric_repository import YamlBusinessMetricRepository
from app.infrastructure.semantic.yaml_cube_repository import YamlCubeRepository


def _cube_spec(name: str = "student_comment") -> dict:
    return {
        "cube": {
            "name": name,
            "table": "dwd_interaction_comment_reports_df",
            "dimensions": {
                "school_id": {"sql": "school_id", "type": "string"},
            },
            "measures": {
                "comment_user_count": {
                    "sql": "user_id",
                    "type": "count_distinct",
                },
            },
        }
    }


def _compilable_semantic_spec() -> dict:
    return {
        "spec_version": "v1",
        "cube": {
            "name": "student_comments",
            "title": "学生评论",
            "status": "draft",
            "table": "dw.dwd_student_comment_events",
            "source_id": 7,
            "source_database": "dw",
            "dimensions": {
                "comment_id": {
                    "title": "评论ID",
                    "type": "string",
                    "sql": "{CUBE}.comment_id",
                },
                "school_name": {
                    "title": "学校名称",
                    "type": "string",
                    "sql": "{CUBE}.school_name",
                    "synonyms": ["学校"],
                },
            },
            "measures": {
                "total_count": {
                    "title": "评论数",
                    "type": "count",
                    "sql": "{CUBE}.comment_id",
                    "certified": True,
                }
            },
        },
        "ontology": {
            "object": {
                "name": "student_comment",
                "title": "学生评论",
                "status": "draft",
            },
            "metrics": [
                {
                    "name": "student_comment_total_count",
                    "title": "学生评论数",
                    "object_name": "student_comment",
                    "semantic_formula": "按评论 ID 统计评论数量",
                    "measure_refs": ["student_comments.total_count"],
                    "status": "draft",
                    "binding_status": "approved",
                }
            ],
            "glossary": [],
        },
    }


def test_preview_without_semantic_compile_marks_not_configured_and_keeps_readonly_payload():
    spec = _cube_spec()
    service = ReleaseValidationPreviewService()

    result = service.preview(
        "session_1",
        "qa_live_1",
        spec,
        sample_questions=["最近一周评论人数是多少？"],
    )
    spec["cube"]["measures"]["comment_user_count"]["sql"] = "mutated_user_id"

    assert result["session_id"] == "session_1"
    assert result["namespace"] == "qa_live_1"
    assert result["target"] == "semantic_center"
    assert result["semantic_spec"]["cube"]["measures"]["comment_user_count"]["sql"] == "user_id"
    assert result["compiled_sql"] == ""
    assert result["release_diff"] == {
        "added": ["cube.student_comment"],
        "changed": [],
        "removed": [],
    }
    assert result["semantic_compile"] == {
        "status": "not_configured",
        "message": "语义中心编译预演未配置，未生成物理 SQL。",
    }
    assert result["gateway_validation"] == {
        "status": "not_configured",
        "message": "等待语义中心返回物理 SQL，未调用 gateway SQL dry-run。",
    }
    assert result["consumer_validation"] == {
        "status": "pending",
        "samples": [
            {
                "question": "最近一周评论人数是多少？",
                "consumer": "semantic_center",
                "status": "pending_gateway_validation",
                "message": "等待 gateway SQL dry-run 验证样例问题。",
            }
        ],
    }


def test_preview_calls_gateway_sql_dry_run_only_after_semantic_compile():
    compile_calls: list[dict] = []
    gateway_calls: list[dict] = []

    def _compile(payload: dict) -> dict:
        compile_calls.append(payload)
        return {
            "status": "passed",
            "compiled_sql": "SELECT semantic_compiled_sql FROM semantic_center",
            "access_context": {
                "resource_set_physical": [{"project": "qa_live_1"}],
            },
        }

    def _dry_run(payload: dict) -> dict:
        gateway_calls.append(payload)
        return {
            "status": "passed",
            "telemetry": {"dry_run_id": "dry_1"},
        }

    spec = _cube_spec()
    service = ReleaseValidationPreviewService(
        semantic_compile_preview=_compile,
        gateway_sql_dry_run=_dry_run,
    )

    result = service.preview(
        "session_1",
        "qa_live_1",
        spec,
        previous_spec=_cube_spec(),
        viewer_roles=["ops_readonly", "data_agent_test"],
    )

    assert compile_calls == [
        {
            "namespace": "qa_live_1",
            "session_id": "session_1",
            "semantic_spec": result["semantic_spec"],
            "viewer_roles": ["ops_readonly", "data_agent_test"],
        }
    ]
    assert gateway_calls == [
        {
            "sql": "SELECT semantic_compiled_sql FROM semantic_center",
            "access_context": {
                "resource_set_physical": [{"project": "qa_live_1"}],
                "semantic_asset_refs": ["cube.student_comment"],
                "release_preview": {
                    "session_id": "session_1",
                    "namespace": "qa_live_1",
                },
            },
            "idempotency_key": "semantic-release-preview:qa_live_1:session_1",
            "runtime_options": {
                "mode": "semantic_release_preview",
                "dry_run": True,
            },
            "namespace": "qa_live_1",
            "session_id": "session_1",
        }
    ]
    assert "semantic_spec" not in gateway_calls[0]
    assert "viewer_roles" not in gateway_calls[0]
    assert result["semantic_compile"]["compiled_sql"] == (
        "SELECT semantic_compiled_sql FROM semantic_center"
    )
    assert result["gateway_validation"] == {
        "status": "passed",
        "telemetry": {"dry_run_id": "dry_1"},
    }
    assert result["compiled_sql"] == "SELECT semantic_compiled_sql FROM semantic_center"
    assert result["release_diff"] == {
        "added": [],
        "changed": ["cube.student_comment"],
        "removed": [],
    }
    assert result["impact_summary"]["risk_level"] == "medium"


def test_preview_with_gateway_sql_dry_run_failure_keeps_contract_readonly():
    def _compile(payload: dict) -> dict:
        return {
            "status": "passed",
            "compiled_sql": "SELECT semantic_compiled_sql FROM semantic_center",
        }

    def _dry_run(payload: dict) -> dict:
        raise RuntimeError("gateway unavailable")

    service = ReleaseValidationPreviewService(
        semantic_compile_preview=_compile,
        gateway_sql_dry_run=_dry_run,
    )

    result = service.preview("session_1", "qa_live_1", _cube_spec())

    assert result["compiled_sql"] == "SELECT semantic_compiled_sql FROM semantic_center"
    assert result["gateway_validation"] == {
        "status": "failed",
        "message": "Gateway SQL dry-run 调用失败：gateway unavailable",
    }
    assert result["target"] == "semantic_center"


def test_preview_with_semantic_compile_failure_does_not_call_gateway():
    gateway_calls: list[dict] = []

    def _compile(payload: dict) -> dict:
        return {
            "status": "failed",
            "message": "缺少物理表绑定",
            "compiled_sql": "SELECT should_not_be_used",
        }

    def _dry_run(payload: dict) -> dict:
        gateway_calls.append(payload)
        return {"status": "passed"}

    service = ReleaseValidationPreviewService(
        semantic_compile_preview=_compile,
        gateway_sql_dry_run=_dry_run,
    )

    result = service.preview("session_1", "qa_live_1", _cube_spec())

    assert result["compiled_sql"] == ""
    assert result["semantic_compile"] == {
        "status": "failed",
        "message": "缺少物理表绑定",
        "compiled_sql": "SELECT should_not_be_used",
    }
    assert result["gateway_validation"] == {
        "status": "not_configured",
        "message": "等待语义中心返回物理 SQL，未调用 gateway SQL dry-run。",
    }
    assert gateway_calls == []


def test_preview_diff_marks_removed_when_previous_cube_name_is_different():
    service = ReleaseValidationPreviewService()

    result = service.preview(
        "session_1",
        "qa_live_1",
        _cube_spec("student_comment_v2"),
        previous_spec=_cube_spec("student_comment"),
    )

    assert result["release_diff"] == {
        "added": ["cube.student_comment_v2"],
        "changed": [],
        "removed": ["cube.student_comment"],
    }
    assert result["impact_summary"]["affected_assets"] == [
        "cube.student_comment_v2",
        "cube.student_comment",
    ]
    assert result["impact_summary"]["risk_level"] == "high"


def test_semantic_compile_preview_adapter_uses_execution_compiler_runtime_manifest(tmp_path):
    spec = _compilable_semantic_spec()
    compiler = ExecutionCompilerPreviewService(
        metric_repository=YamlBusinessMetricRepository(str(tmp_path / "metrics")),
        cube_repository=YamlCubeRepository(str(tmp_path / "cubes")),
    )
    adapter = build_semantic_compile_preview_adapter(compiler)

    result = adapter(
        {
            "namespace": "qa_live_1",
            "session_id": "session_1",
            "semantic_spec": spec,
            "analysis_intent": {
                "dimension_terms": ["学校"],
                "limit": 50,
            },
        }
    )

    assert result["status"] == "passed"
    assert result["compiled_sql"] == result["logical_sql"]
    assert "FROM dw.dwd_student_comment_events student_comments" in result["compiled_sql"]
    assert "student_comments.school_name" in result["compiled_sql"]
    assert result["query_dsl"]["measures"] == ["student_comments.total_count"]
    assert result["query_dsl"]["dimensions"] == ["student_comments.school_name"]
    assert result["execution_request"]["sql_query"] == result["compiled_sql"]
    assert result["access_context"]["semantic_compile"] == {
        "source": "execution_compiler_preview",
        "target_type": "sql",
    }
    assert result["access_context"]["bindings"]["runtime_snapshot_id"] == (
        "release-preview:qa_live_1:session_1"
    )
    assert result["access_context"]["resource_set_physical"][0]["table"] == (
        "dwd_student_comment_events"
    )
    assert result["compiler_preview"]["traceability"]["compiler"]["source"] == "query_compiler"
    assert spec["cube"]["status"] == "draft"
    assert spec["ontology"]["metrics"][0]["status"] == "draft"


def test_semantic_compile_preview_adapter_maps_blocked_preview_to_failed(tmp_path):
    spec = _compilable_semantic_spec()
    spec["ontology"]["metrics"][0]["measure_refs"] = ["student_comments.missing_measure"]
    compiler = ExecutionCompilerPreviewService(
        metric_repository=YamlBusinessMetricRepository(str(tmp_path / "metrics")),
        cube_repository=YamlCubeRepository(str(tmp_path / "cubes")),
    )
    adapter = build_semantic_compile_preview_adapter(compiler)

    result = adapter(
        {
            "namespace": "qa_live_1",
            "session_id": "session_1",
            "semantic_spec": spec,
        }
    )

    assert result["status"] == "failed"
    assert "未找到可执行 Measure 引用" in result["message"]
    assert "compiled_sql" not in result
    assert result["compiler_preview"]["status"] == "blocked"


def test_preview_reports_binding_validation_passed_for_bound_spec():
    spec = _compilable_semantic_spec()
    spec["ontology"]["object"]["cube_bindings"] = [
        {"cube": "student_comments", "role": "primary", "entity_key": "comment_id"}
    ]
    service = ReleaseValidationPreviewService()

    result = service.preview("session_1", "qa_live_1", spec)

    assert result["binding_validation"]["status"] == "passed"
    assert result["binding_validation"]["blockers"] == []


def test_preview_reports_binding_blockers_for_broken_links():
    spec = _compilable_semantic_spec()
    spec["ontology"]["metrics"][0]["measure_refs"] = ["missing_cube.total_count"]
    service = ReleaseValidationPreviewService()

    result = service.preview("session_1", "qa_live_1", spec)

    assert result["binding_validation"]["status"] == "failed"
    codes = [item["code"] for item in result["binding_validation"]["blockers"]]
    assert "metric_binding_unresolved" in codes
    assert "object_binding_missing" in codes


def test_semantic_compile_preview_adapter_requires_metric():
    class _UnusedCompiler:
        def compile_metric_preview(self, *args, **kwargs):  # pragma: no cover
            raise AssertionError("不应调用 compiler")

    adapter = build_semantic_compile_preview_adapter(_UnusedCompiler())

    result = adapter(
        {
            "namespace": "qa_live_1",
            "session_id": "session_1",
            "semantic_spec": {"cube": _compilable_semantic_spec()["cube"], "ontology": {"metrics": []}},
        }
    )

    assert result == {
        "status": "failed",
        "message": "语义中心编译预演需要至少一个 BusinessMetric，并绑定 measure_refs。",
    }
