"""Agent 语义规划 API。"""
from __future__ import annotations

from flask import Blueprint, request
from pydantic import ValidationError as PydanticValidationError

from app.application.access.identity import AccessIdentityService, DelegationReplayStore
from app.application.agent.semantic_execute_schema import AgentSemanticExecuteRequest
from app.application.governance.access import PrincipalResolver
from app.extensions import db
from app.infrastructure.access.repositories import SqlAccessRepository
from app.infrastructure.gateway.telemetry_client import GatewayQueryError
from app.interfaces.api.middleware.auth import require_auth
from app.interfaces.api.v1.principal_context import authenticated_user_from_g, principal_context_from_bearer
from app.shared.exceptions import AuthenticationError, AuthorizationError, ValidationError
from app.shared.response import error, success

AGENT_PLAN_SCOPE = "agent.semantic.plan"
_DELEGATION_REPLAY_STORE = DelegationReplayStore()


def _principal_context_from_api_key(body: dict) -> dict:
    api_key = (request.headers.get("X-C3-Api-Key") or "").strip()
    if not api_key:
        raise AuthenticationError("Missing API key", code="MISSING_API_KEY")

    service = AccessIdentityService(SqlAccessRepository(db.session))
    actor = service.authenticate_api_key(api_key, remote_ip=request.remote_addr)
    if AGENT_PLAN_SCOPE not in actor.scopes:
        raise AuthorizationError("API Key 不允许访问 Agent 语义规划", code="AGENT_PLAN_SCOPE_REQUIRED")

    feishu_context = body.get("feishu_context")
    if isinstance(feishu_context, dict) and feishu_context:
        principal = service.resolve_delegated_feishu_principal(
            actor=actor,
            feishu_context=feishu_context,
            replay_store=_DELEGATION_REPLAY_STORE,
            endpoint="/api/v1/agent/semantic/plan",
        )
    else:
        principal = service.resolve_service_principal_context(actor)
    return principal.to_dict()


def create_agent_blueprint(agent_plan_handler, agent_execute_service=None):
    bp = Blueprint("agent", __name__, url_prefix="/api/v1/agent")

    def _handle_semantic_plan(*, body: dict, principal_context: dict | None, authenticated_user: dict | None):
        question = (body.get("question") or "").strip()
        if not question:
            return error("请求体缺少必填字段: question")
        try:
            runtime_options = dict(body.get("runtime_options") or {})
            runtime_options["runtime_mode"] = "official"
            principal = PrincipalResolver().resolve(
                principal_context=principal_context,
                viewer_roles=None,
                authenticated_user=authenticated_user,
            )
            payload = agent_plan_handler.handle(
                question=question,
                principal_context=principal.to_dict(),
                viewer_roles=None,
                runtime_options=runtime_options,
                authenticated_user=authenticated_user,
            )
        except (AuthenticationError, AuthorizationError, ValidationError):
            raise
        except Exception as exc:
            return error(f"生成 Agent 语义规划失败: {exc}")
        return success(data=payload)

    @require_auth
    def _semantic_plan_with_bearer():
        body = request.get_json(silent=True) or {}
        return _handle_semantic_plan(
            body=body,
            principal_context=principal_context_from_bearer(source="agent_bearer"),
            authenticated_user=authenticated_user_from_g(),
        )

    @bp.route("/semantic/plan", methods=["POST"])
    def semantic_plan():
        body = request.get_json(silent=True) or {}
        if request.headers.get("X-C3-Api-Key"):
            principal_context = _principal_context_from_api_key(body)
            return _handle_semantic_plan(
                body=body,
                principal_context=principal_context,
                authenticated_user=None,
            )
        return _semantic_plan_with_bearer()

    @bp.route("/semantic/execute", methods=["POST"])
    @require_auth
    def semantic_execute():
        from flask import current_app

        if agent_execute_service is None:
            return error(
                "Agent 语义执行服务未配置",
                status=503,
                details={
                    "error_code": "agent_execute_service_not_configured",
                    "hint": "请检查 DI 容器中 agent_execute_service 的装配与 query_gateway 配置。",
                },
            )
        token = str(current_app.config.get("QUERY_GATEWAY_PLATFORM_SERVICE_TOKEN") or "").strip()
        if not token:
            return error(
                "dw-query-gateway 服务令牌未配置，正式语义执行不可用",
                status=503,
                details={
                    "error_code": "gateway_token_missing",
                    "hint": "请在环境变量中配置 QUERY_GATEWAY_PLATFORM_SERVICE_TOKEN 后重启服务。",
                },
            )
        try:
            body = AgentSemanticExecuteRequest(**(request.get_json(silent=True) or {}))
            runtime_options = dict(body.runtime_options or {})
            runtime_options["runtime_mode"] = "official"
            authenticated_user = authenticated_user_from_g()
            # 与 /semantic/plan 对齐：未显式传 principal_context 时从 bearer 解析，
            # 否则 principal 无角色绑定，治理决策必然 deny。
            principal_context = body.principal_context or principal_context_from_bearer(source="agent_bearer")
            principal = PrincipalResolver().resolve(
                principal_context=principal_context,
                viewer_roles=body.viewer_roles,
                authenticated_user=authenticated_user,
            )
            payload = agent_execute_service.execute(
                question=body.question,
                principal_context=principal.to_dict(),
                viewer_roles=None,
                runtime_options=runtime_options,
                authenticated_user=authenticated_user,
                idempotency_key=body.idempotency_key,
            )
        except PydanticValidationError as exc:
            return error("请求参数错误", details=exc.errors())
        except GatewayQueryError as exc:
            return error(
                f"dw-query-gateway is not configured or unavailable: {exc}",
                status=503,
                details={
                    "error_code": "gateway_unavailable",
                    "message": str(exc),
                    "hint": "请确认 dw-query-gateway 服务可达（QUERY_GATEWAY_BASE_URL），且服务令牌有效。",
                },
            )
        except (AuthenticationError, AuthorizationError, ValidationError):
            raise
        except Exception as exc:
            return error(f"执行 Agent 语义查询失败: {exc}")
        return success(data=payload, status=202 if payload.get("status") == "submitted" else 200)

    return bp
