"""
语义查询服务
"""
from __future__ import annotations

import time
from typing import Any, Callable, Dict, Optional

from app.application.semantic.semantic_runtime_binding_service import (
    SemanticRuntimeBindingService,
)
from app.domain.semantic.compiler import CompilationError, CompileResult, QueryCompiler
from app.domain.semantic.dialects import MaxComputeDialect, SQLDialect
from app.domain.semantic.entities import CubeDefinition, DomainDefinition, QueryDSL
from app.domain.semantic.join_graph import JoinGraph
from app.domain.semantic.ports.cube_repository import ICubeRepository
from app.domain.semantic.ports.domain_repository import IDomainRepository
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class SemanticQueryService:
    def __init__(
        self,
        cube_repo: ICubeRepository,
        dialect: Optional[SQLDialect] = None,
        join_graph_getter: Optional[Callable[[], JoinGraph]] = None,
        runtime_binding_service: Optional[SemanticRuntimeBindingService] = None,
        domain_repo: Optional[IDomainRepository] = None,
    ):
        self._cube_repo = cube_repo
        self._dialect = dialect or MaxComputeDialect()
        self._join_graph_getter = join_graph_getter
        self._runtime_binding_service = runtime_binding_service
        self._domain_repo = domain_repo
        self._compiler: Optional[QueryCompiler] = None
        self._graph: Optional[JoinGraph] = None

    def invalidate_cache(self) -> None:
        self._compiler = None
        self._graph = None

    def get_join_graph(self) -> JoinGraph:
        if self._join_graph_getter is not None:
            return self._join_graph_getter()
        if self._graph is None:
            self._graph = JoinGraph(self._cube_repo.list_all())
        return self._graph

    def compile_query(self, dsl_dict: Dict[str, Any]) -> CompileResult:
        dsl = QueryDSL(**dsl_dict)
        self._validate_query_cubes(dsl)
        return self._build_compiler(dsl).compile(dsl)

    def query(self, dsl_dict: Dict[str, Any], adapter: Any = None) -> Dict[str, Any]:
        try:
            dsl = QueryDSL(**dsl_dict)
            self._validate_query_cubes(dsl)
            compiled = self._build_compiler(dsl).compile(dsl)
        except CompilationError as exc:
            return {
                "error": f"DSL 编译失败: {str(exc)}",
                "hint": self._friendly_compile_hint(str(exc)),
                "retryable": True,
            }
        except Exception as exc:
            return {
                "error": f"查询准备失败: {str(exc)}",
                "hint": "请检查 Cube 数据源绑定和状态是否正确。",
                "retryable": False,
            }

        sql = compiled.sql
        logger.info("semantic_query_compiled", sql=sql, primary=compiled.primary_cube)
        from app.shared.utils.sql_validator import prepare_readonly_sql

        safe_sql = prepare_readonly_sql(sql, limit=50000)
        owns_adapter = adapter is None
        adapter = adapter or self._resolve_adapter(compiled.primary_cube)
        start_ts = time.time()
        try:
            result = adapter.execute_query(safe_sql, limit=50000)
        except Exception as exc:
            elapsed = int((time.time() - start_ts) * 1000)
            error_msg = str(exc)
            retryable = self._is_retryable(error_msg)
            return {
                "error": f"SQL 执行失败: {error_msg}",
                "hint": self._friendly_execute_hint(error_msg, retryable),
                "sql": sql,
                "execution_time_ms": elapsed,
                "retryable": retryable,
            }
        finally:
            if owns_adapter and hasattr(adapter, "close"):
                try:
                    adapter.close()
                except Exception:
                    pass

        elapsed = int((time.time() - start_ts) * 1000)
        data = result.get("data") or result.get("rows") or []
        row_count = len(data) if data else 0
        resp: Dict[str, Any] = {
            "columns": result.get("columns", []),
            "data": data,
            "row_count": row_count,
            "execution_time_ms": elapsed,
            "sql": sql,
            "primary_cube": compiled.primary_cube,
            "joined_cubes": compiled.joined_cubes,
            "retryable": False,
        }
        if row_count == 0:
            resp["message"] = "查询成功，结果为空（0 行）。"
        return resp

    def compile_and_execute(self, dsl_dict: Dict[str, Any], adapter: Any) -> Dict[str, Any]:
        return self.query(dsl_dict, adapter)

    def _ensure_compiler(self, dsl: Optional[QueryDSL] = None) -> QueryCompiler:
        dialect = self._resolve_dialect(dsl) if dsl is not None else self._dialect
        if self._compiler is None or dialect.__class__ is not self._dialect.__class__:
            self._dialect = dialect
            self._compiler = QueryCompiler(self.get_join_graph(), self._dialect)
        return self._compiler

    def _build_compiler(self, dsl: QueryDSL) -> QueryCompiler:
        domain = self._resolve_domain(dsl)
        dialect = self._resolve_dialect(dsl)
        if domain is None:
            if self._compiler is None or dialect.__class__ is not self._dialect.__class__:
                self._dialect = dialect
                self._compiler = QueryCompiler(self.get_join_graph(), self._dialect)
            return self._compiler
        return QueryCompiler(self._build_domain_scoped_join_graph(domain), dialect)

    def _resolve_dialect(self, dsl: QueryDSL) -> SQLDialect:
        if self._runtime_binding_service is None:
            return self._dialect
        primary_cube_name = self._infer_primary_cube_name(dsl)
        cube = self._cube_repo.get(primary_cube_name)
        if cube is None:
            return self._dialect
        return self._runtime_binding_service.resolve_dialect_for_cube(cube)

    def _resolve_adapter(self, primary_cube_name: str) -> Any:
        if self._runtime_binding_service is None:
            raise RuntimeError("语义查询未注入运行时绑定服务，且未显式传入 adapter")
        adapter, _datasource, _database, _cube = self._runtime_binding_service.resolve_adapter_for_cube_name(
            primary_cube_name,
            self._cube_repo,
        )
        return adapter

    def _validate_query_cubes(self, dsl: QueryDSL) -> None:
        cubes = self._load_referenced_cubes(dsl)
        domain = self._resolve_domain(dsl)
        if len(cubes) > 1 and domain is None:
            raise CompilationError("多 Cube 查询必须显式指定 domain_code 或 domain_id")
        for cube in cubes.values():
            if cube.status != "active":
                raise CompilationError(
                    f"Cube '{cube.name}' 当前状态为 '{cube.status}'，不能进入默认查询链路"
                )
        if domain is not None:
            missing = set(cubes.keys()) - set(domain.cubes)
            if missing:
                raise CompilationError(
                    f"领域 '{domain.code}' 未包含这些 Cube: {', '.join(sorted(missing))}"
                )

        source_ids = {cube.source_id for cube in cubes.values() if cube.source_id is not None}
        if len(source_ids) > 1:
            raise CompilationError("当前语义查询不支持跨数据源 JOIN，请拆分查询或重构模型")

    def _load_referenced_cubes(self, dsl: QueryDSL) -> Dict[str, CubeDefinition]:
        refs = []
        refs.extend(dsl.measures)
        refs.extend(dsl.dimensions)
        refs.extend(dsl.segments)
        refs.extend(td.dimension for td in dsl.time_dimensions)
        refs.extend(item.target for item in dsl.filters)
        if dsl.join_path:
            refs.extend(dsl.join_path)
        names = {ref.split(".", 1)[0] if "." in ref else ref for ref in refs}
        cubes: Dict[str, CubeDefinition] = {}
        for name in names:
            cube = self._cube_repo.get(name)
            if cube is not None:
                cubes[name] = cube
        return cubes

    @staticmethod
    def _infer_primary_cube_name(dsl: QueryDSL) -> str:
        if dsl.measures:
            return dsl.measures[0].split(".", 1)[0]
        if dsl.dimensions:
            return dsl.dimensions[0].split(".", 1)[0]
        if dsl.time_dimensions:
            return dsl.time_dimensions[0].dimension.split(".", 1)[0]
        raise CompilationError("DSL must have at least one measure or dimension")

    @staticmethod
    def _is_retryable(error_msg: str) -> bool:
        non_retryable = [
            "ODPS-0130",
            "Syntax error",
            "Invalid table",
            "column not found",
            "Permission denied",
        ]
        lower = error_msg.lower()
        return not any(keyword.lower() in lower for keyword in non_retryable)

    @staticmethod
    def _friendly_compile_hint(error_msg: str) -> str:
        lower = error_msg.lower()
        if "unknown cube" in lower or "未找到" in lower:
            return "该 Cube 名称可能拼写有误，请用 list_cubes 确认可用的 Cube 列表。"
        if "unknown field" in lower or "unknown dimension" in lower or "unknown measure" in lower:
            return "字段名可能不正确，请用 describe_cube 确认可用的维度和指标。"
        if "max_range_days" in lower or "date range" in lower:
            return "查询时间跨度超过该 Cube 允许的最大范围，请缩小 date_range。"
        if "relationship" in lower and "not supported" in lower:
            return "当前 JOIN 存在 1:N 或 N:N 扇出风险，请改用更细粒度查询或重构指标口径。"
        if "join" in lower and ("not found" in lower or "too deep" in lower):
            return "两个 Cube 之间的关联路径不存在或层级过深，请检查 Cube 关联关系或尝试指定 join_path。"
        return "DSL 格式可能有误，请用 describe_cube 确认字段名和查询示例后重新构造。"

    @staticmethod
    def _friendly_execute_hint(error_msg: str, retryable: bool) -> str:
        lower = error_msg.lower()
        if "syntax error" in lower:
            return "生成的 SQL 存在语法错误，建议检查 DSL 字段引用是否正确。"
        if "permission" in lower:
            return "当前账号无权限访问该表，请联系管理员授权。"
        if "timeout" in lower or "timed out" in lower:
            return "查询超时，建议缩小时间范围或减少查询字段。"
        if retryable:
            return "执行遇到临时问题，可以稍后重试。"
        return "查询执行失败，建议简化查询条件后重试，或改用 execute_sql 直接编写 SQL。"

    def _resolve_domain(self, dsl: QueryDSL) -> Optional[DomainDefinition]:
        identifier = dsl.domain_id or dsl.domain_code
        if not identifier or self._domain_repo is None:
            return None
        domain = self._domain_repo.get(identifier) or self._domain_repo.get_by_code(identifier)
        if domain is None:
            raise CompilationError(f"未找到领域: {identifier}")
        if domain.status != "active":
            raise CompilationError(f"领域 '{domain.code}' 当前状态为 '{domain.status}'，不能进入默认查询链路")
        return domain

    def _build_domain_scoped_join_graph(self, domain: DomainDefinition) -> JoinGraph:
        """按 Domain 候选资产裁剪 Cube JoinGraph，不从 Domain 注入 Join 语义。"""
        domain_cubes: Dict[str, CubeDefinition] = {}
        domain_cube_names = set(domain.cubes)
        for cube_name in domain.cubes:
            cube = self._cube_repo.get(cube_name)
            if cube is None:
                raise CompilationError(f"领域 '{domain.code}' 引用了不存在的 Cube: {cube_name}")
            payload = cube.model_dump(mode="json")
            payload["joins"] = {
                alias: join
                for alias, join in (payload.get("joins") or {}).items()
                if isinstance(join, dict) and join.get("cube") in domain_cube_names
            }
            domain_cubes[cube_name] = CubeDefinition(**payload)

        return JoinGraph(list(domain_cubes.values()))
