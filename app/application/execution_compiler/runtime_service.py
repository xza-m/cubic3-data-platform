"""最小统一执行运行时服务。"""
from __future__ import annotations

from datetime import datetime
import re
from typing import Any, Callable, Dict, Optional
import uuid

from app.application.governance.access import AccessPolicyDecisionService, PrincipalResolver
from app.application.query.commands.execute_query import ExecuteQueryCommand
from app.domain.ontology.entities import GovernanceAuditTrace


class ExecutionCompilerRuntimeService:
    """将执行编译预览转成统一执行结果。

    当前已支持 `sql / retrieval / tool` 三类目标的最小真实执行：

    - `sql`：走真实查询执行链
    - `retrieval`：走最小知识检索链
    - `tool`：走受控只读工具链

    若依赖服务未接入，仍会返回 `not_configured`，用于明确区分
    “能力未配置”和“语义路由或权限阻断”两类结果。
    """

    def __init__(
        self,
        *,
        preview_service,
        execute_query_handler_factory: Callable[[], Any],
        knowledge_service=None,
        semantic_service=None,
        audit_trace_repository=None,
        principal_resolver=None,
        access_policy_service=None,
    ):
        self._preview_service = preview_service
        self._execute_query_handler_factory = execute_query_handler_factory
        self._knowledge_service = knowledge_service
        self._semantic_service = semantic_service
        self._audit_trace_repository = audit_trace_repository
        self._principal_resolver = principal_resolver or PrincipalResolver()
        self._access_policy_service = access_policy_service or AccessPolicyDecisionService()

    def execute(
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
        route_type: Optional[str] = None,
        approval_id: Optional[str] = None,
        semantic_plan_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        preview = self._preview_service.compile_preview(
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
        principal = self._principal_resolver.resolve(
            principal_context=principal_context,
            viewer_roles=viewer_roles,
            authenticated_user=None,
        )

        resolved_target_type = (preview.get("target_type") or target_type or "").strip().lower()
        if preview.get("status") == "blocked":
            governance_trace = self._build_governance_trace(
                preview=preview,
                execution_status="blocked",
                viewer_roles=viewer_roles,
                principal_context=principal.to_dict(),
            )
            audit_trace_id = self._record_audit_trace(
                preview=preview,
                governance_trace=governance_trace,
                route_type=route_type,
            )
            return {
                "status": "blocked",
                "target_type": resolved_target_type,
                "reason": preview.get("reason"),
                "execution_request": preview.get("execution_request"),
                "bindings": preview.get("bindings", {}),
                "policy": preview.get("policy"),
                "traceability": preview.get("traceability", {}),
                "governance_trace": governance_trace,
                "audit_trace_id": audit_trace_id,
            }

        policy_decision = self._access_policy_service.post_compile(
            principal=principal,
            compiled_targets=[preview],
            approval_id=approval_id,
        )
        preview["_policy_decision"] = policy_decision.to_dict()
        preview["_ticket_preview"] = policy_decision.ticket_preview
        preview["_principal_context"] = principal.to_dict()
        preview["_semantic_plan_id"] = semantic_plan_id
        if policy_decision.decision != "allow":
            governance_trace = self._build_governance_trace(
                preview=preview,
                execution_status="blocked",
                viewer_roles=viewer_roles,
                principal_context=principal.to_dict(),
            )
            audit_trace_id = self._record_audit_trace(
                preview=preview,
                governance_trace=governance_trace,
                route_type=route_type,
            )
            return {
                "status": "blocked",
                "target_type": resolved_target_type,
                "reason": policy_decision.reason,
                "execution_request": preview.get("execution_request"),
                "bindings": preview.get("bindings", {}),
                "policy": preview.get("policy"),
                "policy_decision": policy_decision.to_dict(),
                "ticket_preview": policy_decision.ticket_preview,
                "traceability": preview.get("traceability", {}),
                "governance_trace": governance_trace,
                "audit_trace_id": audit_trace_id,
            }

        if resolved_target_type == "sql":
            return self._execute_sql(preview, viewer_roles=viewer_roles, route_type=route_type)
        if resolved_target_type == "retrieval":
            return self._execute_retrieval(preview, viewer_roles=viewer_roles, route_type=route_type)
        if resolved_target_type == "tool":
            return self._execute_tool(preview, viewer_roles=viewer_roles, route_type=route_type)
        raise ValueError(f"不支持的执行目标类型: {target_type}")

    def _execute_sql(
        self,
        preview: Dict[str, Any],
        *,
        viewer_roles: Optional[list[str]] = None,
        route_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        execution_request = preview.get("execution_request") or {}
        source_id = execution_request.get("source_id")
        sql_query = execution_request.get("sql_query")
        if source_id is None or not sql_query:
            raise ValueError("SQL 执行请求缺少 source_id 或 sql_query")

        handler = self._execute_query_handler_factory()
        result = handler.handle(
            ExecuteQueryCommand(
                source_id=int(source_id),
                sql_query=str(sql_query),
                limit=int(execution_request.get("limit") or 100),
                executed_by="ontology-execution-compiler",
            )
        )
        governance_trace = self._build_governance_trace(
            preview=preview,
            execution_status="executed",
            viewer_roles=viewer_roles,
        )
        audit_trace_id = self._record_audit_trace(
            preview=preview,
            governance_trace=governance_trace,
            route_type=route_type,
        )
        return {
            "status": "executed",
            "target_type": "sql",
            "execution_request": execution_request,
            "result": result,
            "bindings": preview.get("bindings", {}),
            "policy": preview.get("policy"),
            "policy_decision": preview.get("_policy_decision"),
            "ticket_preview": preview.get("_ticket_preview"),
            "traceability": preview.get("traceability", {}),
            "governance_trace": governance_trace,
            "audit_trace_id": audit_trace_id,
        }

    def _execute_retrieval(
        self,
        preview: Dict[str, Any],
        *,
        viewer_roles: Optional[list[str]] = None,
        route_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        execution_request = preview.get("execution_request") or {}
        if self._knowledge_service is None:
            governance_trace = self._build_governance_trace(
                preview=preview,
                execution_status="not_configured",
                viewer_roles=viewer_roles,
            )
            audit_trace_id = self._record_audit_trace(
                preview=preview,
                governance_trace=governance_trace,
                route_type=route_type,
            )
            return {
                "status": "not_configured",
                "target_type": "retrieval",
                "execution_request": execution_request,
                "bindings": preview.get("bindings", {}),
                "policy": preview.get("policy"),
                "policy_decision": preview.get("_policy_decision"),
                "ticket_preview": preview.get("_ticket_preview"),
                "traceability": preview.get("traceability", {}),
                "governance_trace": governance_trace,
                "audit_trace_id": audit_trace_id,
            }
        query = str(execution_request.get("query") or "").strip()
        top_k = int(execution_request.get("top_k") or 5)
        retrieval_results = self._search_knowledge(query, max_results=top_k)
        result = {
            "results": retrieval_results,
            "total": 0,
        }
        result["total"] = len(result["results"])
        governance_trace = self._build_governance_trace(
            preview=preview,
            execution_status="executed",
            viewer_roles=viewer_roles,
        )
        audit_trace_id = self._record_audit_trace(
            preview=preview,
            governance_trace=governance_trace,
            route_type=route_type,
        )
        return {
            "status": "executed",
            "target_type": "retrieval",
            "execution_request": execution_request,
            "result": result,
            "bindings": preview.get("bindings", {}),
            "policy": preview.get("policy"),
            "policy_decision": preview.get("_policy_decision"),
            "ticket_preview": preview.get("_ticket_preview"),
            "traceability": preview.get("traceability", {}),
            "governance_trace": governance_trace,
            "audit_trace_id": audit_trace_id,
        }

    def _execute_tool(
        self,
        preview: Dict[str, Any],
        *,
        viewer_roles: Optional[list[str]] = None,
        route_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        execution_request = preview.get("execution_request") or {}
        tool_name = str(execution_request.get("name") or "").strip()
        arguments = execution_request.get("arguments") or {}

        result: Optional[Dict[str, Any]] = None
        if tool_name == "search_knowledge" and self._knowledge_service is not None:
            query = str(arguments.get("query") or "").strip()
            max_results = int(arguments.get("max_results") or 5)
            items = self._knowledge_service.search(query, max_results=max_results)
            result = {"results": items, "total": len(items)}
        elif tool_name == "read_knowledge" and self._knowledge_service is not None:
            path = str(arguments.get("path") or "").strip()
            result = {"content": self._knowledge_service.read(path)}
        elif tool_name == "list_cubes" and self._semantic_service is not None:
            cubes = self._semantic_service.list_cubes()
            result = {"cubes": cubes, "total": len(cubes)}
        elif tool_name == "describe_cube" and self._semantic_service is not None:
            cube_name = str(arguments.get("cube_name") or "").strip()
            result = self._semantic_service.describe_cube(cube_name)

        if result is None:
            governance_trace = self._build_governance_trace(
                preview=preview,
                execution_status="not_configured",
                viewer_roles=viewer_roles,
            )
            audit_trace_id = self._record_audit_trace(
                preview=preview,
                governance_trace=governance_trace,
                route_type=route_type,
            )
            return {
                "status": "not_configured",
                "target_type": "tool",
                "execution_request": execution_request,
                "bindings": preview.get("bindings", {}),
                "policy": preview.get("policy"),
                "policy_decision": preview.get("_policy_decision"),
                "ticket_preview": preview.get("_ticket_preview"),
                "traceability": preview.get("traceability", {}),
                "governance_trace": governance_trace,
                "audit_trace_id": audit_trace_id,
            }

        governance_trace = self._build_governance_trace(
            preview=preview,
            execution_status="executed",
            viewer_roles=viewer_roles,
        )
        audit_trace_id = self._record_audit_trace(
            preview=preview,
            governance_trace=governance_trace,
            route_type=route_type,
        )
        return {
            "status": "executed",
            "target_type": "tool",
            "execution_request": execution_request,
            "result": result,
            "bindings": preview.get("bindings", {}),
            "policy": preview.get("policy"),
            "policy_decision": preview.get("_policy_decision"),
            "ticket_preview": preview.get("_ticket_preview"),
            "traceability": preview.get("traceability", {}),
            "governance_trace": governance_trace,
            "audit_trace_id": audit_trace_id,
        }

    def _build_governance_trace(
        self,
        *,
        preview: Dict[str, Any],
        execution_status: str,
        viewer_roles: Optional[list[str]] = None,
        principal_context: Optional[dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        policy = preview.get("policy") or {}
        bindings = preview.get("bindings") or {}
        matched_policy = policy.get("matched_policy")
        policy_decision = preview.get("_policy_decision") or {}
        return {
            "status": policy_decision.get("decision") or policy.get("status", "allow"),
            "visibility": policy.get("visibility", "public"),
            "matched_policy": matched_policy,
            "required_roles": policy.get("required_roles", []),
            "viewer_roles": viewer_roles or [],
            "principal_context": principal_context or preview.get("_principal_context") or {},
            "target_type": preview.get("target_type"),
            "target_name": bindings.get("metric_name")
            or bindings.get("tool_name")
            or bindings.get("retrieval_query")
            or "unknown",
            "data_level": preview.get("data_level"),
            "resource_set": preview.get("resource_set") or [],
            "sql_hash": preview.get("sql_hash"),
            "policy_decision": policy_decision,
            "execution_status": execution_status,
            "reason": policy_decision.get("reason") or preview.get("reason") or policy.get("reason"),
        }

    def _record_audit_trace(
        self,
        *,
        preview: Dict[str, Any],
        governance_trace: Dict[str, Any],
        route_type: Optional[str],
    ) -> Optional[str]:
        if self._audit_trace_repository is None:
            return None
        trace_id = uuid.uuid4().hex
        principal_context = governance_trace.get("principal_context") or {}
        self._audit_trace_repository.save(
            GovernanceAuditTrace(
                id=trace_id,
                target_type=str(governance_trace.get("target_type") or preview.get("target_type") or "unknown"),
                target_name=str(governance_trace.get("target_name") or "unknown"),
                principal_id=principal_context.get("principal_id"),
                semantic_plan_id=preview.get("_semantic_plan_id"),
                sql_hash=preview.get("sql_hash"),
                viewer_roles=list(governance_trace.get("viewer_roles") or []),
                route_type=(route_type or "direct").strip() or "direct",
                execution_target=str(preview.get("target_type") or "unknown"),
                decision=str(governance_trace.get("status") or "allow"),
                policy=governance_trace.get("matched_policy"),
                policy_decision=governance_trace.get("policy_decision") or {},
                traceability=preview.get("traceability") or {},
                reason=governance_trace.get("reason"),
                timestamp=datetime.utcnow().isoformat(timespec="microseconds"),
            )
        )
        return trace_id

    def _search_knowledge(self, query: str, *, max_results: int) -> list[Dict[str, Any]]:
        results = self._knowledge_service.search(query, max_results=max_results)
        if results:
            return results

        fallback_queries = self._fallback_retrieval_queries(query)
        for candidate in fallback_queries:
            results = self._knowledge_service.search(candidate, max_results=max_results)
            if results:
                return results
        return []

    @staticmethod
    def _fallback_retrieval_queries(query: str) -> list[str]:
        normalized = query.strip()
        if not normalized:
            return []

        candidates: list[str] = []
        stripped = normalized
        for token in ("解释", "查看", "分析", "查询", "口径", "趋势", "详情", "说明"):
            stripped = stripped.replace(token, " ")
        stripped = re.sub(r"\s+", " ", stripped).strip()
        if stripped and stripped != normalized:
            candidates.append(stripped)

        compact_terms = [term.strip() for term in re.split(r"[，,、/\\\s]+", stripped or normalized) if term.strip()]
        if compact_terms:
            candidates.extend(term for term in compact_terms if term not in candidates)

        if normalized not in candidates:
            candidates.append(normalized)
        return candidates
