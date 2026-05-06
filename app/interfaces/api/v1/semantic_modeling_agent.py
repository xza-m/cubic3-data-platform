"""建模助手 Agent REST API。"""
from __future__ import annotations

from functools import wraps
from typing import Any, Callable, Dict

from flask import Blueprint, current_app, request

from app.interfaces.api.middleware.auth import require_admin
from app.shared.response import error, success


def _require_admin_unless_testing(func: Callable[..., Any]) -> Callable[..., Any]:
    """测试环境允许直接注入 stub，正式环境沿用管理员写权限。"""

    @wraps(func)
    def wrapper(*args: Any, **kwargs: Any):
        if current_app.config.get("TESTING"):
            return func(*args, **kwargs)
        return require_admin(func)(*args, **kwargs)

    return wrapper


def create_semantic_modeling_agent_blueprint(builder):
    bp = Blueprint("semantic_modeling_agent", __name__, url_prefix="/api/v1/semantic/modeling-agent")

    def _body() -> Dict[str, Any]:
        return request.get_json(silent=True) or {}

    def _require_spec(body: Dict[str, Any]):
        spec = body.get("spec")
        if not isinstance(spec, dict) or not spec:
            return None, error("缺少必填字段: spec")
        return spec, None

    @bp.route("/spec-draft", methods=["POST"])
    @_require_admin_unless_testing
    def spec_draft():
        try:
            return success(data=builder.create_spec_draft(_body()))
        except Exception as exc:
            return error(f"生成 SemanticModelingAgentSpec 失败: {str(exc)}")

    @bp.route("/draft-from-spec", methods=["POST"])
    @_require_admin_unless_testing
    def draft_from_spec():
        spec, maybe_error = _require_spec(_body())
        if maybe_error:
            return maybe_error
        try:
            return success(data=builder.draft_from_spec(spec))
        except Exception as exc:
            return error(f"生成建模草稿失败: {str(exc)}")

    @bp.route("/validate", methods=["POST"])
    @_require_admin_unless_testing
    def validate():
        spec, maybe_error = _require_spec(_body())
        if maybe_error:
            return maybe_error
        try:
            return success(data=builder.validate(spec))
        except Exception as exc:
            return error(f"校验建模草稿失败: {str(exc)}")

    @bp.route("/agent-ready-check", methods=["POST"])
    @_require_admin_unless_testing
    def agent_ready_check():
        spec, maybe_error = _require_spec(_body())
        if maybe_error:
            return maybe_error
        try:
            return success(data=builder.agent_ready_check(spec))
        except Exception as exc:
            return error(f"校验 Agent-ready 状态失败: {str(exc)}")

    @bp.route("/apply", methods=["POST"])
    @_require_admin_unless_testing
    def apply():
        spec, maybe_error = _require_spec(_body())
        if maybe_error:
            return maybe_error
        try:
            return success(data=builder.apply(spec))
        except Exception as exc:
            return error(f"保存建模草稿失败: {str(exc)}")

    @bp.route("/publish", methods=["POST"])
    @_require_admin_unless_testing
    def publish():
        body = _body()
        spec, maybe_error = _require_spec(body)
        if maybe_error:
            return maybe_error
        try:
            return success(data=builder.publish(spec, publish_targets=body.get("publish_targets")))
        except Exception as exc:
            return error(f"发布建模资产失败: {str(exc)}")

    return bp
