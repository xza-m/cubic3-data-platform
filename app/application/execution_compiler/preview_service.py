"""最小执行编译预览服务。"""
from __future__ import annotations

from datetime import date, datetime, timedelta
import re
from typing import Any, Dict, Optional

from app.application.governance.access import (
    canonical_sql_hash,
    infer_data_level_for_resource,
)
from app.domain.semantic.compiler import CompilationError, QueryCompiler
from app.domain.semantic.entities import QueryDSL
from app.domain.semantic.join_graph import JoinGraph
from app.domain.ontology.ports.metric_repository import IBusinessMetricRepository
from app.domain.semantic.ports.cube_repository import ICubeRepository


def _split_table_ref(table_ref: str) -> tuple[str, str]:
    value = (table_ref or "").strip()
    if "." not in value:
        return "", value
    schema, _, table = value.rpartition(".")
    return schema, table


def _metric_resource_set(*, metric, cube, data_level: str) -> dict[str, Any]:
    schema, table = _split_table_ref(cube.table or cube.name)
    source_id = cube.source_id if cube.source_id is not None else "unknown"
    return {
        "logical": {
            "cubes": [cube.name],
            "metrics": [metric.name],
        },
        "physical": [
            {
                "data_source_id": str(source_id),
                "engine": "maxcompute",
                "project": cube.source_database or "",
                "schema": schema,
                "table": table,
                "columns": [],
                "data_level": data_level,
                "tags": [],
            }
        ],
    }


def _base_metric_resource_set(*, metric) -> dict[str, Any]:
    return {
        "logical": {
            "cubes": [],
            "metrics": [metric.name],
        },
        "physical": [],
    }


def _retrieval_resource_set(sources: list[str]) -> dict[str, Any]:
    return {
        "logical": {"retrieval_sources": list(sources)},
        "physical": [],
    }


def _tool_resource_set(tool_name: str) -> dict[str, Any]:
    return {
        "logical": {"tools": [tool_name]},
        "physical": [],
    }


def _normalize(value: str) -> str:
    return re.sub(r"[\W_]+", "", str(value).lower())


