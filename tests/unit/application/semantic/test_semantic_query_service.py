import pytest

from app.application.semantic.semantic_query_service import SemanticQueryService
from app.domain.semantic.compiler import CompilationError
from app.domain.semantic.dialects import MaxComputeDialect
from app.domain.semantic.entities import CubeDefinition, DimensionDef, DomainDefinition, JoinDef, MeasureDef, QueryDSL


class _CubeRepo:
    def __init__(self, cubes):
        self._items = {cube.name: cube for cube in cubes}

    def get(self, name):
        return self._items.get(name)

    def list_all(self):
        return list(self._items.values())


class _DomainRepo:
    def __init__(self, domains):
        self._items = {domain.id or domain.code: domain for domain in domains}

    def get(self, domain_id):
        return self._items.get(domain_id)

    def get_by_code(self, code):
        for domain in self._items.values():
            if domain.code == code:
                return domain
        return None


class _RuntimeBindingService:
    def __init__(self, adapter=None, dialect=None):
        self.adapter = adapter
        self.dialect = dialect

    def resolve_dialect_for_cube(self, cube):
        if isinstance(self.dialect, Exception):
            raise self.dialect
        return self.dialect

    def resolve_adapter_for_cube_name(self, primary_cube_name, cube_repo):
        cube = cube_repo.get(primary_cube_name)
        return self.adapter, {"id": cube.source_id}, cube.source_database, cube


def _cube(name: str, joins: dict | None = None) -> CubeDefinition:
    return CubeDefinition(
        name=name,
        title=name,
        table=f"public.{name}",
        source_id=1,
        source_database="analytics",
        status="active",
        dimensions={
            "id": DimensionDef(title="ID", type="number", sql="{CUBE}.id", primary_key=True),
            "student_id": DimensionDef(title="学生ID", type="number", sql="{CUBE}.student_id"),
        },
        measures={"total_count": MeasureDef(title="总数", type="count", sql="{CUBE}.id")},
        joins=joins or {},
    )


def test_multi_cube_query_requires_domain_context():
    service = SemanticQueryService(cube_repo=_CubeRepo([_cube("answer_records"), _cube("student")]))

    with pytest.raises(CompilationError, match="domain_code"):
        service.compile_query(
            {
                "measures": ["answer_records.total_count"],
                "dimensions": ["student.id"],
            }
        )


def test_domain_context_scopes_cube_join_graph_without_owning_join_semantics():
    domain = DomainDefinition(
        code="academic",
        name="学业域",
        status="active",
        cubes=["answer_records", "student"],
    )
    answer_records = _cube(
        "answer_records",
        joins={
            "answer_to_student": JoinDef(
                cube="student",
                type="left",
                relationship="N:1",
                sql="{CUBE}.student_id = {student}.id",
            )
        },
    )
    service = SemanticQueryService(
        cube_repo=_CubeRepo([answer_records, _cube("student")]),
        domain_repo=_DomainRepo([domain]),
    )

    result = service.compile_query(
        {
            "measures": ["answer_records.total_count"],
            "dimensions": ["student.id"],
            "domain_code": "academic",
        }
    )

    assert "LEFT JOIN public.student student ON answer_records.student_id = student.id" in result.sql


def test_domain_context_does_not_inject_join_semantics():
    domain = DomainDefinition(
        code="academic",
        name="学业域",
        status="active",
        cubes=["answer_records", "student"],
    )
    service = SemanticQueryService(
        cube_repo=_CubeRepo([_cube("answer_records"), _cube("student")]),
        domain_repo=_DomainRepo([domain]),
    )

    with pytest.raises(Exception, match="No JOIN path|join path not found|关联路径不存在|not found"):
        service.compile_query(
            {
                "measures": ["answer_records.total_count"],
                "dimensions": ["student.id"],
                "domain_code": "academic",
            }
        )


def test_multi_cube_query_rejects_non_active_domain():
    domain = DomainDefinition(
        code="academic",
        name="学业域",
        status="draft",
        cubes=["answer_records", "student"],
    )
    service = SemanticQueryService(
        cube_repo=_CubeRepo([_cube("answer_records"), _cube("student")]),
        domain_repo=_DomainRepo([domain]),
    )

    with pytest.raises(CompilationError, match="当前状态为 'draft'"):
        service.compile_query(
            {
                "measures": ["answer_records.total_count"],
                "dimensions": ["student.id"],
                "domain_code": "academic",
            }
        )


def test_query_returns_prepare_error_as_non_retryable():
    service = SemanticQueryService(
        cube_repo=_CubeRepo([_cube("answer_records")]),
        runtime_binding_service=_RuntimeBindingService(dialect=RuntimeError("dialect unavailable")),
    )

    result = service.query({"measures": ["answer_records.total_count"]})

    assert result["retryable"] is False
    assert "查询准备失败" in result["error"]


