"""语义路由、计划与最小执行 API。"""
from __future__ import annotations

from flask import Blueprint, request

from app.interfaces.api.middleware.auth import require_admin, require_auth
from app.interfaces.api.v1.principal_context import principal_context_from_bearer
from app.shared.response import error, success


def _runtime_mode_from_body(body: dict) -> str | None:
    runtime_options = body.get("runtime_options") or {}
    return body.get("runtime_mode") or runtime_options.get("runtime_mode")


def create_semantic_router_blueprint(router_service):
    bp = Blueprint("semantic_router", __name__, url_prefix="/api/v1/semantic-router")

    @bp.route("/route", methods=["POST"])
    @require_auth
    def route():
        body = request.get_json(silent=True) or {}
        question = (body.get("question") or "").strip()
        if not question:
            return error("请求体缺少必填字段: question")
        try:
            principal_context = principal_context_from_bearer(source="semantic_router")
            payload = router_service.route(
                question=question,
                viewer_roles=None,
                principal_context=principal_context,
                runtime_mode=_runtime_mode_from_body(body),
            )
        except Exception as exc:
            return error(f"生成语义路由失败: {exc}")
        return success(data=payload)

    @bp.route("/plan", methods=["POST"])
    @require_auth
    def plan():
        body = request.get_json(silent=True) or {}
        question = (body.get("question") or "").strip()
        if not question:
            return error("请求体缺少必填字段: question")
        try:
            principal_context = principal_context_from_bearer(source="semantic_router")
            payload = router_service.plan(
                question=question,
                viewer_roles=None,
                principal_context=principal_context,
                runtime_mode=_runtime_mode_from_body(body),
            )
        except Exception as exc:
            return error(f"生成语义规划失败: {exc}")
        return success(data=payload)

    @bp.route("/execute-plan-preview", methods=["POST"])
    @require_auth
    def execute_plan_preview():
        body = request.get_json(silent=True) or {}
        question = (body.get("question") or "").strip()
        if not question:
            return error("请求体缺少必填字段: question")
        try:
            principal_context = principal_context_from_bearer(source="semantic_router")
            payload = router_service.execute_plan_preview(
                question=question,
                viewer_roles=None,
                principal_context=principal_context,
                runtime_mode=_runtime_mode_from_body(body),
            )
        except Exception as exc:
            return error(f"生成执行计划预览失败: {exc}")
        return success(data=payload)

    @bp.route("/execute-plan", methods=["POST"])
    @require_admin
    def execute_plan():
        body = request.get_json(silent=True) or {}
        question = (body.get("question") or "").strip()
        if not question:
            return error("请求体缺少必填字段: question")
        try:
            principal_context = principal_context_from_bearer(source="semantic_router")
            payload = router_service.execute_plan(
                question=question,
                viewer_roles=None,
                principal_context=principal_context,
                runtime_options=body.get("runtime_options") or {},
                runtime_mode=_runtime_mode_from_body(body),
            )
        except Exception as exc:
            return error(f"执行语义计划失败: {exc}")
        return success(data=payload)

    return bp
