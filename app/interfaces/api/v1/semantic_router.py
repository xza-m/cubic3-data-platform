"""语义路由、计划与最小执行 API。"""
from __future__ import annotations

from flask import Blueprint, request

from app.shared.response import error, success


def create_semantic_router_blueprint(router_service):
    bp = Blueprint("semantic_router", __name__, url_prefix="/api/v1/semantic-router")

    @bp.route("/route", methods=["POST"])
    def route():
        body = request.get_json(silent=True) or {}
        question = (body.get("question") or "").strip()
        if not question:
            return error("请求体缺少必填字段: question")
        try:
            payload = router_service.route(question=question, viewer_roles=body.get("viewer_roles"))
        except Exception as exc:
            return error(f"生成语义路由失败: {exc}")
        return success(data=payload)

    @bp.route("/plan", methods=["POST"])
    def plan():
        body = request.get_json(silent=True) or {}
        question = (body.get("question") or "").strip()
        if not question:
            return error("请求体缺少必填字段: question")
        try:
            payload = router_service.plan(question=question, viewer_roles=body.get("viewer_roles"))
        except Exception as exc:
            return error(f"生成语义规划失败: {exc}")
        return success(data=payload)

    @bp.route("/execute-plan-preview", methods=["POST"])
    def execute_plan_preview():
        body = request.get_json(silent=True) or {}
        question = (body.get("question") or "").strip()
        if not question:
            return error("请求体缺少必填字段: question")
        try:
            payload = router_service.execute_plan_preview(question=question, viewer_roles=body.get("viewer_roles"))
        except Exception as exc:
            return error(f"生成执行计划预览失败: {exc}")
        return success(data=payload)

    @bp.route("/execute-plan", methods=["POST"])
    def execute_plan():
        body = request.get_json(silent=True) or {}
        question = (body.get("question") or "").strip()
        if not question:
            return error("请求体缺少必填字段: question")
        try:
            payload = router_service.execute_plan(question=question, viewer_roles=body.get("viewer_roles"))
        except Exception as exc:
            return error(f"执行语义计划失败: {exc}")
        return success(data=payload)

    return bp
