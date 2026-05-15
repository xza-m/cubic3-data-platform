"""最小执行编译预览服务。"""
from __future__ import annotations

from datetime import date, timedelta
import re
from typing import Any, Dict, Iterable, Optional

from app.application.governance.access import (
    canonical_sql_hash,
    infer_data_level_for_resource,
)
from app.domain.semantic.compiler import CompilationError, QueryCompiler
from app.domain.semantic.dialects import MaxComputeDialect
from app.domain.semantic.entities import CubeDefinition, QueryDSL
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
        query_dsl: Optional[Dict[str, Any]] = None,
        question: Optional[str] = None,
        retrieval_query: Optional[str] = None,
        retrieval_sources: Optional[list[str]] = None,
        tool_name: Optional[str] = None,
        tool_arguments: Optional[Dict[str, Any]] = None,
        viewer_roles: Optional[list[str]] = None,
        principal_context: Optional[dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        normalized_target_type = (target_type or "").strip().lower()
        if normalized_target_type == "sql":
            if not metric_name:
                raise ValueError("SQL 编译预览缺少 metric_name")
            return self.compile_metric_preview(
                metric_name,
                query_dsl=query_dsl,
                question=question,
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
        query_dsl: Optional[Dict[str, Any]] = None,
        question: Optional[str] = None,
        retrieval_query: Optional[str] = None,
        retrieval_sources: Optional[list[str]] = None,
        tool_name: Optional[str] = None,
        tool_arguments: Optional[Dict[str, Any]] = None,
        viewer_roles: Optional[list[str]] = None,
        principal_context: Optional[dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        preview = self.compile_preview(
            target_type=target_type,
            metric_name=metric_name,
            query_dsl=query_dsl,
            question=question,
            retrieval_query=retrieval_query,
            retrieval_sources=retrieval_sources,
            tool_name=tool_name,
            tool_arguments=tool_arguments,
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
        query_dsl: Optional[Dict[str, Any]] = None,
        question: Optional[str] = None,
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
        query_dsl_payload = query_dsl or self._build_metric_query_dsl(
            metric=metric,
            cube=cube,
            measure_name=measure_name,
            question=question,
        )
        try:
            compiled = self._compile_query_dsl(query_dsl_payload)
        except CompilationError as exc:
            return self._blocked_metric_preview(
                metric=metric,
                reason=f"DSL 编译失败: {exc}",
                bindings={
                    "metric_name": metric.name,
                    "measure_ref": measure_ref,
                    "cube_name": cube.name,
                    "query_dsl": query_dsl_payload,
                },
                policy=policy,
                resource_set=resource_set,
                data_level=data_level,
            )
        logical_sql = compiled.sql
        sql_hash = canonical_sql_hash(logical_sql)
        return {
            "status": "ready",
            "target_type": "sql",
            "pseudo_sql": logical_sql,
            "execution_request": {
                "source_id": cube.source_id,
                "sql_query": logical_sql,
                "limit": query_dsl_payload.get("limit") or 100,
            },
            "logical_sql": logical_sql,
            "query_dsl": query_dsl_payload,
            "resource_set": resource_set,
            "data_level": data_level,
            "sql_hash": sql_hash,
            "ticket_material": {
                "target_type": "sql",
                "query_dsl": query_dsl_payload,
                "resource_set": resource_set,
                "sql_hash": sql_hash,
                "data_level": data_level,
            },
            "bindings": {
                "metric_name": metric.name,
                "measure_ref": measure_ref,
                "cube_name": cube.name,
                "query_dsl": query_dsl_payload,
            },
            "policy": policy,
            "traceability": {
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
                    "query_dsl": query_dsl_payload,
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

    def _build_metric_query_dsl(
        self,
        *,
        metric,
        cube: CubeDefinition,
        measure_name: str,
        question: Optional[str],
    ) -> Dict[str, Any]:
        question_text = (question or "").strip()
        measure_ref = f"{cube.name}.{measure_name}"
        dimensions = [
            f"{cube.name}.{dimension_name}"
            for dimension_name in self._infer_group_dimensions(question_text, cube)
        ]
        time_dimensions = [
            {
                "dimension": f"{cube.name}.{item['dimension']}",
                "date_range": item["date_range"],
            }
            for item in self._infer_time_dimensions(question_text, cube)
        ]
        order = [[measure_ref, "desc"]] if dimensions and any(keyword in question_text for keyword in ("top", "排行", "排名")) else []
        return {
            "measures": [measure_ref],
            "dimensions": dimensions,
            "time_dimensions": time_dimensions,
            "filters": [],
            "segments": [],
            "order": order,
            "limit": 100,
        }

    def _compile_query_dsl(self, query_dsl: Dict[str, Any]):
        dsl = QueryDSL(**query_dsl)
        self._validate_query_dsl_cubes_active(dsl)
        compiler = QueryCompiler(JoinGraph(self._cube_repository.list_all()), dialect=MaxComputeDialect())
        return compiler.compile(dsl)

    def _validate_query_dsl_cubes_active(self, dsl: QueryDSL) -> None:
        for cube_name in sorted(self._referenced_cube_names(dsl)):
            cube = self._cube_repository.get(cube_name)
            if cube is None:
                raise CompilationError(f"Unknown Cube: '{cube_name}'")
            if str(getattr(cube, "status", "active") or "") != "active":
                raise CompilationError(
                    f"Cube '{cube.name}' 当前状态为 '{cube.status}'，不能进入默认查询链路"
                )

    @staticmethod
    def _referenced_cube_names(dsl: QueryDSL) -> set[str]:
        refs: list[str] = []
        refs.extend(dsl.measures)
        refs.extend(dsl.dimensions)
        refs.extend(dsl.segments)
        refs.extend(item.target for item in dsl.filters)
        refs.extend(item.dimension for item in dsl.time_dimensions)
        refs.extend(pair[0] for pair in dsl.order if pair)
        return {ref.split(".", 1)[0] for ref in refs if "." in ref}

    def _infer_group_dimensions(self, question: str, cube: CubeDefinition) -> list[str]:
        terms = self._extract_group_terms(question)
        if not terms:
            return []
        selected: list[str] = []
        for term in terms:
            best_name = ""
            best_score = 0
            for name, dimension in cube.dimensions.items():
                score = self._score_dimension_for_term(
                    term=term,
                    question=question,
                    name=name,
                    title=dimension.title,
                    description=dimension.description,
                    synonyms=dimension.synonyms,
                    dimension_type=dimension.type,
                )
                if score > best_score:
                    best_name = name
                    best_score = score
            if best_name and best_score > 0 and best_name not in selected:
                selected.append(best_name)
        return selected

    def _infer_time_dimensions(self, question: str, cube: CubeDefinition) -> list[dict[str, Any]]:
        date_range = self._extract_date_range(question)
        if not date_range:
            return []
        dimension_name = self._select_time_dimension(question, cube)
        if not dimension_name:
            return []
        return [{"dimension": dimension_name, "date_range": date_range}]

    @classmethod
    def _extract_group_terms(cls, question: str) -> list[str]:
        terms: list[str] = []
        for match in re.finditer(r"按([^，,。；;]+?)(?:汇总|分组|统计|聚合|排行|排名|对比)", question):
            terms.extend(cls._split_terms(match.group(1)))
        for keyword in ("学校", "校区", "班级", "年级", "学科", "科目", "知识点", "课程", "状态", "类型"):
            if keyword in question and keyword not in terms and any(marker in question for marker in ("按", "分", "各", "每")):
                terms.append(keyword)
        return terms

    @staticmethod
    def _split_terms(value: str) -> list[str]:
        return [
            item.strip()
            for item in re.split(r"和|及|与|、|/|，|,", value)
            if item.strip()
        ]

    @staticmethod
    def _normalize_text(value: str) -> str:
        return re.sub(r"[\W_]+", "", value.lower())

    @classmethod
    def _score_dimension_for_term(
        cls,
        *,
        term: str,
        question: str,
        name: str,
        title: str,
        description: Optional[str],
        synonyms: Iterable[str],
        dimension_type: str,
    ) -> int:
        normalized_term = cls._normalize_text(term)
        haystack = cls._normalize_text(" ".join([name, title or "", description or "", *synonyms]))
        score = 0
        if normalized_term and normalized_term in haystack:
            score += 60
        aliases = {
            "学校": ("school", "schoolname", "学校"),
            "校区": ("school", "schoolname", "学校"),
            "班级": ("class", "classname", "班级"),
            "年级": ("grade", "gradename", "年级"),
            "学科": ("subject", "subjectname", "学科", "科目"),
            "科目": ("subject", "subjectname", "学科", "科目"),
            "知识点": ("knowledge", "knowledgename", "知识点"),
            "课程": ("lesson", "lessonname", "课程"),
            "状态": ("status", "statusname", "状态"),
            "类型": ("type", "typename", "类型"),
        }
        for alias in aliases.get(term, ()):
            if cls._normalize_text(alias) in haystack:
                score += 45
        lower_name = name.lower()
        if dimension_type == "string":
            score += 8
        if lower_name.endswith("_name") or lower_name.endswith("name"):
            score += 18
        if (
            any(word in (title or "") + (description or "") for word in ("敏感", "文本"))
            or "content" in lower_name
        ) and not any(
            word in question for word in ("内容", "文本", "原文", "明细")
        ):
            score -= 80
        if "评论" in question and ("comment" in lower_name or "被举报内容" in f"{title or ''}{description or ''}"):
            score += 30
        if "reporter" in lower_name and not any(word in question for word in ("举报人", "举报者", "提交人")):
            score -= 40
        if "id" in lower_name and "id" not in question.lower() and "编号" not in question:
            score -= 10
        return score

    @staticmethod
    def _extract_date_range(question: str) -> list[str]:
        today = date.today()
        recent_days = re.search(r"(?:最近|近|过去)\s*(\d+)\s*天", question)
        if recent_days:
            days = max(1, int(recent_days.group(1)))
            start = today - timedelta(days=days - 1)
            return [start.isoformat(), today.isoformat()]
        if "昨天" in question:
            day = today - timedelta(days=1)
            return [day.isoformat(), day.isoformat()]
        if "今天" in question or "今日" in question:
            return [today.isoformat(), today.isoformat()]
        return []

    @classmethod
    def _select_time_dimension(cls, question: str, cube: CubeDefinition) -> str:
        best_name = ""
        best_score = -1000
        for index, (name, dimension) in enumerate(cube.dimensions.items()):
            if dimension.type != "time":
                continue
            text = f"{name} {dimension.title or ''} {dimension.description or ''}".lower()
            score = 100 - index
            if "etl" in text:
                score -= 200
            if any(word in text for word in ("update", "updated", "更新时间")):
                score -= 80
            if any(word in text for word in ("check", "checked", "处理时间")):
                score -= 60
            if "评论" in question and any(word in text for word in ("comment", "发布", "发表")):
                score += 80
            if "举报" in question and any(word in text for word in ("report", "举报", "发生", "创建")):
                score += 80
            if any(word in text for word in ("created", "create", "发生", "创建", "published", "发布")):
                score += 20
            if score > best_score:
                best_name = name
                best_score = score
        return best_name

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
