"""语义建模 Copilot REST API。"""
from __future__ import annotations

from functools import wraps
from typing import Any, Callable, Dict, Optional

from flask import Blueprint, current_app, g, request

try:
    from app.interfaces.api.middleware.auth import require_identity  # type: ignore[attr-defined]
except ImportError:  # pragma: no cover - 兼容尚未迁移到 access-principal-identity 的运行时
    from app.interfaces.api.middleware.auth import require_auth as require_identity  # type: ignore[no-redef]
from app.application.agent_inference_runtime.errors import AgentInferenceRuntimeError
from app.shared.response import error, success


def _require_identity_unless_testing(func: Callable[..., Any]) -> Callable[..., Any]:
    """测试环境允许直接注入 stub，正式环境要求已登录身份。

    Copilot 只创建构建期会话与 ModelingProposal，不发布、不应用正式语义资产；
    所以这里不能沿用平台管理员写权限，否则业务用户无法从未命中问题发起语义补充。
    """

    @wraps(func)
    def wrapper(*args: Any, **kwargs: Any):
        if current_app.config.get("TESTING"):
            return func(*args, **kwargs)
        return require_identity(func)(*args, **kwargs)

    return wrapper


def _principal_id() -> Optional[str]:
    """从 Flask g 取当前 principal_id；测试 / 未鉴权时返回 None。"""
    return getattr(g, "principal_id", None)


def _copilot_error(operation: str, exc: Exception):
    """把 Copilot 应用异常映射为可观测的 HTTP 错误。"""

    if isinstance(exc, PermissionError):
        return error(
            str(exc),
            status=403,
            details={"code": "COPILOT_FORBIDDEN"},
        )
    if isinstance(exc, AgentInferenceRuntimeError):
        status = 503 if exc.code in {"RUNTIME_NOT_CONFIGURED", "RUNTIME_UNAVAILABLE"} else 422
        return error(
            str(exc),
            status=status,
            details={"code": exc.code, **exc.details},
        )
    if isinstance(exc, LookupError) or (
        isinstance(exc, ValueError) and "not found" in str(exc).lower()
    ):
        return error(
            str(exc),
            status=404,
            details={"code": "COPILOT_NOT_FOUND"},
        )
    if isinstance(exc, ValueError):
        return error(
            str(exc),
            status=422,
            details={"code": "COPILOT_VALIDATION_ERROR"},
        )

    current_app.logger.exception("semantic modeling copilot %s failed", operation)
    return error(
        f"{operation}失败",
        status=500,
        details={"code": "COPILOT_INTERNAL_ERROR"},
    )


