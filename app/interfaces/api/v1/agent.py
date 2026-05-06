"""Agent 语义规划 API。"""
from __future__ import annotations

from flask import Blueprint, g, request

from app.application.governance.access import PrincipalResolver
from app.interfaces.api.middleware.auth import require_auth
from app.shared.response import error, success


def _authenticated_user_from_g() -> dict:
    return {
        "user_id": getattr(g, "user_id", None),
        "user_name": getattr(g, "user_name", None),
        "roles": getattr(g, "user_roles", []) or [],
    }


def create_agent_blueprint(agent_plan_handler):
    bp = Blueprint("agent", __name__, url_prefix="/api/v1/agent")

    @bp.route("/semantic/plan", methods=["POST"])
    @require_auth
    def semantic_plan():
        body = request.get_json(silent=True) or {}
        question = (body.get("question") or "").strip()
        if not question:
            return error("请求体缺少必填字段: question")
        try:
            runtime_options = dict(body.get("runtime_options") or {})
            runtime_options["runtime_mode"] = "official"
            principal = PrincipalResolver().resolve(
                principal_context=body.get("principal_context"),
                viewer_roles=body.get("viewer_roles"),
                authenticated_user=_authenticated_user_from_g(),
            )
            payload = agent_plan_handler.handle(
                question=question,
                principal_context=principal.to_dict(),
                viewer_roles=None,
                runtime_options=runtime_options,
                authenticated_user=_authenticated_user_from_g(),
            )
        except Exception as exc:
            return error(f"生成 Agent 语义规划失败: {exc}")
        return success(data=payload)

    return bp
