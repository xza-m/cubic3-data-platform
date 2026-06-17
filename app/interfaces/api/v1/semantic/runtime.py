"""语义层 API · 健康检查 / DSL 编译查询 / 文件 / 治理 / 诊断路由。"""
import os
from datetime import datetime, timezone

from flask import current_app, g, request

from app.interfaces.api.middleware.auth import require_admin, require_auth
from app.shared.response import success, error, not_found, created
from ._shared import logger, _json_scalar, _extract_view_cube_name


def _semantic_base():
    """经包属性解析，保证单测对 ``semantic_api._semantic_base`` 的 monkeypatch 生效。"""
    from app.interfaces.api.v1 import semantic as _semantic_pkg

    return _semantic_pkg._semantic_base()


def register_runtime_routes(bp, ctx):
    semantic_service = ctx.semantic_service
    domain_modeling_service = ctx.domain_modeling_service
    runtime_snapshot_service = ctx.runtime_snapshot_service
    _resolve_query_adapter = ctx._resolve_query_adapter
    _build_schema_report = ctx._build_schema_report
    _build_mapper_stale_payload = ctx._build_mapper_stale_payload
    _build_data_asset_summary_payload = ctx._build_data_asset_summary_payload

    @bp.route('/health', methods=['GET'])
    @require_auth
    def semantic_health():
        """语义 Runtime 健康检查"""
        if runtime_snapshot_service is None:
            return success(
                data={
                    "status": "degraded",
                    "runtime": {
                        "manifest_status": "not_configured",
                        "error_code": "semantic_runtime_snapshot_service_not_configured",
                    },
                }
            )
        try:
            manifest = runtime_snapshot_service.get_active_manifest("default")
        except Exception as exc:
            logger.exception("semantic_health_check_failed", error=str(exc))
            return success(
                data={
                    "status": "unhealthy",
                    "runtime": {
                        "manifest_status": "error",
                        "error_code": "semantic_runtime_health_check_failed",
                        "reason": str(exc),
                    },
                }
            )

        runtime_ok = bool(manifest.get("ok"))
        version_pin = manifest.get("version_pin") or {}
        asset_trace = manifest.get("asset_trace") or []
        binding_trace = manifest.get("binding_trace") or {}
        policy_trace = manifest.get("policy_trace") or {}
        return success(
            data={
                "status": "healthy" if runtime_ok else "unhealthy",
                "runtime": {
                    "manifest_status": "ready" if runtime_ok else "blocked",
                    "error_code": manifest.get("error_code"),
                    "version_pin": version_pin,
                    "asset_count": len(asset_trace) if asset_trace else version_pin.get("asset_count", 0),
                    "binding_count": binding_trace.get("count", 0),
                    "policy_count": policy_trace.get("count", 0),
                },
            }
        )

    # ── DSL 编译预览 ──

    def _safe_definition_hash(cube_name):
        """容忍测试桩 semantic_service 缺少 definition_hash 方法。"""
        hash_fn = getattr(semantic_service, "definition_hash", None)
        if not callable(hash_fn):
            return None
        try:
            value = hash_fn(cube_name)
        except Exception:
            return None
        return value if isinstance(value, str) else None

    @bp.route('/compile', methods=['POST'])
    @require_auth
    def compile_dsl():
        body = request.get_json(silent=True)
        if not body or "dsl" not in body:
            return error("请求体必须包含 'dsl' 字段", details={"error_code": "dsl_validate_error"})

        from pydantic import ValidationError as PydanticValidationError
        from app.domain.semantic.compiler import CompilationError

        try:
            result = semantic_service.compile_query(body["dsl"])
            return success(data={
                "sql": result.sql,
                "primary_cube": result.primary_cube,
                "joined_cubes": result.joined_cubes,
                "definition_hash": _safe_definition_hash(result.primary_cube),
            })
        except PydanticValidationError as e:
            return error(f"编译失败: {str(e)}", details={"error_code": "dsl_validate_error"})
        except CompilationError as e:
            return error(f"编译失败: {str(e)}", details={"error_code": "compile_error"})
        except Exception as e:
            return error(f"编译失败: {str(e)}", details={"error_code": "internal_error"})

    @bp.route('/query', methods=['POST'])
    @require_auth
    def query_dsl():
        body = request.get_json(silent=True)
        if not body or "dsl" not in body:
            return error("请求体必须包含 'dsl' 字段")

        adapter, _database = _resolve_query_adapter()
        result = semantic_service.query(body["dsl"], adapter=adapter)
        if "error" in result:
            return error(result["error"], details=result)
        return success(data=result)

    # ── 关系图 ──

    @bp.route('/graph', methods=['GET'])
    @require_auth
    def get_graph():
        """返回关系图数据（nodes + edges），供 React Flow 渲染"""
        cube_summaries = {
            item["name"]: item
            for item in semantic_service.list_cubes()
        }
        cubes = semantic_service._cube_repo.list_all()

        nodes = []
        edges = []
        for cube in cubes:
            is_fact = len(cube.measures) > 2
            summary = cube_summaries.get(cube.name, {})
            state_summary = summary.get("state_summary", {}) if isinstance(summary, dict) else {}
            if not isinstance(state_summary, dict):
                state_summary = {}
            nodes.append({
                "id": cube.name,
                "title": cube.title,
                "type": "fact" if is_fact else "dimension",
                "dimensions": len(cube.dimensions),
                "measures": len(cube.measures),
                "status": _json_scalar(getattr(cube, "status", None)),
                "source_id": _json_scalar(getattr(cube, "source_id", None)),
                "source_database": _json_scalar(getattr(cube, "source_database", None)),
                "source_schema": _json_scalar(getattr(cube, "source_schema", None)),
                "source_binding_summary": state_summary.get("source_binding_summary"),
                "state_summary": state_summary,
            })
            for alias, j in cube.joins.items():
                edges.append({
                    "source": cube.name,
                    "target": j.cube,
                    "relationship": getattr(j, 'relationship', 'N:1'),
                    "join_type": j.type,
                    "sql": j.sql.replace("{CUBE}", cube.name).replace(f"{{{j.cube}}}", j.cube),
                })

        return success(data={"nodes": nodes, "edges": edges})

    # ── 文件管理 ──

    @bp.route('/files', methods=['GET'])
    @require_auth
    def list_files():
        """列出所有 Cube/View YAML 文件"""
        base = _semantic_base()
        result = {"cubes": [], "views": [], "recipes": [], "domains": []}
        for kind in ("cubes", "views", "recipes", "domains"):
            kind_dir = os.path.join(base, kind)
            if os.path.isdir(kind_dir):
                for f in sorted(os.listdir(kind_dir)):
                    if f.endswith(('.yml', '.yaml')):
                        name = f.rsplit('.', 1)[0]
                        if kind == "domains" and name.startswith("domain_"):
                            name = name[len("domain_"):]
                        result[kind].append(name)
        return success(data=result)

    @bp.route('/files/<file_type>/<name>', methods=['GET'])
    @require_auth
    def read_file(file_type, name):
        """读取 YAML 文件原始内容"""
        if file_type not in ('cubes', 'views', 'recipes', 'domains'):
            return error(f"不支持的文件类型: {file_type}")

        base = _semantic_base()
        filename = f"domain_{name}.yml" if file_type == "domains" else f"{name}.yml"
        fpath = os.path.join(base, file_type, filename)
        if not os.path.isfile(fpath):
            alt_name = f"domain_{name}.yaml" if file_type == "domains" else f"{name}.yaml"
            fpath = os.path.join(base, file_type, alt_name)
        if not os.path.isfile(fpath):
            return not_found(f"文件不存在: {file_type}/{name}")

        with open(fpath, 'r', encoding='utf-8') as fp:
            content = fp.read()
        return success(data={"name": name, "type": file_type, "content": content})

    @bp.route('/files/<file_type>/<name>', methods=['PUT'])
    @require_admin
    def write_file(file_type, name):
        """更新 YAML 文件"""
        if file_type not in ('cubes', 'views', 'recipes', 'domains'):
            return error(f"不支持的文件类型: {file_type}")

        body = request.get_json(silent=True)
        if not body or "content" not in body:
            return error("请求体必须包含 'content' 字段")

        base = _semantic_base()
        filename = f"domain_{name}.yml" if file_type == "domains" else f"{name}.yml"
        fpath = os.path.join(base, file_type, filename)

        try:
            import yaml
            yaml.safe_load(body["content"])
        except Exception as e:
            return error(f"YAML 语法错误: {str(e)}")

        with open(fpath, 'w', encoding='utf-8') as fp:
            fp.write(body["content"])

        semantic_service.invalidate_cache()
        if file_type == "domains":
            domain_modeling_service._domain_repo.reload()

        return success(data={"message": f"已保存 {file_type}/{filename}"})

    @bp.route('/files/<file_type>/<name>/validate', methods=['POST'])
    @require_auth
    def validate_file(file_type, name):
        """校验 YAML 内容合法性"""
        body = request.get_json(silent=True)
        if not body or "content" not in body:
            return error("请求体必须包含 'content' 字段")

        diagnostics = []
        try:
            import yaml
            parsed = yaml.safe_load(body["content"])
            diagnostics.append({"level": "ok", "message": "YAML 语法正确"})

            if file_type == "cubes":
                from app.domain.semantic.entities import CubeDefinition
                cube = CubeDefinition(**parsed)
                diagnostics.append({"level": "ok", "message": "Cube Schema 校验通过"})
                diagnostics.extend(semantic_service.validate_cube(cube))
            elif file_type == "views":
                from app.domain.semantic.entities import ViewDefinition
                view = ViewDefinition(**parsed)
                diagnostics.append({"level": "ok", "message": "View Schema 校验通过"})
                diagnostics.extend(semantic_service.validate_view(view))
            elif file_type == "domains":
                from app.domain.semantic.entities import DomainDefinition
                domain = DomainDefinition(**parsed)
                diagnostics.append({"level": "ok", "message": "Domain Schema 校验通过"})
                diagnostics.extend(domain_modeling_service.validate_domain(domain))
        except Exception as e:
            diagnostics.append({"level": "error", "message": str(e)})

        has_error = any(d["level"] == "error" for d in diagnostics)
        return success(data={"valid": not has_error, "diagnostics": diagnostics})

    # ── Schema Sync ──

    @bp.route('/governance/issues', methods=['GET'])
    @require_admin
    def governance_issues():
        """返回语义治理问题聚合结果。"""
        cube_name = (request.args.get("cube_name") or "").strip() or None
        schema_source = (request.args.get("schema_source") or "").strip() or None
        from app.application.semantic.governance_issue_service import SemanticGovernanceIssueService

        schema_report = _build_schema_report(cube_name, schema_source=schema_source)
        mapper_stale_payload = _build_mapper_stale_payload()
        data_asset_summary = _build_data_asset_summary_payload()
        payload = SemanticGovernanceIssueService().build_payload(
            schema_report=schema_report,
            mapper_stale_payload=mapper_stale_payload,
            data_asset_summary=data_asset_summary,
        )
        return success(data=payload)

    @bp.route('/schema-sync', methods=['POST'])
    @require_admin
    def schema_sync():
        """触发 Schema Drift 检测 + 可选飞书 webhook 通知

        Body:
            cube_name (str, optional): 仅检测指定 Cube
            notify (bool): 是否推送飞书通知
            webhook_url (str): 飞书 Webhook 地址（notify=true 时必填）
        """
        body = request.get_json(silent=True) or {}
        cube_name = body.get("cube_name")
        notify = body.get("notify", False)
        webhook_url = body.get("webhook_url", "")

        report = _build_schema_report(cube_name)

        report_dict = report.to_dict()
        report_dict["checked_at"] = datetime.now(timezone.utc).isoformat()

        if notify and report.has_drifts and webhook_url:
            from app.infrastructure.notification.feishu_webhook import FeishuWebhookNotifier
            notifier = FeishuWebhookNotifier(webhook_url=webhook_url)
            notifier.send_schema_drift_report(
                total_cubes=report_dict["total_cubes"],
                checked_cubes=report_dict["checked_cubes"],
                skipped_cubes=report_dict["skipped_cubes"],
                drifts=report_dict["drifts"],
            )
            report_dict["notified"] = True

        return success(data=report_dict)

    # ── B-back-9: Diagnose + DiagnoseRuns ────────────────────────────────────
    # 导入实体确保 SQLAlchemy 元数据注册
    from app.domain.semantic.diagnose_run import DiagnoseRun  # noqa

    @bp.route('/diagnose', methods=['POST'])
    @require_auth
    def diagnose():
        """
        POST /api/v1/semantic/diagnose — 同步诊断并落库（B-back-9）

        Body:
            input_kind (str): nl | sql | yaml
            input_text (str): 诊断内容
        """
        from flask import g
        from app.application.semantic.diagnose_run_service import DiagnoseRunService

        body = request.get_json(silent=True) or {}
        input_kind = body.get('input_kind', 'sql')
        input_text = body.get('input_text', '')

        if not input_text:
            return error('input_text 不能为空')

        user_id = g.get('user_id', 0)
        svc = DiagnoseRunService(semantic_service=semantic_service)
        try:
            result = svc.diagnose_and_record(
                user_id=user_id,
                input_kind=input_kind,
                input_text=input_text,
            )
            return success(data=result)
        except ValueError as exc:
            return error(str(exc))
        except Exception as exc:
            logger.error(f"diagnose failed: {exc}", exc_info=True)
            return error(f'诊断失败: {exc}', status=500)

    @bp.route('/diagnose/runs', methods=['GET'])
    @require_auth
    def list_diagnose_runs():
        """GET /api/v1/semantic/diagnose/runs — 分页列表（B-back-9）"""
        from flask import g
        from app.application.semantic.diagnose_run_service import DiagnoseRunService

        user_id = g.get('user_id', None)
        svc = DiagnoseRunService()
        try:
            result = svc.list(
                user_id=user_id,
                page=request.args.get('page', 1, type=int),
                page_size=request.args.get('page_size', 20, type=int),
            )
            return success(data=result)
        except Exception as exc:
            logger.error(f"list_diagnose_runs failed: {exc}", exc_info=True)
            return error(f'获取诊断历史失败: {exc}', status=500)

    @bp.route('/diagnose/runs/<int:run_id>', methods=['GET'])
    @require_auth
    def get_diagnose_run(run_id):
        """GET /api/v1/semantic/diagnose/runs/:id — 详情（B-back-9）"""
        from app.application.semantic.diagnose_run_service import DiagnoseRunService
        from app.shared.exceptions import EntityNotFoundError

        svc = DiagnoseRunService()
        try:
            result = svc.get(run_id)
            return success(data=result)
        except EntityNotFoundError as exc:
            return not_found(message=str(exc))
        except Exception as exc:
            logger.error(f"get_diagnose_run failed: {exc}", exc_info=True)
            return error(f'获取诊断详情失败: {exc}', status=500)
