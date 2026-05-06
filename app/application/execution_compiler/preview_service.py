"""最小执行编译预览服务。"""
from __future__ import annotations

from typing import Any, Dict, Optional

from app.application.governance.access import (
    canonical_sql_hash,
    infer_data_level_for_resource,
)
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
        source_expr = cube.source_sql.strip() if cube.source_sql else cube.table
        if cube.source_sql:
            from_sql = f"(\n{source_expr}\n) AS {cube.name}"
        else:
            from_sql = source_expr
        logical_sql = (
            f"SELECT\n"
            f"  {measure.sql.replace('{CUBE}', cube.name)} AS {measure_name}\n"
            f"FROM {from_sql}"
        )
        sql_hash = canonical_sql_hash(logical_sql)
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
                "sql_query": logical_sql,
                "limit": 100,
            },
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