def test_resolve_dialect_returns_cached_dialect_when_primary_cube_missing():
    service = SemanticQueryService(
        cube_repo=_CubeRepo([_cube("answer_records")]),
        runtime_binding_service=_RuntimeBindingService(dialect=RuntimeError("should not be used")),
    )

    dialect = service._resolve_dialect(QueryDSL(measures=["ghost.total_count"]))

    assert isinstance(dialect, MaxComputeDialect)


def test_query_uses_owned_adapter_closes_and_returns_empty_message():
    class _Adapter:
        def __init__(self):
            self.closed = False

        def execute_query(self, sql, limit=50000):
            return {"columns": ["total_count"], "rows": []}

        def close(self):
            self.closed = True

    adapter = _Adapter()
    service = SemanticQueryService(
        cube_repo=_CubeRepo([_cube("answer_records")]),
        runtime_binding_service=_RuntimeBindingService(adapter=adapter),
    )

    result = service.query({"measures": ["answer_records.total_count"]})

    assert result["row_count"] == 0
    assert result["message"] == "查询成功，结果为空（0 行）。"
    assert adapter.closed is True


def test_compile_query_rejects_cross_source_and_missing_domain_membership():
    answer_cube = _cube("answer_records")
    student_cube = _cube("student")
    student_cube.source_id = 2
    domain = DomainDefinition(
        code="academic",
        name="学业域",
        status="active",
        cubes=["answer_records"],
    )
    service = SemanticQueryService(
        cube_repo=_CubeRepo([answer_cube, student_cube]),
        domain_repo=_DomainRepo([domain]),
    )

    with pytest.raises(CompilationError, match="未包含这些 Cube"):
        service.compile_query(
            {
                "measures": ["answer_records.total_count"],
                "dimensions": ["student.id"],
                "domain_code": "academic",
            }
        )

    domain.cubes.append("student")
    with pytest.raises(CompilationError, match="不支持跨数据源 JOIN"):
        service.compile_query(
            {
                "measures": ["answer_records.total_count"],
                "dimensions": ["student.id"],
                "domain_code": "academic",
            }
        )


def test_get_join_graph_caches_when_no_getter():
    repo = _CubeRepo([_cube("answer_records")])
    service = SemanticQueryService(cube_repo=repo)

    first = service.get_join_graph()
    second = service.get_join_graph()
    service.invalidate_cache()
    third = service.get_join_graph()

    assert first is second
    assert third is not first


def test_build_domain_scoped_join_graph_rejects_missing_cube():
    domain = DomainDefinition(
        code="academic",
        name="学业域",
        status="active",
        cubes=["answer_records", "student"],
    )
    service = SemanticQueryService(cube_repo=_CubeRepo([_cube("answer_records")]))

    with pytest.raises(CompilationError, match="引用了不存在的 Cube: student"):
        service._build_domain_scoped_join_graph(domain)


def test_infer_primary_cube_and_friendly_hints_cover_remaining_branches():
    assert SemanticQueryService._infer_primary_cube_name(
        QueryDSL(dimensions=["student.id"])
    ) == "student"
    assert SemanticQueryService._infer_primary_cube_name(
        QueryDSL(time_dimensions=[{"dimension": "answer_records.answer_date"}])
    ) == "answer_records"
    with pytest.raises(CompilationError, match="at least one measure or dimension"):
        SemanticQueryService._infer_primary_cube_name(QueryDSL())

    assert "可用的 Cube 列表" in SemanticQueryService._friendly_compile_hint("unknown cube: ghost")
    assert "维度和指标" in SemanticQueryService._friendly_compile_hint("unknown field: ghost.id")
    assert "缩小 date_range" in SemanticQueryService._friendly_compile_hint("max_range_days exceeded")
    assert "扇出风险" in SemanticQueryService._friendly_compile_hint("relationship not supported")
    assert "关联路径不存在" in SemanticQueryService._friendly_compile_hint("join not found")
    assert "DSL 格式可能有误" in SemanticQueryService._friendly_compile_hint("other")

    assert "语法错误" in SemanticQueryService._friendly_execute_hint("Syntax error near FROM", False)
    assert "无权限" in SemanticQueryService._friendly_execute_hint("Permission denied", False)
    assert "查询超时" in SemanticQueryService._friendly_execute_hint("timed out", True)
    assert "稍后重试" in SemanticQueryService._friendly_execute_hint("temporary", True)
    assert "简化查询条件" in SemanticQueryService._friendly_execute_hint("other", False)


