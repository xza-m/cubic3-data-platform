"""语义中心数据资产底座 API。"""
from __future__ import annotations

from typing import Any

from flask import Blueprint, request

from app.interfaces.api.middleware.auth import require_admin, require_auth
from app.shared.response import created, not_found, success


def create_semantic_assets_blueprint(data_asset_service: Any) -> Blueprint:
    bp = Blueprint(
        "semantic_assets",
        __name__,
        url_prefix="/api/v1/semantic/assets",
    )

    @bp.route("/radar", methods=["GET"])
    @require_auth
    def radar():
        service = _resolve_data_asset_service(data_asset_service)
        return success(service.radar_summary())

    @bp.route("/tables", methods=["GET"])
    @bp.route("/physical-tables", methods=["GET"])
    @require_auth
    def tables():
        service = _resolve_data_asset_service(data_asset_service)
        return success(
            service.list_tables(
                keyword=request.args.get("keyword", ""),
                page=_positive_int_arg("page", default=1),
                page_size=_positive_int_arg("page_size", default=20, maximum=200),
                source_id=_optional_arg("source_id"),
                database=_optional_arg("database"),
                schema=_optional_arg("schema"),
                sync_status=_optional_arg("sync_status"),
                lifecycle_status=_optional_arg("lifecycle_status"),
            )
        )

    @bp.route("/tables/<table_id>", methods=["GET"])
    @require_auth
    def table_detail(table_id: str):
        service = _resolve_data_asset_service(data_asset_service)
        table = service.get_table(table_id)
        if table is None:
            return not_found("数据资产不存在")
        return success(table)

    @bp.route("/tables/<table_id>/fields", methods=["GET"])
    @require_auth
    def table_fields(table_id: str):
        service = _resolve_data_asset_service(data_asset_service)
        fields = service.list_fields(table_id)
        if fields is None:
            return not_found("数据资产不存在")
        return success(fields)

    @bp.route("/tables/<table_id>/evidence", methods=["GET"])
    @require_auth
    def table_evidence(table_id: str):
        service = _resolve_data_asset_service(data_asset_service)
        evidence = service.build_table_evidence(table_id)
        if evidence is None:
            return not_found("数据资产不存在")
        return success(evidence)

    @bp.route("/sync-runs", methods=["GET"])
    @require_auth
    def sync_runs():
        service = _resolve_data_asset_service(data_asset_service)
        return success(
            service.list_sync_runs(
                limit=_positive_int_arg("limit", default=50, maximum=200)
            )
        )

    @bp.route("/sync-runs/<sync_run_id>", methods=["GET"])
    @require_auth
    def sync_run_detail(sync_run_id: str):
        service = _resolve_data_asset_service(data_asset_service)
        sync_run = service.get_sync_run(sync_run_id)
        if sync_run is None:
            return not_found("同步任务不存在")
        return success(sync_run)

    @bp.route("/sync-runs", methods=["POST"])
    @bp.route("/metadata-sync", methods=["POST"])
    @require_admin
    def create_sync_run():
        service = _resolve_data_asset_service(data_asset_service)
        return created(service.sync_from_payload(request.get_json(silent=True) or {}))

    return bp


def _resolve_data_asset_service(data_asset_service: Any) -> Any:
    if hasattr(data_asset_service, "radar_summary"):
        return data_asset_service
    return data_asset_service()


def _positive_int_arg(name: str, *, default: int, maximum: int | None = None) -> int:
    raw_value = request.args.get(name)
    if raw_value is None or str(raw_value).strip() == "":
        return default
    try:
        parsed = int(raw_value)
    except (TypeError, ValueError):
        return default
    if parsed < 1:
        return default
    return min(parsed, maximum) if maximum is not None else parsed


def _optional_arg(name: str) -> str | None:
    value = request.args.get(name)
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None
