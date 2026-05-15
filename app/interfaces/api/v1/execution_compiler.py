"""执行编译与最小统一运行时 API。"""
from __future__ import annotations

from flask import Blueprint, request

from app.interfaces.api.middleware.auth import require_admin, require_auth
from app.interfaces.api.v1.principal_context import principal_context_from_bearer
from app.shared.response import error, success


def create_execution_compiler_blueprint(preview_service, runtime_service=None):
    bp = Blueprint("execution_compiler", __name__, url_prefix="/api/v1/execution-compiler")

    @bp.route("/compile-preview", methods=["POST"])
    @require_auth
    def compile_preview():
        body = request.get_json(silent=True) or {}
        target_type = (body.get("target_type") or "sql").strip().lower()
        try:
            principal_context = principal_context_from_bearer(source="execution_compiler")
            payload = preview_service.compile_preview(
                target_type=target_type,
                metric_name=body.get("metric_name"),
                query_dsl=body.get("query_dsl"),
                question=body.get("question"),
                retrieval_query=body.get("retrieval_query"),
                retrieval_sources=body.get("retrieval_sources"),
                tool_name=body.get("tool_name"),
                tool_arguments=body.get("tool_arguments"),
                viewer_roles=None,
                principal_context=principal_context,
            )
        except Exception as exc:
            return error(f"生成执行预览失败: {exc}")
        return success(data=payload)

    @bp.route("/plan-preview", methods=["POST"])
    @require_auth
    def plan_preview():
        body = request.get_json(silent=True) or {}
        target_type = (body.get("target_type") or "sql").strip().lower()
        try:
            principal_context = principal_context_from_bearer(source="execution_compiler")
            payload = preview_service.compile_plan_preview(
                target_type=target_type,
                metric_name=body.get("metric_name"),
                query_dsl=body.get("query_dsl"),
                question=body.get("question"),
                retrieval_query=body.get("retrieval_query"),
                retrieval_sources=body.get("retrieval_sources"),
                tool_name=body.get("tool_name"),
                tool_arguments=body.get("tool_arguments"),
                viewer_roles=None,
                principal_context=principal_context,
            )
        except Exception as exc:
            return error(f"生成执行计划预览失败: {exc}")
        return success(data=payload)

    @bp.route("/execute", methods=["POST"])
    @require_admin
    def execute():
        body = request.get_json(silent=True) or {}
        target_type = (body.get("target_type") or "sql").strip().lower()
        execution_service = runtime_service or preview_service
        try:
            principal_context = principal_context_from_bearer(source="execution_compiler")
            payload = execution_service.execute(
                target_type=target_type,
                metric_name=body.get("metric_name"),
                query_dsl=body.get("query_dsl"),
                question=body.get("question"),
                retrieval_query=body.get("retrieval_query"),
                retrieval_sources=body.get("retrieval_sources"),
                tool_name=body.get("tool_name"),
                tool_arguments=body.get("tool_arguments"),
                viewer_roles=None,
                principal_context=principal_context,
                approval_id=(body.get("runtime_options") or {}).get("approval_id"),
            )
        except Exception as exc:
            return error(f"执行请求失败: {exc}")
        return success(data=payload)

    return bp