def test_runtime_helpers_cover_join_graph_adapter_domain_and_inactive_cube_paths():
    getter_graph = object()
    service = SemanticQueryService(
        cube_repo=_CubeRepo([_cube("orders")]),
        join_graph_getter=lambda: getter_graph,
        domain_repo=_DomainRepo([]),
    )

    assert service.get_join_graph() is getter_graph
    assert service._resolve_dialect(QueryDSL(measures=["ghost.total_count"])).__class__ is MaxComputeDialect

    with pytest.raises(RuntimeError, match="未注入运行时绑定服务"):
        service._resolve_adapter("orders")

    draft_cube = _cube("draft_orders")
    draft_cube.status = "draft"
    with pytest.raises(CompilationError, match="当前状态为 'draft'"):
        SemanticQueryService(cube_repo=_CubeRepo([draft_cube])).compile_query(
            {"measures": ["draft_orders.total_count"]}
        )

    refs = service._load_referenced_cubes(
        QueryDSL(
            measures=["orders.total_count"],
            join_path=["orders"],
            filters=[{"dimension": "orders.id", "operator": "equals", "values": ["1"]}],
        )
    )
    assert set(refs.keys()) == {"orders"}

    with pytest.raises(CompilationError, match="未找到领域: missing"):
        service._resolve_domain(QueryDSL(measures=["orders.total_count"], domain_code="missing"))


def test_query_handles_execution_error_and_swallowed_close_failure():
    class FailingAdapter:
        def execute_query(self, sql, limit=50000):
            raise RuntimeError("timed out")

        def close(self):
            raise RuntimeError("close failed")

    adapter = FailingAdapter()
    service = SemanticQueryService(
        cube_repo=_CubeRepo([_cube("answer_records")]),
        runtime_binding_service=_RuntimeBindingService(adapter=adapter),
    )

    result = service.query({"measures": ["answer_records.total_count"]})

    assert result["retryable"] is True
    assert "SQL 执行失败" in result["error"]
    assert "查询超时" in result["hint"]


def test_query_error_responses_carry_stable_error_codes():
    """Phase 3 证据包：DSL 校验 / 编译 / 准备 / 执行失败都带稳定 error_code。"""
    repo = _CubeRepo([_cube("answer_records"), _cube("student")])

    invalid_dsl = SemanticQueryService(cube_repo=repo).query({"measures": "not-a-list"})
    assert invalid_dsl["error_code"] == "dsl_validate_error"

    compile_fail = SemanticQueryService(cube_repo=repo).query(
        {"measures": ["answer_records.total_count"], "dimensions": ["student.id"]}
    )
    assert compile_fail["error_code"] == "compile_error"

    prepare_fail = SemanticQueryService(
        cube_repo=repo,
        runtime_binding_service=_RuntimeBindingService(dialect=RuntimeError("dialect unavailable")),
    ).query({"measures": ["answer_records.total_count"]})
    assert prepare_fail["error_code"] == "datasource_binding_error"

    class FailingAdapter:
        def execute_query(self, sql, limit=50000):
            raise RuntimeError("Permission denied for table")

    execute_fail = SemanticQueryService(
        cube_repo=repo,
        runtime_binding_service=_RuntimeBindingService(adapter=FailingAdapter()),
    ).query({"measures": ["answer_records.total_count"]})
    assert execute_fail["error_code"] == "permission_denied"
    assert execute_fail["definition_hash"]


def test_classify_execute_error_enums():
    classify = SemanticQueryService._classify_execute_error
    assert classify("Syntax error near FROM") == "sql_syntax_error"
    assert classify("ODPS-0130161: parse exception") == "sql_syntax_error"
    assert classify("Permission denied") == "permission_denied"
    assert classify("query timed out") == "execute_timeout"
    assert classify("Invalid table name") == "schema_mismatch"
    assert classify("something else") == "execute_error"


def test_query_success_includes_definition_hash():
    class _Adapter:
        def execute_query(self, sql, limit=50000):
            return {"columns": ["total_count"], "rows": [[1]]}

    service = SemanticQueryService(
        cube_repo=_CubeRepo([_cube("answer_records")]),
        runtime_binding_service=_RuntimeBindingService(adapter=_Adapter()),
    )

    result = service.query({"measures": ["answer_records.total_count"]})

    assert result["row_count"] == 1
    assert isinstance(result["definition_hash"], str) and len(result["definition_hash"]) == 64
    # 同一定义重复计算应稳定
    assert result["definition_hash"] == service.definition_hash("answer_records")
    assert service.definition_hash("ghost") is None


def test_ensure_compiler_rebuilds_when_runtime_dialect_changes():
    class AnotherDialect(MaxComputeDialect):
        pass

    first = MaxComputeDialect()
    second = AnotherDialect()
    runtime = _RuntimeBindingService(dialect=first)
    service = SemanticQueryService(
        cube_repo=_CubeRepo([_cube("orders")]),
        runtime_binding_service=runtime,
    )

    compiler1 = service._ensure_compiler(QueryDSL(measures=["orders.total_count"]))
    runtime.dialect = second
    compiler2 = service._ensure_compiler(QueryDSL(measures=["orders.total_count"]))

    assert compiler1 is not compiler2
