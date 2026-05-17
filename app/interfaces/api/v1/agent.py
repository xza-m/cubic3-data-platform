"""Agent 语义规划 API。"""
from __future__ import annotations

from flask import Blueprint, g, request
from pydantic import ValidationError as PydanticValidationError

from app.application.query_execution.schemas import AgentSemanticExecuteRequest
from app.application.governance.access import PrincipalResolver
from app.interfaces.api.middleware.auth import require_auth
from app.shared.response import error, success


def _authenticated_user_from_g() -> dict:
    return {
        "user_id": getattr(g, "user_id", None),
        "user_name": getattr(g, "user_name", None),
        "roles": getattr(g, "user_roles", []) or [],
    }


def create_agent_blueprint(agent_plan_handler, agent_execute_service=None):
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

    @bp.route("/semantic/execute", methods=["POST"])
    @require_auth
    def semantic_execute():
        if agent_execute_service is None:
            return error("Agent 语义执行服务未配置", status=503)
        try:
            body = AgentSemanticExecuteRequest(**(request.get_json(silent=True) or {}))
            runtime_options = dict(body.runtime_options or {})
            runtime_options["runtime_mode"] = "official"
            principal = PrincipalResolver().resolve(
                principal_context=body.principal_context,
                viewer_roles=body.viewer_roles,
                authenticated_user=_authenticated_user_from_g(),
            )
            payload = agent_execute_service.execute(
                question=body.question,
                principal_context=principal.to_dict(),
                viewer_roles=None,
                runtime_options=runtime_options,
                authenticated_user=_authenticated_user_from_g(),
                idempotency_key=body.idempotency_key,
            )
        except PydanticValidationError as exc:
            return error("请求参数错误", details=exc.errors())
        except Exception as exc:
            return error(f"执行 Agent 语义查询失败: {exc}")
        return success(data=payload)

    return bp
