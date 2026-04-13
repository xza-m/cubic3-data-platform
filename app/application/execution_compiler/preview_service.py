"""最小执行编译预览服务。"""
from __future__ import annotations

from typing import Any, Dict, Optional

from app.domain.ontology.ports.metric_repository import IBusinessMetricRepository
from app.domain.semantic.ports.cube_repository import ICubeRepository


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
        viewer_roles: Optional[list[str]] = None,
    ) -> Dict[str, Any]:
        normalized_target_type = (target_type or "").strip().lower()
        if normalized_target_type == "sql":
            if not metric_name:
                raise ValueError("SQL 编译预览缺少 metric_name")
            return self.compile_metric_preview(metric_name, viewer_roles=viewer_roles or [])
        if normalized_target_type == "retrieval":
            return self.compile_retrieval_preview(
                retrieval_query=retrieval_query,
                retrieval_sources=retrieval_sources or [],
                viewer_roles=viewer_roles or [],
            )
        if normalized_target_type == "tool":
            return self.compile_tool_preview(
                tool_name=tool_name,
                tool_arguments=tool_arguments or {},
                viewer_roles=viewer_roles or [],
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
        viewer_roles: Optional[list[str]] = None,
    ) -> Dict[str, Any]:
        preview = self.compile_preview(
            target_type=target_type,
            metric_name=metric_name,
            retrieval_query=retrieval_query,
            retrieval_sources=retrieval_sources,
            tool_name=tool_name,
            tool_arguments=tool_arguments,
            viewer_roles=viewer_roles,
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

    def compile_metric_preview(self, metric_name: str, viewer_roles: Optional[list[str]] = None) -> Dict[str, Any]:
        metric = self._metric_repository.get(metric_name)
        if metric is None:
            raise ValueError(f"未找到业务指标: {metric_name}")
        policy = self._evaluate_policy(target_type="metric", target_name=metric.name, viewer_roles=viewer_roles or [])
        if policy["status"] == "blocked":
            return {
                "status": "blocked",
                "target_type": "sql",
                "reason": policy["reason"],
                "bindings": {"metric_name": metric.name},
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
        if not metric.measure_refs:
            return {
                "status": "blocked",
                "target_type": "sql",
                "reason": "业务指标尚未绑定可执行 Measure",
                "bindings": {"metric_name": metric.name},
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
        measure_ref = metric.measure_refs[0]
        cube_name, _, measure_name = measure_ref.partition(".")
        cube = self._cube_repository.get(cube_name)
        if cube is None or measure_name not in cube.measures:
            return {
                "status": "blocked",
                "target_type": "sql",
                "reason": f"未找到可执行 Measure 引用: {measure_ref}",
                "bindings": {"metric_name": metric.name, "measure_ref": measure_ref},
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
        measure = cube.measures[measure_name]
        source_expr = cube.source_sql.strip() if cube.source_sql else cube.table
        if cube.source_sql:
            from_sql = f"(\n{source_expr}\n) AS {cube.name}"
        else:
            from_sql = source_expr
        return {
            "status": "ready",
            "target_type": "sql",
            "pseudo_sql": (
                f"SELECT\n"
                f"  /* 语义公式: {metric.semantic_formula} */\n"
                f"  {measure.sql.replace('{CUBE}', cube.name)} AS {measure_name}\n"
                f"FROM {from_sql}\n"
                f"LIMIT 100"
            ),
            "execution_request": {
                "source_id": cube.source_id,
                "sql_query": (
                    f"SELECT\n"
                    f"  {measure.sql.replace('{CUBE}', cube.name)} AS {measure_name}\n"
                    f"FROM {from_sql}"
                ),
                "limit": 100,
            },
            "bindings": {
                "metric_name": metric.name,
                "measure_ref": measure_ref,
                "cube_name": cube.name,
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

    def compile_retrieval_preview(
        self,
        *,
        retrieval_query: Optional[str],
        retrieval_sources: list[str],
        viewer_roles: list[str],
    ) -> Dict[str, Any]:
        normalized_query = (retrieval_query or "").strip()
        if not normalized_query:
            raise ValueError("检索编译预览缺少 retrieval_query")
        sources = retrieval_sources or ["knowledge-base"]
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
                    "viewer_roles": viewer_roles,
                }
            },
        }

    def compile_tool_preview(
        self,
        *,
        tool_name: Optional[str],
        tool_arguments: Dict[str, Any],
        viewer_roles: list[str],
    ) -> Dict[str, Any]:
        normalized_tool_name = (tool_name or "").strip()
        if not normalized_tool_name:
            raise ValueError("工具编译预览缺少 tool_name")
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
                    "viewer_roles": viewer_roles,
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
