"""语义层 API · Catalog / Domain / 发布历史路由。"""
import os
from datetime import datetime, timezone

from flask import current_app, g, request

from app.interfaces.api.middleware.auth import require_admin, require_auth
from app.shared.response import success, error, not_found, created
from ._shared import logger, _json_scalar, _extract_view_cube_name


def register_domain_routes(bp, ctx):
    domain_modeling_service = ctx.domain_modeling_service
    domain_canvas_service = ctx.domain_canvas_service
    _contains_keyword = ctx._contains_keyword
    _contains_domain_join_payload = ctx._contains_domain_join_payload
    _domain_join_payload_error = ctx._domain_join_payload_error
    _build_list_payload = ctx._build_list_payload
    _resolve_domain_publish_history_service = ctx._resolve_domain_publish_history_service

    @bp.route('/domains', methods=['GET'])
    @require_auth
    def list_domains():
        domains = domain_modeling_service.list_domains()
        keyword = (request.args.get("q") or "").strip()
        catalog_code = (request.args.get("catalog_code") or "").strip()
        filtered = domains
        if catalog_code:
            filtered = [
                domain for domain in filtered
                if (domain.get("catalog_code") or domain_modeling_service.DEFAULT_CATALOG_CODE) == catalog_code
            ]
        filtered = [
            domain for domain in filtered
            if _contains_keyword(domain, keyword, ["name", "code", "description", "catalog_name"])
        ]
        filtered.sort(key=lambda item: ((item.get("name") or item.get("code") or "").lower(), item.get("code") or ""))
        return success(data=_build_list_payload(filtered, "domains"))

    @bp.route('/catalogs', methods=['GET'])
    @require_auth
    def list_catalogs():
        catalogs = domain_modeling_service.list_catalogs()
        return success(data={"catalogs": catalogs, "total": len(catalogs)})

    @bp.route('/catalogs', methods=['POST'])
    @require_admin
    def create_catalog():
        body = request.get_json(silent=True) or {}
        try:
            catalog = domain_modeling_service.create_catalog(body)
        except Exception as exc:
            return error(f"创建目录失败: {str(exc)}")
        return created(data=catalog.model_dump(mode="json"))

    @bp.route('/catalogs/<catalog_code>', methods=['PUT'])
    @require_admin
    def update_catalog(catalog_code):
        body = request.get_json(silent=True) or {}
        try:
            catalog = domain_modeling_service.update_catalog(catalog_code, body)
        except Exception as exc:
            if "未找到目录" in str(exc):
                return not_found(str(exc))
            return error(f"更新目录失败: {str(exc)}")
        return success(data=catalog.model_dump(mode="json"))

    @bp.route('/catalogs/<catalog_code>', methods=['DELETE'])
    @require_admin
    def delete_catalog(catalog_code):
        try:
            domain_modeling_service.delete_catalog(catalog_code)
        except Exception as exc:
            if "未找到目录" in str(exc):
                return not_found(str(exc))
            return error(f"删除目录失败: {str(exc)}")
        return success(data={"code": catalog_code})

    @bp.route('/domains', methods=['POST'])
    @require_admin
    def create_domain():
        body = request.get_json(silent=True) or {}
        if _contains_domain_join_payload(body):
            return _domain_join_payload_error()
        try:
            domain = domain_modeling_service.create_domain(body)
        except Exception as exc:
            return error(f"创建领域失败: {str(exc)}")
        return created(data=domain_modeling_service.get_domain_detail(domain.id or domain.code))

    @bp.route('/domains/<domain_id>', methods=['GET'])
    @require_auth
    def describe_domain(domain_id):
        try:
            domain = domain_modeling_service.get_domain_detail(domain_id)
        except Exception as exc:
            return not_found(str(exc))
        return success(data=domain)

    @bp.route('/domains/<domain_id>', methods=['PUT'])
    @require_admin
    def update_domain(domain_id):
        body = request.get_json(silent=True) or {}
        if _contains_domain_join_payload(body):
            return _domain_join_payload_error()
        try:
            domain = domain_modeling_service.update_domain(domain_id, body)
        except Exception as exc:
            return error(f"更新领域失败: {str(exc)}")
        return success(data=domain_modeling_service.get_domain_detail(domain.id or domain.code))

    @bp.route('/domains/<domain_id>/canvas', methods=['GET'])
    @require_auth
    def get_domain_canvas(domain_id):
        try:
            result = domain_canvas_service.get_canvas(domain_id)
        except Exception as exc:
            return not_found(str(exc))
        return success(data=result)

    @bp.route('/domains/<domain_id>/context-preview', methods=['POST'])
    @require_auth
    def get_domain_context_preview(domain_id):
        try:
            result = domain_modeling_service.get_domain_context_preview(domain_id)
        except Exception as exc:
            return not_found(str(exc))
        return success(data=result)

    @bp.route('/domains/<domain_id>/cubes', methods=['POST'])
    @require_admin
    def add_cube_to_domain(domain_id):
        body = request.get_json(silent=True) or {}
        cube_name = body.get("cube_name")
        if not cube_name:
            return error("请求体必须包含 cube_name")
        try:
            domain = domain_modeling_service.add_cube(domain_id, cube_name)
        except Exception as exc:
            return error(f"添加 Cube 失败: {str(exc)}")
        return success(data=domain_modeling_service.get_domain_detail(domain.id or domain.code))

    @bp.route('/domains/<domain_id>/publish', methods=['POST'])
    @require_admin
    def publish_domain(domain_id):
        body = request.get_json(silent=True) or {}
        if _contains_domain_join_payload(body):
            return _domain_join_payload_error()

        history_service = _resolve_domain_publish_history_service()
        prev_snapshot: Optional[Dict[str, Any]] = None
        if history_service is not None:
            try:
                prev = domain_modeling_service.get_domain_detail(domain_id)
                if isinstance(prev, dict):
                    prev_snapshot = {
                        "cubes": prev.get("cubes") or [],
                    }
            except Exception:
                prev_snapshot = None

        try:
            domain = domain_modeling_service.publish_domain(
                domain_id,
                cubes=body.get("cubes"),
            )
        except Exception as exc:
            if history_service is not None:
                try:
                    history_service.record_publish(
                        domain_id=domain_id,
                        domain_code=None,
                        snapshot={"error": str(exc)},
                        published_by=g.get("user_id"),
                        note=body.get("note"),
                        status="failed",
                        diff_summary=str(exc)[:200],
                    )
                except Exception:
                    pass
            return error(f"发布领域失败: {str(exc)}")

        detail = domain_modeling_service.get_domain_detail(domain.id or domain.code)

        if history_service is not None:
            try:
                next_snapshot = {
                    "cubes": detail.get("cubes") or [] if isinstance(detail, dict) else [],
                }
                history_service.record_publish(
                    domain_id=str(domain.id or domain.code),
                    domain_code=domain.code,
                    snapshot=next_snapshot,
                    published_by=g.get("user_id"),
                    note=body.get("note"),
                    diff_summary=history_service.compute_diff_summary(
                        prev_snapshot, next_snapshot,
                    ),
                    status="success",
                )
            except Exception:
                pass

        return success(data=detail)

    @bp.route('/domains/<domain_id>/publish/history', methods=['GET'])
    @require_auth
    def get_domain_publish_history(domain_id):
        """
        领域发布历史（B-6）

        响应: ``{ records: [{ version, published_at, published_by, status, ... }], total }``
        """
        page = request.args.get('page', 1, type=int)
        page_size = request.args.get('page_size', 20, type=int)

        history_service = _resolve_domain_publish_history_service()
        if history_service is None:
            return success(data={"records": [], "total": 0})

        try:
            result = history_service.list_publish_records(
                domain_id=domain_id, page=page, page_size=page_size,
            )
        except Exception as exc:
            logger.warning("list_domain_publish_history_failed", error=str(exc))
            return success(data={"records": [], "total": 0})
        return success(data=result)
