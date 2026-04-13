"""只读语义投影预览 API。"""
from __future__ import annotations

from flask import Blueprint, request

from app.shared.response import error, success


def create_semantic_mapper_blueprint(mapper_service):
    bp = Blueprint("semantic_mapper", __name__, url_prefix="/api/v1/semantic-mapper")

    @bp.route("/preview", methods=["POST"])
    def preview():
        body = request.get_json(silent=True) or {}
        entity_type = body.get("entity_type")
        entity_name = body.get("entity_name")
        if not entity_type or not entity_name:
            return error("请求体缺少必填字段: entity_type, entity_name")
        try:
            payload = mapper_service.preview(entity_type=entity_type, entity_name=entity_name)
        except Exception as exc:
            return error(f"生成语义投影预览失败: {exc}")
        return success(data=payload)

    @bp.route("/stale-check", methods=["GET"])
    def stale_check():
        return success(data=mapper_service.stale_check())

    @bp.route("/consistency-report", methods=["GET"])
    def consistency_report():
        return success(data=mapper_service.consistency_report())

    @bp.route("/diff", methods=["GET"])
    def diff():
        return success(data=mapper_service.diff())

    @bp.route("/measure-backlinks", methods=["GET"])
    def measure_backlinks():
        measure_ref = request.args.get("measure_ref", "").strip()
        if not measure_ref:
            return error("请求参数缺少必填字段: measure_ref")
        try:
            payload = mapper_service.measure_backlinks(measure_ref)
        except Exception as exc:
            return error(f"生成 Measure 反向引用失败: {exc}")
        return success(data=payload)

    @bp.route("/cube-backlinks", methods=["GET"])
    def cube_backlinks():
        cube_name = request.args.get("cube_name", "").strip()
        if not cube_name:
            return error("请求参数缺少必填字段: cube_name")
        try:
            payload = mapper_service.cube_backlinks(cube_name)
        except Exception as exc:
            return error(f"生成 Cube 反向引用失败: {exc}")
        return success(data=payload)

    return bp