def create_semantic_modeling_copilot_blueprint(copilot_service: Any):
    bp = Blueprint(
        "semantic_modeling_copilot",
        __name__,
        url_prefix="/api/v1/semantic/modeling-copilot",
    )

    def _body() -> Dict[str, Any]:
        return request.get_json(silent=True) or {}

    @bp.route("/sessions", methods=["GET"])
    @_require_identity_unless_testing
    def list_sessions():
        try:
            args = request.args
            limit = int(args.get("limit", 50))
            offset = int(args.get("offset", 0))
            status = args.get("status") or None
            include_legacy = args.get("include_legacy", "true").lower() != "false"
            return success(data=copilot_service.list_sessions(
                principal_id=_principal_id(),
                limit=limit,
                offset=offset,
                status=status,
                include_legacy=include_legacy,
            ))
        except Exception as exc:
            return _copilot_error("列出建模 Copilot 会话", exc)

    @bp.route("/sessions", methods=["POST"])
    @_require_identity_unless_testing
    def create_session():
        try:
            payload = _body()
            principal_id = _principal_id()
            if principal_id:
                payload["principal_id"] = principal_id
            return success(data=copilot_service.create_session(payload))
        except Exception as exc:
            return _copilot_error("创建建模 Copilot 会话", exc)

    @bp.route("/sessions/<session_id>", methods=["GET"])
    @_require_identity_unless_testing
    def get_session(session_id: str):
        try:
            return success(data=copilot_service.get_session(
                session_id,
                principal_id=_principal_id(),
            ))
        except Exception as exc:
            return _copilot_error("获取建模 Copilot 会话", exc)

    @bp.route("/sessions/<session_id>/review", methods=["GET"])
    @_require_identity_unless_testing
    def get_review(session_id: str):
        try:
            return success(data=copilot_service.get_review(
                session_id,
                principal_id=_principal_id(),
            ))
        except Exception as exc:
            return _copilot_error("获取建模 Copilot Review", exc)

    @bp.route("/sessions/<session_id>", methods=["DELETE"])
    @_require_identity_unless_testing
    def delete_session(session_id: str):
        try:
            return success(data=copilot_service.delete_session(
                session_id,
                principal_id=_principal_id(),
            ))
        except Exception as exc:
            return _copilot_error("删除建模 Copilot 会话", exc)

    @bp.route("/sessions/<session_id>", methods=["PATCH"])
    @_require_identity_unless_testing
    def rename_session(session_id: str):
        try:
            return success(data=copilot_service.rename_session(
                session_id,
                _body(),
                principal_id=_principal_id(),
            ))
        except Exception as exc:
            return _copilot_error("更新建模 Copilot 会话", exc)

    @bp.route("/sessions/<session_id>/messages", methods=["POST"])
    @_require_identity_unless_testing
    def send_message(session_id: str):
        try:
            return success(data=copilot_service.send_message(
                session_id,
                _body(),
                principal_id=_principal_id(),
            ))
        except Exception as exc:
            return _copilot_error("运行建模 Copilot", exc)

    @bp.route("/sessions/<session_id>/confirmations", methods=["POST"])
    @_require_identity_unless_testing
    def confirm(session_id: str):
        try:
            return success(data=copilot_service.confirm(
                session_id,
                _body(),
                principal_id=_principal_id(),
            ))
        except Exception as exc:
            return _copilot_error("确认建模口径", exc)

    @bp.route("/sessions/<session_id>/accept-cube-draft", methods=["POST"])
    @_require_identity_unless_testing
    def accept_cube_draft(session_id: str):
        try:
            return success(data=copilot_service.accept_cube_draft(
                session_id,
                _body(),
                principal_id=_principal_id(),
            ))
        except Exception as exc:
            return _copilot_error("接受 Cube 草稿", exc)

    @bp.route("/sessions/<session_id>/sandbox", methods=["POST"])
    @_require_identity_unless_testing
    def sandbox(session_id: str):
        try:
            return success(data=copilot_service.sandbox(
                session_id,
                _body(),
                principal_id=_principal_id(),
            ))
        except Exception as exc:
            return _copilot_error("运行建模沙盒预演", exc)

    @bp.route("/sessions/<session_id>/save-proposal", methods=["POST"])
    @_require_identity_unless_testing
    def save_proposal(session_id: str):
        try:
            return success(data=copilot_service.save_proposal(
                session_id,
                _body(),
                principal_id=_principal_id(),
            ))
        except Exception as exc:
            return _copilot_error("保存建模 Proposal", exc)

    @bp.route("/sessions/<session_id>/publish", methods=["POST"])
    @_require_identity_unless_testing
    def publish_proposal(session_id: str):
        try:
            return success(data=copilot_service.publish_proposal(
                session_id,
                _body(),
                principal_id=_principal_id(),
            ))
        except Exception as exc:
            return _copilot_error("发布建模语义", exc)

    @bp.route("/sessions/<session_id>/spec", methods=["PATCH"])
    @_require_identity_unless_testing
    def update_spec(session_id: str):
        try:
            return success(data=copilot_service.update_spec(
                session_id,
                _body(),
                principal_id=_principal_id(),
            ))
        except Exception as exc:
            return _copilot_error("更新建模 spec", exc)

    return bp
