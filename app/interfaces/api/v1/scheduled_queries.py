# app/interfaces/api/v1/scheduled_queries.py
"""定时查询 REST API（B-back-8）"""
from flask import Blueprint, request, g

from app.interfaces.api.middleware.auth import require_auth
from app.shared.exceptions import EntityNotFoundError, ValidationError
from app.shared.response import created, error, not_found, server_error, success
from app.shared.utils.logger import get_logger

# 导入实体确保 SQLAlchemy 元数据注册
from app.domain.queries.scheduled_query import ScheduledQuery  # noqa
from app.domain.queries.scheduled_query_run import ScheduledQueryRun  # noqa

logger = get_logger(__name__)
bp = Blueprint("scheduled_queries", __name__, url_prefix="/api/v1/queries/scheduled")


def _current_user():
    return g.get("user_id", "admin")


def _service():
    from app.application.queries.scheduled_query_service import ScheduledQueryService
    return ScheduledQueryService()


# ── 列表 ─────────────────────────────────────────────────────────────────────

@bp.route("", methods=["GET"])
@require_auth
def list_scheduled():
    """GET /api/v1/queries/scheduled  — 分页列表"""
    try:
        result = _service().list(
            page=request.args.get("page", 1, type=int),
            page_size=request.args.get("page_size", 20, type=int),
            owner_id=_current_user(),
        )
        return success(data=result)
    except Exception as exc:
        logger.error(f"list_scheduled failed: {exc}", exc_info=True)
        return server_error(message=str(exc))


# ── 创建 ─────────────────────────────────────────────────────────────────────

@bp.route("", methods=["POST"])
@require_auth
def create_scheduled():
    """POST /api/v1/queries/scheduled"""
    body = request.get_json(silent=True) or {}
    try:
        result = _service().create(body, owner_id=_current_user())
        return created(data=result)
    except ValidationError as exc:
        return error(message=str(exc))
    except Exception as exc:
        logger.error(f"create_scheduled failed: {exc}", exc_info=True)
        return server_error(message=str(exc))


# ── 详情 ─────────────────────────────────────────────────────────────────────

@bp.route("/<int:id>", methods=["GET"])
@require_auth
def get_scheduled(id):
    """GET /api/v1/queries/scheduled/:id"""
    try:
        return success(data=_service().get(id))
    except EntityNotFoundError as exc:
        return not_found(message=str(exc))
    except Exception as exc:
        logger.error(f"get_scheduled failed: {exc}", exc_info=True)
        return server_error(message=str(exc))


# ── 更新 ─────────────────────────────────────────────────────────────────────

@bp.route("/<int:id>", methods=["PATCH"])
@require_auth
def update_scheduled(id):
    """PATCH /api/v1/queries/scheduled/:id"""
    body = request.get_json(silent=True) or {}
    try:
        result = _service().update(id, body)
        return success(data=result)
    except EntityNotFoundError as exc:
        return not_found(message=str(exc))
    except ValidationError as exc:
        return error(message=str(exc))
    except Exception as exc:
        logger.error(f"update_scheduled failed: {exc}", exc_info=True)
        return server_error(message=str(exc))


# ── 删除 ─────────────────────────────────────────────────────────────────────

@bp.route("/<int:id>", methods=["DELETE"])
@require_auth
def delete_scheduled(id):
    """DELETE /api/v1/queries/scheduled/:id"""
    try:
        _service().delete(id)
        return success()
    except EntityNotFoundError as exc:
        return not_found(message=str(exc))
    except Exception as exc:
        logger.error(f"delete_scheduled failed: {exc}", exc_info=True)
        return server_error(message=str(exc))


# ── enable / disable（幂等）─────────────────────────────────────────────────

@bp.route("/<int:id>/enable", methods=["POST"])
@require_auth
def enable_scheduled(id):
    """POST /api/v1/queries/scheduled/:id/enable — 幂等启用"""
    try:
        return success(data=_service().enable(id))
    except EntityNotFoundError as exc:
        return not_found(message=str(exc))
    except Exception as exc:
        logger.error(f"enable_scheduled failed: {exc}", exc_info=True)
        return server_error(message=str(exc))


@bp.route("/<int:id>/disable", methods=["POST"])
@require_auth
def disable_scheduled(id):
    """POST /api/v1/queries/scheduled/:id/disable — 幂等禁用"""
    try:
        return success(data=_service().disable(id))
    except EntityNotFoundError as exc:
        return not_found(message=str(exc))
    except Exception as exc:
        logger.error(f"disable_scheduled failed: {exc}", exc_info=True)
        return server_error(message=str(exc))


# ── 手动 trigger ──────────────────────────────────────────────────────────────

@bp.route("/<int:id>/trigger", methods=["POST"])
@require_auth
def trigger_scheduled(id):
    """POST /api/v1/queries/scheduled/:id/trigger — 手动触发，不影响 next_run_at"""
    try:
        run = _service().trigger(id)
        return created(data=run)
    except EntityNotFoundError as exc:
        return not_found(message=str(exc))
    except Exception as exc:
        logger.error(f"trigger_scheduled failed: {exc}", exc_info=True)
        return server_error(message=str(exc))


# ── runs 历史列表 ──────────────────────────────────────────────────────────────

@bp.route("/<int:id>/runs", methods=["GET"])
@require_auth
def list_runs(id):
    """GET /api/v1/queries/scheduled/:id/runs — runs 分页"""
    try:
        result = _service().list_runs(
            query_id=id,
            page=request.args.get("page", 1, type=int),
            page_size=request.args.get("page_size", 20, type=int),
        )
        return success(data=result)
    except EntityNotFoundError as exc:
        return not_found(message=str(exc))
    except Exception as exc:
        logger.error(f"list_runs failed: {exc}", exc_info=True)
        return server_error(message=str(exc))
