"""Ontology Layer REST API。"""
from __future__ import annotations

from flask import Blueprint, request

from app.interfaces.api.middleware.auth import require_admin, require_auth
from app.shared.response import created, error, not_found, success


def create_ontology_blueprint(ontology_service, mapper_service=None, audit_repository=None, workbench_read_service=None, object_search_service=None):
    bp = Blueprint("ontology", __name__, url_prefix="/api/v1/ontology")

    def _entity_is_active(entity_type: str, entity_name: str) -> bool:
        return ontology_service.entity_status(entity_type, entity_name) == "active"

    def _push_issue(issues: list[str], message: str) -> None:
        if message not in issues:
            issues.append(message)

    def _resolve_entity(entity_type: str, entity_name: str):
        if entity_type == "objects":
            return ontology_service.get_object(entity_name)
        if entity_type == "properties":
            return ontology_service.get_property(entity_name)
        if entity_type == "metrics":
            return ontology_service.get_metric(entity_name)
        if entity_type == "relations":
            return ontology_service.get_relation(entity_name)
        if entity_type == "actions":
            return ontology_service.get_action(entity_name)
        if entity_type == "glossary":
            return ontology_service.get_glossary(entity_name)
        if entity_type == "policies":
            return ontology_service.get_policy(entity_name)
        raise ValueError(f"不支持的 Ontology 资产类型: {entity_type}")

    def _build_publish_validation(entity_type: str, entity_name: str):
        if mapper_service is None:
            return {"status": "skipped", "issues": ["当前未启用投影校验服务"]}
        issues: list[str] = []
        payload = {"entity_type": entity_type, "entity_name": entity_name}
        if entity_type == "metrics":
            metric = ontology_service.get_metric(entity_name)
            if metric is None:
                raise ValueError(f"未找到业务指标: {entity_name}")
            if not str(metric.get("semantic_formula") or "").strip():
                _push_issue(issues, "业务指标缺少语义公式，无法发布。")
            if not metric.get("measure_refs"):
                _push_issue(issues, "业务指标发布前至少关联一个 Measure 引用。")
            object_name = str(metric.get("object_name") or "").strip()
            if not object_name:
                _push_issue(issues, "业务指标缺少归属对象。")
            elif not _entity_is_active("objects", object_name):
                _push_issue(issues, f"业务指标归属的业务对象尚未发布: {object_name}")
            preview = mapper_service.preview(entity_type="metric", entity_name=entity_name)
            for issue in preview.get("consistency", {}).get("issues", []):
                _push_issue(issues, issue)
            return {
                **payload,
                "preview_status": preview.get("consistency", {}).get("status", "warning"),
                "issues": issues,
            }
        if entity_type == "objects":
            entity = ontology_service.get_object(entity_name)
            if entity is None:
                raise ValueError(f"未找到业务对象: {entity_name}")
            preview = mapper_service.preview(entity_type="object", entity_name=entity_name)
            for issue in preview.get("consistency", {}).get("issues", []):
                _push_issue(issues, issue)
            if not preview.get("projection", {}).get("targets"):
                _push_issue(issues, "业务对象尚未投影到任何分析实体。")
            return {
                **payload,
                "preview_status": preview.get("consistency", {}).get("status", "warning"),
                "issues": issues,
            }
        if entity_type == "properties":
            entity = ontology_service.get_property(entity_name)
            if entity is None:
                raise ValueError(f"未找到业务属性: {entity_name}")
            object_name = str(entity.get("object_name") or "").strip()
            if not object_name:
                _push_issue(issues, "业务属性缺少归属对象。")
            elif not _entity_is_active("objects", object_name):
                _push_issue(issues, f"业务属性归属的业务对象尚未发布: {object_name}")
            return {
                **payload,
                "preview_status": "ok" if not issues else "warning",
                "issues": issues,
            }
        if entity_type == "relations":
            entity = ontology_service.get_relation(entity_name)
            if entity is None:
                raise ValueError(f"未找到业务关系: {entity_name}")
            source_object_name = str(entity.get("source_object_name") or "").strip()
            target_object_name = str(entity.get("target_object_name") or "").strip()
            if not _entity_is_active("objects", source_object_name):
                _push_issue(issues, f"业务关系的源对象尚未发布: {source_object_name}")
            if not _entity_is_active("objects", target_object_name):
                _push_issue(issues, f"业务关系的目标对象尚未发布: {target_object_name}")
            preview = mapper_service.preview(entity_type="relation", entity_name=entity_name)
            for issue in preview.get("consistency", {}).get("issues", []):
                _push_issue(issues, issue)
            return {
                **payload,
                "preview_status": preview.get("consistency", {}).get("status", "warning"),
                "issues": issues,
            }
        if entity_type == "actions":
            entity = ontology_service.get_action(entity_name)
            if entity is None:
                raise ValueError(f"未找到业务动作: {entity_name}")
            object_name = str(entity.get("object_name") or "").strip()
            if not _entity_is_active("objects", object_name):
                _push_issue(issues, f"业务动作归属的业务对象尚未发布: {object_name}")
            trigger_time_property = str(entity.get("trigger_time_property") or "").strip()
            if trigger_time_property and not _entity_is_active("properties", trigger_time_property):
                _push_issue(issues, f"业务动作引用的时间属性尚未发布: {trigger_time_property}")
            if not entity.get("event_cube_refs"):
                _push_issue(issues, "业务动作发布前至少关联一个事件事实 Cube。")
            preview = mapper_service.preview(entity_type="action", entity_name=entity_name)
            for issue in preview.get("consistency", {}).get("issues", []):
                _push_issue(issues, issue)
            return {
                **payload,
                "preview_status": preview.get("consistency", {}).get("status", "warning"),
                "issues": issues,
            }
        if entity_type == "glossary":
            entity = ontology_service.get_glossary(entity_name)
            if entity is None:
                raise ValueError(f"未找到术语: {entity_name}")
            entry_type = str(entity.get("entry_type") or "term").strip()
            canonical_name = str(entity.get("canonical_name") or "").strip()
            type_mapping = {
                "object": "objects",
                "property": "properties",
                "metric": "metrics",
                "action": "actions",
                "relation": "relations",
            }
            if entry_type in type_mapping:
                linked_type = type_mapping[entry_type]
                linked_entity = _resolve_entity(linked_type, canonical_name)
                if linked_entity is None:
                    _push_issue(issues, f"术语引用的语义资产不存在: {entry_type}.{canonical_name}")
                elif not _entity_is_active(linked_type, canonical_name):
                    _push_issue(issues, f"术语引用的语义资产尚未发布: {entry_type}.{canonical_name}")
            return {
                **payload,
                "preview_status": "ok" if not issues else "warning",
                "issues": issues,
            }
        if entity_type == "policies":
            policy = ontology_service.get_policy(entity_name)
            if policy is None:
                raise ValueError(f"未找到语义权限: {entity_name}")
            target_type = str(policy.get("target_type") or "").strip()
            target_name = str(policy.get("target_name") or "").strip()
            target_mapping = {
                "object": "objects",
                "property": "properties",
                "metric": "metrics",
                "action": "actions",
            }
            mapped_target_type = target_mapping.get(target_type)
            if not mapped_target_type:
                _push_issue(issues, f"语义权限引用了不支持的目标类型: {target_type or '未提供'}")
            elif not _entity_is_active(mapped_target_type, target_name):
                _push_issue(issues, f"语义权限引用的目标尚未发布: {target_type}.{target_name}")
            if policy.get("visibility") in {"restricted", "private"} and not policy.get("allowed_roles"):
                _push_issue(issues, "受限或私有权限必须至少配置一个 allowed_roles。")
            impact = mapper_service.policy_impact(policy or {})
            for issue in impact.get("issues", []):
                _push_issue(issues, issue)
            return {
                **impact,
                **payload,
                "preview_status": impact.get("projection_status", "warning"),
                "issues": issues,
            }
        return {**payload, "status": "ready", "issues": issues}

    def _build_impact(entity_type: str, entity_name: str):
        if mapper_service is None:
            raise ValueError("当前未启用语义投影能力")
        if entity_type in {"objects", "metrics", "relations", "actions", "glossary"}:
            mapped_type = {
                "objects": "object",
                "metrics": "metric",
                "relations": "relation",
                "actions": "action",
                "glossary": "glossary",
            }[entity_type]
            preview = mapper_service.preview(entity_type=mapped_type, entity_name=entity_name)
            return {
                "entity_type": mapped_type,
                "entity_name": entity_name,
                "projection": preview.get("projection", {}),
                "consistency": preview.get("consistency", {}),
                "traceability": preview.get("traceability", {}),
            }
        if entity_type == "policies":
            entity = ontology_service.get_policy(entity_name)
            if entity is None:
                raise ValueError(f"未找到语义权限: {entity_name}")
            return mapper_service.policy_impact(entity)
        if entity_type == "properties":
            entity = ontology_service.get_property(entity_name)
            if entity is None:
                raise ValueError(f"未找到业务属性: {entity_name}")
            return {
                "entity_type": "property",
                "entity_name": entity_name,
                "projection": {"targets": []},
                "consistency": {
                    "status": "pending",
                    "issues": ["属性级影响分析尚未接入字段暴露执行链。"],
                },
                "traceability": {"property": entity},
            }
        raise ValueError(f"不支持的影响分析资产类型: {entity_type}")

    # B-back-6: lazy-init ObjectSearchService
    _obj_search_svc = object_search_service

    def _get_obj_search_svc():
        nonlocal _obj_search_svc
        if _obj_search_svc is None:
            from app.application.ontology.object_search_service import ObjectSearchService
            _obj_search_svc = ObjectSearchService(ontology_service=ontology_service)
        return _obj_search_svc

    @bp.route("/objects", methods=["GET"])
    @require_auth
    def list_objects():
        """GET /api/v1/ontology/objects

        B-back-6 扩展参数：
          q     — 模糊搜索关键词（ILIKE 风格，大小写不敏感）
          field — 搜索字段，可多值（name/description/metric_name/title/aliases），默认 name
        """
        q = (request.args.get("q") or "").strip()
        # 支持多值：?field=name&field=description
        fields = request.args.getlist("field") or ["name"]

        if q or fields != ["name"]:
            # 有搜索意图时走搜索路径
            from flask import g
            user_key = getattr(g, "user_id", None) or request.remote_addr or "anonymous"
            try:
                page = int(request.args.get("page") or 1)
                page_size = int(request.args.get("page_size") or 20)
                result = _get_obj_search_svc().search(
                    q=q,
                    fields=fields,
                    user_key=str(user_key),
                    page=page,
                    page_size=page_size,
                )
            except PermissionError as exc:
                return error(str(exc), status=429)
            except ValueError as exc:
                return error(str(exc), status=400)
            except Exception as exc:
                return error(f"搜索业务对象失败: {exc}")
            return success(data=result)

        return success(data=ontology_service.list_objects())

    @bp.route("/workbench/objects", methods=["GET"])
    @require_auth
    def list_workbench_objects():
        if workbench_read_service is None:
            return error("当前未启用 OWV2 工作台读模型")
        try:
            payload = workbench_read_service.list_objects()
        except Exception as exc:
            return error(f"查询 OWV2 对象列表失败: {exc}")
        return success(data=payload)

    @bp.route("/workbench/objects/<name>/overview", methods=["GET"])
    @require_auth
    def get_workbench_object_overview(name: str):
        if workbench_read_service is None:
            return error("当前未启用 OWV2 工作台读模型")
        try:
            payload = workbench_read_service.get_object_overview(name)
        except Exception as exc:
            return error(f"查询 OWV2 对象详情失败: {exc}")
        if payload is None:
            return not_found("未找到业务对象")
        return success(data=payload)

    @bp.route("/workbench/governance", methods=["GET"])
    @require_auth
    def get_workbench_governance():
        if workbench_read_service is None:
            return error("当前未启用 OWV2 工作台读模型")
        try:
            payload = workbench_read_service.get_governance_summary()
        except Exception as exc:
            return error(f"查询 OWV2 规则与治理摘要失败: {exc}")
        return success(data=payload)

    @bp.route("/objects/<name>", methods=["GET"])
    @require_auth
    def get_object(name: str):
        entity = ontology_service.get_object(name)
        if entity is None:
            return not_found("未找到业务对象")
        return success(data=entity)

    @bp.route("/objects", methods=["POST"])
    @require_admin
    def create_object():
        try:
            entity = ontology_service.save_object(request.get_json(silent=True) or {})
        except Exception as exc:
            return error(f"创建业务对象失败: {exc}")
        return created(data=entity)

    @bp.route("/properties", methods=["GET"])
    @require_auth
    def list_properties():
        return success(data=ontology_service.list_properties())

    @bp.route("/properties/<name>", methods=["GET"])
    @require_auth
    def get_property(name: str):
        entity = ontology_service.get_property(name)
        if entity is None:
            return not_found("未找到业务属性")
        return success(data=entity)

    @bp.route("/properties", methods=["POST"])
    @require_admin
    def create_property():
        try:
            entity = ontology_service.save_property(request.get_json(silent=True) or {})
        except Exception as exc:
            return error(f"创建业务属性失败: {exc}")
        return created(data=entity)

    @bp.route("/metrics", methods=["GET"])
    @require_auth
    def list_metrics():
        return success(data=ontology_service.list_metrics())

    @bp.route("/metrics/<name>", methods=["GET"])
    @require_auth
    def get_metric(name: str):
        entity = ontology_service.get_metric(name)
        if entity is None:
            return not_found("未找到业务指标")
        return success(data=entity)

    @bp.route("/metrics/<name>/links", methods=["GET"])
    @require_auth
    def get_metric_links(name: str):
        if mapper_service is None:
            return error("当前未启用业务指标追踪能力")
        try:
            payload = mapper_service.metric_links(name)
        except Exception as exc:
            return error(f"查询业务指标关联分析对象失败: {exc}")
        return success(data=payload)

    @bp.route("/metrics", methods=["POST"])
    @require_admin
    def create_metric():
        try:
            entity = ontology_service.save_metric(request.get_json(silent=True) or {})
        except Exception as exc:
            return error(f"创建业务指标失败: {exc}")
        return created(data=entity)

    @bp.route("/glossary", methods=["GET"])
    @require_auth
    def list_glossary():
        return success(data=ontology_service.list_glossary())

    @bp.route("/glossary/<canonical_name>", methods=["GET"])
    @require_auth
    def get_glossary(canonical_name: str):
        entity = ontology_service.get_glossary(canonical_name)
        if entity is None:
            return not_found("未找到术语")
        return success(data=entity)

    @bp.route("/glossary", methods=["POST"])
    @require_admin
    def create_glossary():
        try:
            entity = ontology_service.save_glossary(request.get_json(silent=True) or {})
        except Exception as exc:
            return error(f"创建术语失败: {exc}")
        return created(data=entity)

    @bp.route("/relations", methods=["GET"])
    @require_auth
    def list_relations():
        return success(data=ontology_service.list_relations())

    @bp.route("/relations/<name>", methods=["GET"])
    @require_auth
    def get_relation(name: str):
        entity = ontology_service.get_relation(name)
        if entity is None:
            return not_found("未找到业务关系")
        return success(data=entity)

    @bp.route("/relations", methods=["POST"])
    @require_admin
    def create_relation():
        try:
            entity = ontology_service.save_relation(request.get_json(silent=True) or {})
        except Exception as exc:
            return error(f"创建业务关系失败: {exc}")
        return created(data=entity)

    @bp.route("/actions", methods=["GET"])
    @require_auth
    def list_actions():
        return success(data=ontology_service.list_actions())

    @bp.route("/actions/<name>", methods=["GET"])
    @require_auth
    def get_action(name: str):
        entity = ontology_service.get_action(name)
        if entity is None:
            return not_found("未找到业务动作")
        return success(data=entity)

    @bp.route("/actions", methods=["POST"])
    @require_admin
    def create_action():
        try:
            entity = ontology_service.save_action(request.get_json(silent=True) or {})
        except Exception as exc:
            return error(f"创建业务动作失败: {exc}")
        return created(data=entity)

    @bp.route("/policies", methods=["GET"])
    @require_auth
    def list_policies():
        return success(data=ontology_service.list_policies())

    @bp.route("/policies/<name>", methods=["GET"])
    @require_auth
    def get_policy(name: str):
        entity = ontology_service.get_policy(name)
        if entity is None:
            return not_found("未找到语义权限")
        return success(data=entity)

    @bp.route("/policies/<name>/impact", methods=["GET"])
    @require_auth
    def get_policy_impact(name: str):
        entity = ontology_service.get_policy(name)
        if entity is None:
            return not_found("未找到语义权限")
        if mapper_service is None:
            return error("当前未启用语义权限影响分析能力")
        try:
            payload = mapper_service.policy_impact(entity)
        except Exception as exc:
            return error(f"查询语义权限影响范围失败: {exc}")
        return success(data=payload)

    @bp.route("/policies/<name>/audit", methods=["GET"])
    @require_auth
    def get_policy_audit(name: str):
        entity = ontology_service.get_policy(name)
        if entity is None:
            return not_found("未找到语义权限")
        if audit_repository is None:
            return error("当前未启用语义权限审计能力")
        target_type = (request.args.get("target_type") or "").strip() or None
        target_name = (request.args.get("target_name") or "").strip() or None
        decision = (request.args.get("decision") or "").strip() or None
        route_type = (request.args.get("route_type") or "").strip() or None
        items = [
            item.model_dump(mode="json")
            for item in audit_repository.list_filtered(
                policy_name=name,
                target_type=target_type,
                target_name=target_name,
                decision=decision,
                route_type=route_type,
            )
        ]
        return success(
            data={
                "policy_name": name,
                "items": items,
                "total": len(items),
            }
        )

    @bp.route("/policies", methods=["POST"])
    @require_admin
    def create_policy():
        try:
            entity = ontology_service.save_policy(request.get_json(silent=True) or {})
        except Exception as exc:
            return error(f"创建语义权限失败: {exc}")
        return created(data=entity)

    @bp.route("/templates/<template_name>", methods=["GET"])
    @require_auth
    def get_template(template_name: str):
        try:
            payload = ontology_service.get_template(template_name)
        except Exception as exc:
            return error(f"查询 Ontology 模板失败: {exc}")
        return success(data=payload)

    @bp.route("/templates/<template_name>/apply", methods=["POST"])
    @require_admin
    def apply_template(template_name: str):
        try:
            payload = ontology_service.apply_template(template_name)
        except Exception as exc:
            return error(f"应用 Ontology 模板失败: {exc}")
        return success(data=payload)

    @bp.route("/<entity_type>/<entity_name>/publish", methods=["POST"])
    @require_admin
    def publish_entity(entity_type: str, entity_name: str):
        try:
            entity = _resolve_entity(entity_type, entity_name)
        except ValueError as exc:
            return error(str(exc))
        if entity is None:
            return not_found("未找到要发布的 Ontology 资产")
        try:
            validation = _build_publish_validation(entity_type, entity_name)
            published = ontology_service.publish_entity(entity_type, entity_name, validation=validation)
        except Exception as exc:
            return error(f"发布 Ontology 资产失败: {exc}")
        return success(data={"entity": published, "validation": validation})

    @bp.route("/<entity_type>/<entity_name>/impact", methods=["GET"])
    @require_auth
    def get_entity_impact(entity_type: str, entity_name: str):
        try:
            entity = _resolve_entity(entity_type, entity_name)
        except ValueError as exc:
            return error(str(exc))
        if entity is None:
            return not_found("未找到 Ontology 资产")
        try:
            payload = _build_impact(entity_type, entity_name)
        except Exception as exc:
            return error(f"查询 Ontology 资产影响范围失败: {exc}")
        return success(data=payload)

    @bp.route("/<entity_type>/<entity_name>/history", methods=["GET"])
    @require_auth
    def get_entity_history(entity_type: str, entity_name: str):
        try:
            entity = _resolve_entity(entity_type, entity_name)
        except ValueError as exc:
            return error(str(exc))
        if entity is None:
            return not_found("未找到 Ontology 资产")
        try:
            payload = ontology_service.history(entity_type, entity_name)
        except Exception as exc:
            return error(f"查询 Ontology 资产历史失败: {exc}")
        return success(data=payload)

    return bp
