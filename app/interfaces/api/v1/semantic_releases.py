"""语义资产 Release 管理 API。"""
from __future__ import annotations

from typing import Any

from flask import Blueprint, request

from app.interfaces.api.middleware.auth import require_admin
from app.interfaces.api.v1.principal_context import principal_context_from_bearer
from app.shared.response import bad_request, not_found, server_error, success


def create_semantic_releases_blueprint(release_service) -> Blueprint:
    bp = Blueprint(
        "semantic_releases_v1",
        __name__,
        url_prefix="/api/v1/semantic/releases",
    )

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

    return bp


def _release_payload(release) -> dict[str, Any]:
    return {
        "id": release.id,
        "release_no": release.release_no,
        "namespace": release.namespace,
        "status": release.status,
        "scope_json": release.scope_json,
        "gate_result_json": release.gate_result_json,
        "previous_release_id": release.previous_release_id,
        "rollback_of_release_id": release.rollback_of_release_id,
        "idempotency_key": release.idempotency_key,
        "published_by": release.published_by,
        "published_at": release.published_at,
        "created_at": release.created_at,
    }
