"""语义资产 Release 管理 API。"""
from __future__ import annotations

from typing import Any

from flask import Blueprint, request

from app.application.semantic.semantic_release_service import SemanticReleaseService
from app.interfaces.api.middleware.auth import require_admin, require_auth
from app.interfaces.api.v1.principal_context import principal_context_from_bearer
from app.shared.response import bad_request, not_found, server_error, success


def create_semantic_releases_blueprint(release_service) -> Blueprint:
    bp = Blueprint(
        "semantic_releases_v1",
        __name__,
        url_prefix="/api/v1/semantic/releases",
    )

    @bp.route("", methods=["GET"])
    @require_auth
    def list_releases():
        namespace = str(request.args.get("namespace") or "default").strip() or "default"
        status = str(request.args.get("status") or "").strip() or None
        limit = _positive_int_arg("limit", default=50, maximum=200)
        offset = _non_negative_int_arg("offset", default=0)
        try:
            return success(
                release_service.list_releases(
                    namespace=namespace,
                    status=status,
                    limit=limit,
                    offset=offset,
                )
            )
        except Exception as exc:  # pragma: no cover - 兜底路径由全局错误监控承接
            return server_error(f"查询语义发布列表失败: {exc}")

    @bp.route("/<release_id>", methods=["GET"])
    @require_auth
    def get_release(release_id: str):
        try:
            payload = release_service.get_release_detail(release_id)
        except Exception as exc:  # pragma: no cover - 兜底路径由全局错误监控承接
            return server_error(f"查询语义发布详情失败: {exc}")
        if payload is None:
            return not_found("semantic release not found")
        return success(payload)

    @bp.route("/<release_id>/rollback", methods=["POST"])
    @require_admin
    def rollback_release(release_id: str):
        payload = request.get_json(silent=True) or {}
        idempotency_key = str(payload.get("idempotency_key") or "").strip()
        if not idempotency_key:
            return bad_request("请求体缺少必填字段: idempotency_key")
        namespace = str(payload.get("namespace") or "default").strip() or "default"
        principal = principal_context_from_bearer(source="semantic_release")
        actor = principal.get("principal_id")

        try:
            release = release_service.rollback_to(
                namespace=namespace,
                release_id=release_id,
                actor=actor,
                idempotency_key=idempotency_key,
            )
        except ValueError as exc:
            message = str(exc)
            if "not found" in message:
                return not_found(message)
            return bad_request(message)
        except Exception as exc:  # pragma: no cover - 兜底路径由全局错误监控承接
            return server_error(f"回滚语义发布失败: {exc}")
        return success(_release_payload(release))

    @bp.route("/<release_id>/deprecate", methods=["POST"])
    @require_admin
    def deprecate_release(release_id: str):
        return _transition_release(release_id, action="deprecate")

    @bp.route("/<release_id>/revoke", methods=["POST"])
    @require_admin
    def revoke_release(release_id: str):
        return _transition_release(release_id, action="revoke")

    def _transition_release(release_id: str, *, action: str):
        payload = request.get_json(silent=True) or {}
        reason = str(payload.get("reason") or "").strip() or None
        if action == "revoke" and not reason:
            return bad_request("撤销发布必须填写 reason（口径召回原因）")
        principal = principal_context_from_bearer(source="semantic_release")
        actor = principal.get("principal_id")
        try:
            method = getattr(release_service, action)
            release = method(release_id=release_id, actor=actor, reason=reason)
        except ValueError as exc:
            message = str(exc)
            if "not found" in message:
                return not_found(message)
            return bad_request(message)
        except Exception as exc:  # pragma: no cover - 兜底路径由全局错误监控承接
            return server_error(f"变更语义发布状态失败: {exc}")
        return success(_release_payload(release))

    return bp


def _release_payload(release) -> dict[str, Any]:
    return SemanticReleaseService.release_summary(release)


def _positive_int_arg(name: str, *, default: int, maximum: int) -> int:
    raw_value = request.args.get(name)
    try:
        parsed = int(raw_value) if raw_value is not None else default
    except (TypeError, ValueError):
        parsed = default
    return max(1, min(parsed, maximum))


def _non_negative_int_arg(name: str, *, default: int) -> int:
    raw_value = request.args.get(name)
    try:
        parsed = int(raw_value) if raw_value is not None else default
    except (TypeError, ValueError):
        parsed = default
    return max(0, parsed)