class ExecutionCompilerPreviewService:
    def __init__(
        self,
        *,
        metric_repository: IBusinessMetricRepository,
        cube_repository: ICubeRepository,
        policy_guard_service=None,
    ):
        self._metric_repository = metric_repository
        self._cube_repository = cube_repository
        self._policy_guard_service = policy_guard_service

    def compile_preview(
        self,
        *,
        target_type: str,
        metric_name: Optional[str] = None,
        retrieval_query: Optional[str] = None,
        retrieval_sources: Optional[list[str]] = None,
        tool_name: Optional[str] = None,
        tool_arguments: Optional[Dict[str, Any]] = None,
        analysis_intent: Optional[dict[str, Any]] = None,
        query_dsl: Optional[dict[str, Any]] = None,
        viewer_roles: Optional[list[str]] = None,
        principal_context: Optional[dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        normalized_target_type = (target_type or "").strip().lower()
        if normalized_target_type == "sql":
            if not metric_name:
                raise ValueError("SQL 编译预览缺少 metric_name")
            return self.compile_metric_preview(
                metric_name,
                analysis_intent=analysis_intent,
                query_dsl=query_dsl,
                viewer_roles=viewer_roles or [],
                principal_context=principal_context,
            )
        if normalized_target_type == "retrieval":
            return self.compile_retrieval_preview(
                retrieval_query=retrieval_query,
                retrieval_sources=retrieval_sources or [],
                viewer_roles=viewer_roles or [],
                principal_context=principal_context,
            )
        if normalized_target_type == "tool":
            return self.compile_tool_preview(
                tool_name=tool_name,
                tool_arguments=tool_arguments or {},
                viewer_roles=viewer_roles or [],
                principal_context=principal_context,
            )
        raise ValueError(f"不支持的执行目标类型: {target_type}")

    def compile_plan_preview(
        self,
        *,
        target_type: str,
        metric_name: Optional[str] = None,
        retrieval_query: Optional[str] = None,
        retrieval_sources: Optional[list[str]] = None,
        tool_name: Optional[str] = None,
        tool_arguments: Optional[Dict[str, Any]] = None,
        analysis_intent: Optional[dict[str, Any]] = None,
        query_dsl: Optional[dict[str, Any]] = None,
        viewer_roles: Optional[list[str]] = None,
        principal_context: Optional[dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        preview = self.compile_preview(
            target_type=target_type,
            metric_name=metric_name,
            retrieval_query=retrieval_query,
            retrieval_sources=retrieval_sources,
            tool_name=tool_name,
            tool_arguments=tool_arguments,
            analysis_intent=analysis_intent,
            query_dsl=query_dsl,
            viewer_roles=viewer_roles,
            principal_context=principal_context,
        )
        steps = {
            "sql": ["识别业务指标语义", "绑定分析层 Measure", "生成伪 SQL 执行预览"],
            "retrieval": ["识别检索意图", "绑定检索来源", "生成 Retrieval 请求预览"],
            "tool": ["识别工具调用意图", "校验工具参数", "生成 Tool Call 预览"],
        }[preview["target_type"]]
        return {
            "target_type": preview["target_type"],
            "status": preview["status"],
            "steps": steps,
            "preview": preview,
        }

    def compile_metric_preview(
        self,
        metric_name: str,
        analysis_intent: Optional[dict[str, Any]] = None,
        query_dsl: Optional[dict[str, Any]] = None,
        viewer_roles: Optional[list[str]] = None,
        principal_context: Optional[dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        metric = self._metric_repository.get(metric_name)
        if metric is None:
            raise ValueError(f"未找到业务指标: {metric_name}")
        roles = self._resolve_roles(viewer_roles=viewer_roles, principal_context=principal_context)
        policy = self._evaluate_policy(target_type="metric", target_name=metric.name, viewer_roles=roles)
        if policy["status"] == "blocked":
            return self._blocked_metric_preview(
                metric=metric,
                reason=policy["reason"],
                bindings={"metric_name": metric.name},
                policy=policy,
            )
        if not metric.measure_refs:
            return self._blocked_metric_preview(
                metric=metric,
                reason="业务指标尚未绑定可执行 Measure",
                bindings={"metric_name": metric.name},
                policy=policy,
            )
        measure_ref = metric.measure_refs[0]
        cube_name, _, measure_name = measure_ref.partition(".")
        cube = self._cube_repository.get(cube_name)
        if cube is None or measure_name not in cube.measures:
            return self._blocked_metric_preview(
                metric=metric,
                reason=f"未找到可执行 Measure 引用: {measure_ref}",
                bindings={"metric_name": metric.name, "measure_ref": measure_ref},
                policy=policy,
            )
        physical_resource = cube.table if cube.table else cube.name
        data_level = infer_data_level_for_resource(physical_resource)
        resource_set = _metric_resource_set(metric=metric, cube=cube, data_level=data_level)
        if str(getattr(cube, "status", "active") or "") != "active":
            return self._blocked_metric_preview(
                metric=metric,
                reason=f"Cube '{cube.name}' 当前状态为 '{cube.status}'，不能进入默认查询链路",
                bindings={
                    "metric_name": metric.name,
                    "measure_ref": measure_ref,
                    "cube_name": cube.name,
                    "cube_status": cube.status,
                },
                policy=policy,
                resource_set=resource_set,
                data_level=data_level,
            )
        measure = cube.measures[measure_name]
        try:
            dsl = self._build_query_dsl(
                metric=metric,
                cube=cube,
                measure_ref=measure_ref,
                analysis_intent=analysis_intent or {},
                query_dsl=query_dsl,
            )
            compiled = QueryCompiler(JoinGraph(self._cube_repository.list_all())).compile(dsl)
        except (CompilationError, ValueError) as exc:
            return self._blocked_metric_preview(
                metric=metric,
                reason=f"QueryDSL 编译失败: {exc}",
                bindings={
                    "metric_name": metric.name,
                    "measure_ref": measure_ref,
                    "cube_name": cube.name,
                },
                policy=policy,
                resource_set=resource_set,
                data_level=data_level,
            )
        logical_sql = compiled.sql
        sql_hash = canonical_sql_hash(logical_sql)
        query_dsl_payload = dsl.model_dump(mode="json", exclude_none=True)
        return {
            "status": "ready",
            "target_type": "sql",
            "pseudo_sql": logical_sql,
            "execution_request": {
                "source_id": cube.source_id,
                "sql_query": logical_sql,
                "limit": query_dsl_payload.get("limit") or 100,
            },
            "query_dsl": query_dsl_payload,
            "logical_sql": logical_sql,
            "resource_set": resource_set,
            "data_level": data_level,
            "sql_hash": sql_hash,
            "ticket_material": {
                "target_type": "sql",
                "resource_set": resource_set,
                "sql_hash": sql_hash,
                "data_level": data_level,
            },
            "bindings": {
                "metric_name": metric.name,
                "measure_ref": measure_ref,
                "cube_name": cube.name,
                "query_dsl_status": "compiled",
            },
            "policy": policy,
            "traceability": {
                "compiler": {
                    "source": "query_compiler",
                    "primary_cube": compiled.primary_cube,
                    "joined_cubes": compiled.joined_cubes,
                },
                "business_metric": {
                    "name": metric.name,
                    "title": metric.title,
                    "object_name": metric.object_name,
                    "semantic_formula": metric.semantic_formula,
                },
                "analysis_measure": {
                    "measure_ref": measure_ref,
                    "measure_name": measure_name,
                    "measure_title": measure.title,
                    "cube_name": cube.name,
                    "cube_title": cube.title,
                },
                "data_source": {
                    "table": cube.table,
                    "source_dataset_id": cube.source_dataset_id,
                    "source_dataset_type": cube.source_dataset_type,
                    "source_database": cube.source_database,
                },
            },
        }

    def _build_query_dsl(
        self,
        *,
        metric,
        cube,
        measure_ref: str,
        analysis_intent: dict[str, Any],
        query_dsl: Optional[dict[str, Any]],
    ) -> QueryDSL:
        if query_dsl is not None:
            return QueryDSL(**query_dsl)

        dimensions: list[str] = []
        inferred_join_path = analysis_intent.get("join_path")
        for term in analysis_intent.get("dimension_terms") or analysis_intent.get("dimensions") or []:
            dimension_ref, join_path = self._resolve_dimension_binding(cube, term)
            dimensions.append(dimension_ref)
            if join_path:
                if inferred_join_path and inferred_join_path != join_path:
                    raise CompilationError(f"维度词 '{term}' 需要不同 JoinPath，当前最小 Runtime 不支持多路径 Join")
                inferred_join_path = join_path
        time_dimensions: list[dict[str, Any]] = []
        time_window = analysis_intent.get("time_window") or {}
        if time_window:
            time_dimensions.append(
                {
                    "dimension": self._resolve_time_dimension_ref(cube, analysis_intent),
                    "date_range": self._resolve_time_window_range(time_window),
                }
            )

        order = []
        for item in analysis_intent.get("order_by") or []:
            ref = self._resolve_order_ref(metric=metric, measure_ref=measure_ref, cube=cube, item=item)
            direction = str(item.get("direction") or "desc").lower()
            order.append([ref, "desc" if direction == "desc" else "asc"])
        if not order and dimensions:
            order.append([measure_ref, "desc"])

        limit = analysis_intent.get("limit")
        return QueryDSL(
            measures=[measure_ref],
            dimensions=dimensions,
            filters=analysis_intent.get("filters") or [],
            time_dimensions=time_dimensions,
            segments=analysis_intent.get("segments") or [],
            order=order,
            limit=int(limit) if limit else (100 if analysis_intent else None),
            join_path=inferred_join_path,
            domain_id=analysis_intent.get("domain_id"),
            domain_code=analysis_intent.get("domain_code"),
        )

    def _resolve_dimension_binding(self, cube, term: str) -> tuple[str, list[str] | None]:
        direct = self._find_dimension_name(cube, term)
        if direct:
            return f"{cube.name}.{direct}", None

        for _join_name, join_def in cube.joins.items():
            target_cube = self._cube_repository.get(join_def.cube)
            if target_cube is None:
                continue
            if (
                cube.source_id is not None
                and target_cube.source_id is not None
                and cube.source_id != target_cube.source_id
            ):
                continue
            target_dimension = self._find_dimension_name(target_cube, term)
            if target_dimension:
                relationship = str(join_def.relationship or "N:1").upper()
                if relationship in {"1:N", "N:N"}:
                    raise CompilationError(
                        f"维度词 '{term}' 命中 Join '{cube.name}->{target_cube.name}'，但关系 {relationship} 不支持指标查询"
                    )
                return f"{target_cube.name}.{target_dimension}", [cube.name, target_cube.name]

        raise CompilationError(f"无法将维度词 '{term}' 绑定到 Cube '{cube.name}'")

    @staticmethod
    def _resolve_dimension_ref(cube, term: str) -> str:
        matched = ExecutionCompilerPreviewService._find_dimension_name(cube, term)
        if matched:
            return f"{cube.name}.{matched}"
        raise CompilationError(f"无法将维度词 '{term}' 绑定到 Cube '{cube.name}'")

    @staticmethod
    def _find_dimension_name(cube, term: str) -> str | None:
        normalized_term = _normalize(term)
        if not normalized_term:
            return None
        best_name: str | None = None
        best_score = 0
        for name, dimension in cube.dimensions.items():
            candidates = [
                ("name", name),
                ("title", dimension.title),
                *[("synonym", item) for item in (dimension.synonyms or [])],
            ]
            for source, candidate in candidates:
                score = ExecutionCompilerPreviewService._dimension_match_score(
                    term=normalized_term,
                    candidate=_normalize(candidate),
                    source=source,
                    dimension_name=name,
                    dimension_title=dimension.title,
                )
                if score > best_score:
                    best_score = score
                    best_name = name
        return best_name

    @staticmethod
    def _dimension_match_score(
        *,
        term: str,
        candidate: str,
        source: str,
        dimension_name: str,
        dimension_title: str,
    ) -> int:
        if not candidate:
            return 0
        if term == candidate:
            score = {"synonym": 120, "title": 100, "name": 90}.get(source, 80)
        elif term in candidate or candidate in term:
            score = {"synonym": 80, "title": 65, "name": 55}.get(source, 50)
        else:
            return 0

        normalized_name = _normalize(dimension_name)
        normalized_title = _normalize(dimension_title)
        term_mentions_id = any(token in term for token in ("id", "编号", "标识"))
        looks_like_id = normalized_name.endswith("id") or normalized_title.endswith("id")
        if looks_like_id and not term_mentions_id:
            score -= 30
        return max(score, 0)

    @staticmethod
    def _resolve_time_dimension_ref(cube, analysis_intent: dict[str, Any]) -> str:
        explicit = analysis_intent.get("time_dimension")
        if explicit:
            if "." in str(explicit):
                return str(explicit)
            return ExecutionCompilerPreviewService._resolve_dimension_ref(cube, str(explicit))
        if cube.partition and cube.partition.field in cube.dimensions:
            return f"{cube.name}.{cube.partition.field}"
        for name, dimension in cube.dimensions.items():
            if dimension.type == "time":
                return f"{cube.name}.{name}"
        raise CompilationError(f"Cube '{cube.name}' 没有可用于时间过滤的维度")

    @staticmethod
    def _resolve_time_window_range(time_window: dict[str, Any]) -> list[str]:
        window_type = str(time_window.get("type") or "").strip()
        if window_type != "last_n_days":
            raise CompilationError(f"不支持的时间窗口类型: {window_type}")
        days = int(time_window.get("n") or 7)
        if days <= 0:
            raise CompilationError("last_n_days.n 必须大于 0")
        anchor = ExecutionCompilerPreviewService._parse_anchor_date(time_window.get("anchor_date"))
        start = anchor - timedelta(days=days - 1)
        return [start.strftime("%Y-%m-%d"), anchor.strftime("%Y-%m-%d")]

    @staticmethod
    def _parse_anchor_date(value: Any) -> date:
        if not value:
            return date.today()
        if isinstance(value, date) and not isinstance(value, datetime):
            return value
        return datetime.strptime(str(value), "%Y-%m-%d").date()

    @staticmethod
    def _resolve_order_ref(*, metric, measure_ref: str, cube, item: dict[str, Any]) -> str:
        term = str(item.get("term") or item.get("ref") or "").strip()
        if not term:
            return measure_ref
        normalized_term = _normalize(term)
        metric_candidates = [metric.name, metric.title, *(metric.aliases or [])]
        if any(normalized_term == _normalize(candidate) for candidate in metric_candidates if candidate):
            return measure_ref
        return ExecutionCompilerPreviewService._resolve_dimension_ref(cube, term)

    def compile_retrieval_preview(
        self,
        *,
        retrieval_query: Optional[str],
        retrieval_sources: list[str],
        viewer_roles: list[str],
        principal_context: Optional[dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        normalized_query = (retrieval_query or "").strip()
        if not normalized_query:
            raise ValueError("检索编译预览缺少 retrieval_query")
        sources = retrieval_sources or ["knowledge-base"]
        resource_set = _retrieval_resource_set(sources)
        return {
            "status": "ready",
            "target_type": "retrieval",
            "retrieval_request": {
                "query": normalized_query,
                "sources": sources,
                "top_k": 5,
            },
            "execution_request": {
                "query": normalized_query,
                "sources": sources,
                "top_k": 5,
            },
            "resource_set": resource_set,
            "data_level": "M0",
            "sql_hash": None,
            "ticket_material": {
                "target_type": "retrieval",
                "resource_set": resource_set,
                "data_level": "M0",
            },
            "bindings": {
                "retrieval_query": normalized_query,
                "source_count": len(sources),
            },
            "policy": {
                "status": "allow",
                "visibility": "public",
                "matched_policy": None,
                "required_roles": [],
            },
            "traceability": {
                "retrieval": {
                    "query": normalized_query,
                    "sources": sources,
                    "viewer_roles": self._resolve_roles(viewer_roles=viewer_roles, principal_context=principal_context),
                    "principal_context": principal_context or {},
                }
            },
        }

    def compile_tool_preview(
        self,
        *,
        tool_name: Optional[str],
        tool_arguments: Dict[str, Any],
        viewer_roles: list[str],
        principal_context: Optional[dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        normalized_tool_name = (tool_name or "").strip()
        if not normalized_tool_name:
            raise ValueError("工具编译预览缺少 tool_name")
        resource_set = _tool_resource_set(normalized_tool_name)
        return {
            "status": "ready",
            "target_type": "tool",
            "tool_call": {
                "name": normalized_tool_name,
                "arguments": tool_arguments,
            },
            "execution_request": {
                "name": normalized_tool_name,
                "arguments": tool_arguments,
            },
            "resource_set": resource_set,
            "data_level": "M0",
            "sql_hash": None,
            "ticket_material": {
                "target_type": "tool",
                "resource_set": resource_set,
                "data_level": "M0",
            },
            "bindings": {
                "tool_name": normalized_tool_name,
                "argument_count": len(tool_arguments),
            },
            "policy": {
                "status": "allow",
                "visibility": "public",
                "matched_policy": None,
                "required_roles": [],
            },
            "traceability": {
                "tool": {
                    "name": normalized_tool_name,
                    "arguments": tool_arguments,
                    "viewer_roles": self._resolve_roles(viewer_roles=viewer_roles, principal_context=principal_context),
                    "principal_context": principal_context or {},
                }
            },
        }

    def _evaluate_policy(
        self,
        *,
        target_type: str,
        target_name: str,
        viewer_roles: list[str],
    ) -> Dict[str, Any]:
        if self._policy_guard_service is None:
            return {
                "status": "allow",
                "visibility": "public",
                "matched_policy": None,
                "required_roles": [],
            }
        return self._policy_guard_service.evaluate(
            target_type=target_type,
            target_name=target_name,
            viewer_roles=viewer_roles,
        )

    def _blocked_metric_preview(
        self,
        *,
        metric,
        reason: str,
        bindings: Dict[str, Any],
        policy: Dict[str, Any],
        resource_set: Optional[dict[str, Any]] = None,
        data_level: str = "M0",
    ) -> Dict[str, Any]:
        normalized_resource_set = resource_set or _base_metric_resource_set(metric=metric)
        return {
            "status": "blocked",
            "target_type": "sql",
            "reason": reason,
            "pseudo_sql": None,
            "execution_request": None,
            "logical_sql": None,
            "resource_set": normalized_resource_set,
            "data_level": data_level,
            "sql_hash": None,
            "ticket_material": {
                "target_type": "sql",
                "resource_set": normalized_resource_set,
                "data_level": data_level,
            },
            "bindings": bindings,
            "policy": policy,
            "traceability": {
                "business_metric": {
                    "name": metric.name,
                    "title": metric.title,
                    "object_name": metric.object_name,
                    "semantic_formula": metric.semantic_formula,
                }
            },
        }

    @staticmethod
    def _resolve_roles(
        *,
        viewer_roles: Optional[list[str]],
        principal_context: Optional[dict[str, Any]],
    ) -> list[str]:
        roles: list[str] = []
        for role in (principal_context or {}).get("roles") or []:
            if role and role not in roles:
                roles.append(str(role))
        for role in viewer_roles or []:
            if role and role not in roles:
                roles.append(str(role))
        return roles
