"""查询执行面 API。"""
from __future__ import annotations

from flask import Blueprint, g, request
from pydantic import ValidationError as PydanticValidationError

from app.application.query_execution.schemas import SubmitQueryExecutionRequest
from app.interfaces.api.middleware.auth import require_auth
from app.shared.exceptions import (
    ApplicationException,
    EntityNotFoundError,
    InvalidOperationError,
    InvalidSQLError,
)
from app.shared.response import error, not_found, success
from app.shared.utils.logger import get_logger


logger = get_logger(__name__)


def _current_principal_id() -> str:
    return str(getattr(g, "user_id", None) or "anonymous")


def create_query_execution_blueprint(submission_service, result_service):
    bp = Blueprint("query_execution", __name__, url_prefix="/api/v1/query-execution")

    @bp.route("/jobs", methods=["POST"])
    @require_auth
    def submit_job():
        try:
            body = SubmitQueryExecutionRequest(**(request.get_json(silent=True) or {}))
            submitted = submission_service.submit(
                principal_id=_current_principal_id(),
                source_id=body.source_id,
                sql_query=body.sql_query,
                route_type=body.route_type,
                semantic_plan_id=body.semantic_plan_id,
                resource_set=body.resource_set,
                sql_hash=body.sql_hash,
                data_level=body.data_level,
                project_name=body.project_name,
                governance_snapshot=body.governance_snapshot,
                idempotency_key=body.idempotency_key,
                result_mode=body.result_mode,
            )
            return success(data=submitted.to_dict(), status=201)
        except PydanticValidationError as exc:
            return error("请求参数错误", details=exc.errors())
        except InvalidSQLError as exc:
            return error(str(exc), details=exc.details)
        except ApplicationException as exc:
            return error(str(exc), details=exc.details)
        except Exception as exc:  # pragma: no cover - infrastructure fallback
            logger.error("submit query execution job failed", error=str(exc), exc_info=True)
            return error(f"提交查询执行任务失败: {exc}", status=500)

    @bp.route("/jobs/<query_id>", methods=["GET"])
    @require_auth
    def get_job(query_id: str):
        try:
            return success(data=result_service.get_job(query_id=query_id, principal_id=_current_principal_id()))
        except EntityNotFoundError as exc:
            return not_found(str(exc))

    @bp.route("/jobs/<query_id>/events", methods=["GET"])
    @require_auth
    def list_events(query_id: str):
        try:
            return success(data=result_service.list_events(query_id=query_id, principal_id=_current_principal_id()))
        except EntityNotFoundError as exc:
            return not_found(str(exc))

    @bp.route("/jobs/<query_id>/results", methods=["GET"])
    @require_auth
    def get_results(query_id: str):
        try:
            return success(data=result_service.get_result_metadata(query_id=query_id, principal_id=_current_principal_id()))
        except EntityNotFoundError as exc:
            return not_found(str(exc))

    @bp.route("/jobs/<query_id>/cancel", methods=["POST"])
    @require_auth
    def cancel_job(query_id: str):
        try:
            job = result_service.cancel(query_id=query_id, principal_id=_current_principal_id())
            return success(data={"query_id": job.id, "status": job.status, "cancel_requested": job.cancel_requested})
        except EntityNotFoundError as exc:
            return not_found(str(exc))
        except InvalidOperationError as exc:
            return error(str(exc), status=409, details=exc.details)

    return bp
