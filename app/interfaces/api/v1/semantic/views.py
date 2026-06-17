"""语义层 API · View / 物化 / Recipe 路由。"""
import os
from datetime import datetime, timezone

from flask import current_app, g, request

from app.interfaces.api.middleware.auth import require_admin, require_auth
from app.shared.response import success, error, not_found, created
from ._shared import logger, _json_scalar, _extract_view_cube_name


def register_view_routes(bp, ctx):
    semantic_service = ctx.semantic_service
    publish_service = ctx.publish_service
    _parse_positive_int_arg = ctx._parse_positive_int_arg
    _contains_keyword = ctx._contains_keyword
    _build_list_payload = ctx._build_list_payload
    _get_vmat_service = ctx._get_vmat_service

    @bp.route('/views', methods=['GET'])
    @require_auth
    def list_views():
        include_private = request.args.get("include_private", "").lower() == "true"
        keyword = (request.args.get("q") or "").strip()
        list_view_summaries = getattr(semantic_service, "list_view_summaries", None)
        candidate = list_view_summaries(public_only=not include_private) if callable(list_view_summaries) else None
        if isinstance(candidate, list):
            data = candidate
        else:
            views = semantic_service.list_views(public_only=not include_private)
            data = [
                {
                    "name": v.name,
                    "title": v.title,
                    "description": v.description or "",
                    "public": v.public,
                    "cube_count": len(v.cubes),
                    "cubes": [
                        cube_name
                        for ref in v.cubes
                        for cube_name in [_extract_view_cube_name(ref)]
                        if cube_name
                    ],
                }
                for v in views
            ]
        filtered = [
            view for view in data
            if _contains_keyword(view, keyword, ["name", "title", "description"])
        ]
        filtered.sort(key=lambda item: ((item.get("title") or item.get("name") or "").lower(), item.get("name") or ""))
        return success(data=_build_list_payload(filtered, "views"))

    @bp.route('/views/<view_name>', methods=['GET'])
    @require_auth
    def describe_view(view_name):
        include_private = request.args.get("include_private", "").lower() == "true"
        result = semantic_service.describe_view(view_name, include_private=include_private)
        if "error" in result:
            return not_found(result["error"])
        # B-back-3: 附加物化状态字段
        view_id = result.get("id")
        if view_id is not None:
            try:
                extra = _get_vmat_service().get_view_extra_fields(view_id)
                result = {**result, **extra}
            except Exception:
                result.setdefault("materialized_at", None)
                result.setdefault("materialize_status", "idle")
        else:
            result.setdefault("materialized_at", None)
            result.setdefault("materialize_status", "idle")
        return success(data=result)

    # B-back-3: 异步触发物化
    @bp.route('/views/<int:view_id>/materialize', methods=['POST'])
    @require_admin
    def trigger_view_materialize(view_id):
        """POST /api/v1/semantic/views/:id/materialize — 异步触发，立即返回 run_id。"""
        try:
            result = _get_vmat_service().trigger(view_id)
        except Exception as exc:
            logger.error("trigger_materialize_failed", view_id=view_id, error=str(exc))
            return error(f"触发物化失败: {exc}")
        return created(data=result)

    # B-back-3: 物化运行历史
    @bp.route('/views/<int:view_id>/materialize/runs', methods=['GET'])
    @require_auth
    def list_view_materialize_runs(view_id):
        """GET /api/v1/semantic/views/:id/materialize/runs?page=&page_size="""
        page = _parse_positive_int_arg("page", default=1)
        page_size = _parse_positive_int_arg("page_size", default=20, maximum=200)
        try:
            result = _get_vmat_service().get_runs(view_id, page=page, page_size=page_size)
        except Exception as exc:
            return error(f"查询物化历史失败: {exc}")
        return success(data=result)

    @bp.route('/views/<view_name>/materialize', methods=['POST'])
    @require_admin
    def materialize_view(view_name):
        """兼容旧路由：按名称触发 View 发布（非 ID 版本）。"""
        try:
            body = request.get_json(silent=True) or {}
            result = publish_service.publish_view(view_name, source_id=body.get("source_id"))
        except Exception as e:
            if "未找到 View" in str(e):
                return not_found(str(e))
            logger.error("materialize_failed", view=view_name, error=str(e))
            return error(f"发布虚拟数据集失败: {str(e)}")

        if result.get("action") == "created":
            return created(data=result)
        return success(data=result)

    @bp.route('/views/<view_name>/materialize-status', methods=['GET'])
    @require_auth
    def materialize_status(view_name):
        """查询某个 View 的逻辑发布状态。"""
        return success(data=publish_service.get_publish_status(view_name))

    @bp.route('/views/materialize-status', methods=['GET'])
    @require_auth
    def batch_materialize_status():
        """批量查询所有 View 的逻辑发布状态（前端列表页使用）。"""
        include_private = request.args.get("include_private", "").lower() == "true"
        return success(data=publish_service.get_batch_publish_status(public_only=not include_private))

    # ── Recipes ──

    @bp.route('/recipes', methods=['GET'])
    @require_auth
    def list_recipes():
        list_recipe_summaries = getattr(semantic_service, "list_recipe_summaries", None)
        candidate = list_recipe_summaries() if callable(list_recipe_summaries) else None
        if isinstance(candidate, list):
            data = candidate
        else:
            recipes = semantic_service._recipe_repo.list_all()
            data = [
                {
                    "name": r.name,
                    "title": r.title,
                    "tags": r.tags,
                    "example_count": len(r.examples),
                    "related_cubes": list(r.extract_cube_names()),
                }
                for r in recipes
            ]
        return success(data={"recipes": data, "total": len(data)})
