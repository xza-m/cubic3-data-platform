"""语义层 API · Cube 建模与字段候选路由。"""
import os
from datetime import datetime, timezone

from flask import current_app, g, request

from app.interfaces.api.middleware.auth import require_admin, require_auth
from app.shared.response import success, error, not_found, created
from ._shared import logger, _json_scalar, _extract_view_cube_name


def register_cube_routes(bp, ctx):
    semantic_service = ctx.semantic_service
    modeling_service = ctx.modeling_service
    modeling_source_service = ctx.modeling_source_service
    field_candidate_service = ctx.field_candidate_service
    runtime_snapshot_service = getattr(ctx, "runtime_snapshot_service", None)
    _contains_keyword = ctx._contains_keyword
    _build_list_payload = ctx._build_list_payload
    _get_cube_listing_service = ctx._get_cube_listing_service

    def _cubes_from_active_manifest():
        """D2（Phase 8）discovery 同源：cube 列表从 active manifest 出，与 grounding 命中范围一致。

        返回 None 表示无 active 快照或无可用 runtime_snapshot_service → 由调用方回落 registry。
        manifest 优先、registry 兜底；无快照不 500，保持现有行为（现有 cube 列表测试为回落护栏）。

        牵连面收窄（CONTEXT D2）：manifest 侧只含已发布 cube 的结构定义，
        registry 派生字段（domain projection / state_summary / sync_status / last_modified_at 等）
        无来源，以安全缺省置空，并附 source="active_manifest" 来源标记。
        前端列表只读 name/title/description/domain_name/计数，缺省置空不破坏结构。
        """
        if runtime_snapshot_service is None:
            return None
        try:
            manifest = runtime_snapshot_service.get_active_manifest("default")
        except Exception:
            logger.warning("cube_discovery_active_manifest_failed", exc_info=True)
            return None
        if not isinstance(manifest, dict) or not manifest.get("ok"):
            return None
        from app.application.semantic.runtime_manifest_catalog import RuntimeSemanticCatalog

        try:
            catalog = RuntimeSemanticCatalog.from_manifest(manifest)
            cubes = catalog.list_entities("cube")
        except Exception:
            logger.warning("cube_discovery_manifest_catalog_failed", exc_info=True)
            return None
        payload = []
        for cube in cubes:
            dimensions = getattr(cube, "dimensions", {}) or {}
            measures = getattr(cube, "measures", {}) or {}
            joins = getattr(cube, "joins", {}) or {}
            payload.append({
                "name": cube.name,
                "title": getattr(cube, "title", None) or cube.name,
                "description": getattr(cube, "description", "") or "",
                "table": getattr(cube, "table", None),
                "dimensions": list(dimensions.keys()),
                "measures": list(measures.keys()),
                "dimension_count": len(dimensions),
                "measure_count": len(measures),
                "join_count": len(joins),
                "status": getattr(cube, "status", "active"),
                # registry 派生字段无 manifest 来源 → 安全缺省（不破坏前端列表结构）
                "domain_id": None,
                "domain_name": None,
                "domain_ids": [],
                "domains": [],
                "domain_count": 0,
                "source_id": getattr(cube, "source_id", None),
                "source_database": getattr(cube, "source_database", None),
                "source_schema": getattr(cube, "source_schema", None),
                "sync_status": None,
                "state_summary": {},
                "downstream_bi_count": 0,
                "last_modified_at": None,
                # discovery 同源来源标记：该 cube 来自 active manifest（已发布、可被 grounding 命中）
                "source": "active_manifest",
            })
        return payload

    # ── Cubes ──

    @bp.route('/cubes', methods=['GET'])
    @require_auth
    def list_cubes():
        # D2：discovery 与 grounding 同源 —— 优先读 active manifest（已发布 cube）；
        # 无 active 快照 / 无 runtime_snapshot_service → 回落 registry（保持现有行为，不 500）。
        cubes = _cubes_from_active_manifest()
        if cubes is None:
            try:
                cubes = _get_cube_listing_service().list_cubes_with_derivatives()
            except Exception:
                cubes = semantic_service.list_cubes()
        keyword = (request.args.get("q") or "").strip()
        filtered = [
            cube for cube in cubes
            if _contains_keyword(cube, keyword, ["name", "title", "description", "domain_name"])
        ]
        filtered.sort(key=lambda item: ((item.get("title") or item.get("name") or "").lower(), item.get("name") or ""))
        return success(data=_build_list_payload(filtered, "cubes"))

    @bp.route('/cubes/<cube_name>', methods=['GET'])
    @require_auth
    def describe_cube(cube_name):
        result = semantic_service.describe_cube(cube_name)
        if "error" in result:
            return not_found(result["error"])
        return success(data=result)

    @bp.route('/cubes/draft-from-source', methods=['POST'])
    @require_admin
    def draft_cube_from_source():
        body = request.get_json(silent=True) or {}
        source_kind = body.get("source_kind")
        if not source_kind:
            return error("请求体缺少必填字段: source_kind")
        try:
            result = modeling_source_service.generate_cube_draft_from_source(
                source_kind=source_kind,
                source_id=body.get("source_id"),
                dataset_id=body.get("dataset_id"),
                database=body.get("database"),
                schema=body.get("schema"),
                table=body.get("table"),
                name=body.get("name"),
                title=body.get("title"),
                description=body.get("description"),
            )
        except Exception as exc:
            return error(f"生成 Cube 草稿失败: {str(exc)}")
        return success(data=result)

    @bp.route('/field-candidates/preview', methods=['POST'])
    @require_admin
    def preview_field_candidates():
        body = request.get_json(silent=True) or {}
        columns = body.get("columns")
        if not isinstance(columns, list):
            return error("请求体字段 columns 必须是 list")
        try:
            result = field_candidate_service.preview_from_columns(
                source=body.get("source") or {},
                columns=columns,
                selected_overrides=body.get("selected_overrides") or {},
            )
        except Exception as exc:
            return error(f"字段候选预览失败: {str(exc)}")
        return success(data=result.to_dict())

    @bp.route('/cubes/draft-from-candidates', methods=['POST'])
    @require_admin
    def draft_cube_from_candidates():
        body = request.get_json(silent=True) or {}
        builder = getattr(modeling_service, "build_cube_draft_from_inline_candidate_payload", None)
        if not callable(builder):
            return error("当前 modeling_service 不支持 draft-from-candidates")
        try:
            result = builder(body)
        except Exception as exc:
            return error(f"基于字段候选生成 Cube 草稿失败: {str(exc)}")
        return success(data=result)

    @bp.route('/cubes', methods=['POST'])
    @require_admin
    def create_cube():
        body = request.get_json(silent=True) or {}
        try:
            cube = modeling_service.create_cube(body)
        except Exception as exc:
            return error(f"创建 Cube 失败: {str(exc)}")
        return created(data=cube.model_dump(mode="json"))

    @bp.route('/cubes/<cube_name>', methods=['PUT'])
    @require_admin
    def update_cube(cube_name):
        body = request.get_json(silent=True) or {}
        try:
            cube = modeling_service.update_cube(cube_name, body)
        except Exception as exc:
            if "未找到 Cube" in str(exc):
                return not_found(str(exc))
            return error(f"更新 Cube 失败: {str(exc)}")
        return success(data=cube.model_dump(mode="json"))

    @bp.route('/cubes/<cube_name>/activate', methods=['POST'])
    @require_admin
    def activate_cube(cube_name):
        try:
            cube = modeling_service.activate_cube(cube_name)
        except Exception as exc:
            if "未找到 Cube" in str(exc):
                return not_found(str(exc))
            return error(f"激活 Cube 失败: {str(exc)}")
        return success(data=cube.model_dump(mode="json"))

    @bp.route('/cubes/<cube_name>/revisions', methods=['POST'])
    @require_admin
    def create_cube_revision(cube_name):
        try:
            cube = modeling_service.create_revision_draft(cube_name)
        except Exception as exc:
            if "未找到 Cube" in str(exc):
                return not_found(str(exc))
            return error(f"发起修订失败: {str(exc)}")
        return created(data=cube.model_dump(mode="json"))

    @bp.route('/cubes/<cube_name>/deprecate', methods=['POST'])
    @require_admin
    def deprecate_cube(cube_name):
        try:
            cube = modeling_service.deprecate_cube(cube_name)
        except Exception as exc:
            if "未找到 Cube" in str(exc):
                return not_found(str(exc))
            return error(f"弃用 Cube 失败: {str(exc)}")
        return success(data=cube.model_dump(mode="json"))

    @bp.route('/cubes/<cube_name>/validate-fields', methods=['POST'])
    @require_auth
    def validate_cube_fields(cube_name):
        """
        字段级校验（B-4）

        返回: ``{ ok: bool, issues: [{ field, code, message, severity }] }``
        """
        cube = semantic_service._cube_repo.get(cube_name)
        if cube is None:
            return not_found(f"未找到 Cube: {cube_name}")

        diagnostics = semantic_service.validate_cube(cube) or []

        level_to_severity = {
            "error": "error",
            "warn": "warning",
            "warning": "warning",
            "info": "info",
            "ok": "info",
        }

        issues = []
        for item in diagnostics:
            level = (item.get("level") or "info").lower()
            if level == "ok":
                continue
            issues.append({
                "field": item.get("field") or cube_name,
                "code": item.get("kind") or "VALIDATION",
                "message": item.get("message") or "",
                "severity": level_to_severity.get(level, "info"),
            })

        has_error = any(issue["severity"] == "error" for issue in issues)
        return success(data={"ok": not has_error, "issues": issues})

    @bp.route('/metrics/dry-run', methods=['POST'])
    @require_auth
    def dry_run_metric():
        """
        指标公式 dry-run（B-5）

        请求体: ``{ name: str, formula: str }``
        响应: ``{ sql_preview: str, sample_rows: [], errors: [] }``

        实现说明：
        - 当前不执行真实查询，只做最小可用的 SQL 预览合成。
        - 如传入 measures 可识别，则用 ``semantic_service.compile_query`` 编译；
          否则基于 formula 生成轻量包装 SQL，并附上 diagnostics。
        """
        body = request.get_json(silent=True) or {}
        name = (body.get("name") or "").strip()
        formula = (body.get("formula") or "").strip()

        errors = []
        if not formula:
            errors.append({"code": "EMPTY_FORMULA", "message": "公式不能为空"})
            return success(data={"sql_preview": "", "sample_rows": [], "errors": errors})

        sql_preview: str = ""
        sample_rows: list = []

        # 1) 若 name 存在且能解析为某个 cube.measure —— 用编译器生成 SQL
        compiled = False
        try:
            all_cubes = semantic_service._cube_repo.list_all()
            matched_cube = None
            measure_name = name
            for cube in all_cubes:
                if name in (cube.measures or {}):
                    matched_cube = cube
                    break

            if matched_cube is not None:
                dsl = {
                    "cube": matched_cube.name,
                    "measures": [measure_name],
                    "limit": 10,
                }
                compile_result = semantic_service.compile_query(dsl)
                sql_preview = compile_result.sql
                compiled = True
        except Exception as exc:
            errors.append({
                "code": "COMPILE_FAILED",
                "message": f"编译指标失败: {exc}",
            })

        # 2) 兜底：如果无法编译，合成一个"把 formula 包装为 SELECT" 的预览
        if not compiled:
            safe_formula = formula.replace("\n", " ").strip()
            sql_preview = (
                f"-- dry-run preview for metric: {name or '(anonymous)'}\n"
                f"SELECT ({safe_formula}) AS metric_value\n"
                f"FROM <cube>\n"
                f"LIMIT 10;"
            )

        return success(data={
            "sql_preview": sql_preview,
            "sample_rows": sample_rows,
            "errors": errors,
        })
