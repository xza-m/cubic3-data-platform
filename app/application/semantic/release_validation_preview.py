"""语义建设发布前只读校验预演服务。"""
from __future__ import annotations

from copy import deepcopy
from typing import Any, Callable, Iterable

from app.domain.semantic.asset_registry import RUNTIME_MANIFEST_SCHEMA_VERSION


SEMANTIC_COMPILE_NOT_CONFIGURED = {
    "status": "not_configured",
    "message": "语义中心编译预演未配置，未生成物理 SQL。",
}

GATEWAY_SQL_DRY_RUN_NOT_CONFIGURED = {
    "status": "not_configured",
    "message": "Gateway SQL dry-run 未配置，未执行物理 SQL dry-run。",
}

GATEWAY_WAITING_FOR_COMPILED_SQL = {
    "status": "not_configured",
    "message": "等待语义中心返回物理 SQL，未调用 gateway SQL dry-run。",
}


def build_semantic_compile_preview_adapter(compiler_preview_service) -> Callable[[dict[str, Any]], dict[str, Any]]:
    """把建模工作台候选 Spec 接入语义中心统一编译预演服务。"""

    def _compile(payload: dict[str, Any]) -> dict[str, Any]:
        semantic_spec = deepcopy(payload.get("semantic_spec") or {})
        namespace = str(payload.get("namespace") or "default")
        session_id = str(payload.get("session_id") or "preview")
        metric_name = _semantic_preview_metric_name(semantic_spec)
        if not metric_name:
            return {
                "status": "failed",
                "message": "语义中心编译预演需要至少一个 BusinessMetric，并绑定 measure_refs。",
            }

        compile_preview = compiler_preview_service.compile_metric_preview(
            metric_name,
            analysis_intent=payload.get("analysis_intent") or {},
            query_dsl=payload.get("query_dsl"),
            question=payload.get("question"),
            viewer_roles=payload.get("viewer_roles") or [],
            principal_context=payload.get("principal_context"),
            runtime_mode="official",
            runtime_manifest=_release_preview_runtime_manifest(
                namespace=namespace,
                session_id=session_id,
                semantic_spec=semantic_spec,
            ),
        )
        return _semantic_compile_result_from_preview(compile_preview)

    return _compile


def _semantic_preview_metric_name(spec: dict[str, Any]) -> str | None:
    metric = spec.get("metric")
    top_level_metric_name = None
    if isinstance(metric, dict) and metric.get("name"):
        top_level_metric_name = str(metric["name"])
    if isinstance(metric, dict) and metric.get("name") and metric.get("measure_refs"):
        return str(metric["name"])

    ontology_metrics = (spec.get("ontology") or {}).get("metrics") or []
    if isinstance(ontology_metrics, list):
        for item in ontology_metrics:
            if isinstance(item, dict) and item.get("name") and item.get("measure_refs"):
                return str(item["name"])
        for item in ontology_metrics:
            if isinstance(item, dict) and item.get("name"):
                return str(item["name"])
    return top_level_metric_name


def _release_preview_runtime_manifest(
    *,
    namespace: str,
    session_id: str,
    semantic_spec: dict[str, Any],
) -> dict[str, Any]:
    snapshot_id = f"release-preview:{namespace}:{session_id}"
    revision_id = f"preview-revision:{session_id}"
    asset_id = f"preview-asset:{session_id}"
    asset_key = _semantic_preview_asset_key(semantic_spec)
    asset_trace = [
        {
            "asset_id": asset_id,
            "asset_type": "cube",
            "asset_key": asset_key,
            "revision_id": revision_id,
            "spec_checksum": "preview",
            "status": "published",
        }
    ]

    return {
        "ok": True,
        "snapshot_id": snapshot_id,
        "release_id": None,
        "version_pin": {
            "namespace": namespace,
            "snapshot_id": snapshot_id,
            "snapshot_status": "preview",
            "release_id": None,
            "release_no": None,
            "release_status": "preview",
            "manifest_schema_version": RUNTIME_MANIFEST_SCHEMA_VERSION,
            "asset_count": 1,
            "asset_revision_ids": [revision_id],
        },
        "asset_trace": asset_trace,
        "asset_manifest_json": {
            "schema_version": RUNTIME_MANIFEST_SCHEMA_VERSION,
            "assets": [
                {
                    "asset_id": asset_id,
                    "asset_type": "cube",
                    "asset_key": asset_key,
                    "revision_id": revision_id,
                    "spec_checksum": "preview",
                    "status": "published",
                    "spec": _compile_ready_semantic_spec(semantic_spec),
                }
            ],
        },
        "binding_trace": {
            "schema_version": RUNTIME_MANIFEST_SCHEMA_VERSION,
            "bindings": [],
        },
        "policy_trace": {
            "schema_version": RUNTIME_MANIFEST_SCHEMA_VERSION,
            "policies": [],
        },
    }


def _compile_ready_semantic_spec(spec: dict[str, Any]) -> dict[str, Any]:
    """把候选 Spec 投影成可被 runtime catalog 读取的预演态，不改变原草稿。"""

    preview_spec = deepcopy(spec)
    _mark_active(preview_spec.get("cube"))
    _mark_active(preview_spec.get("metric"))
    _mark_active(preview_spec.get("object"))
    _mark_active(preview_spec.get("glossary"))
    _mark_active(preview_spec.get("relation"))
    _mark_active(preview_spec.get("action"))

    ontology = preview_spec.get("ontology")
    if isinstance(ontology, dict):
        _mark_active(ontology.get("object"))
        for key in ("objects", "metrics", "glossary", "glossary_entries", "relations", "actions"):
            for item in ontology.get(key) or []:
                _mark_active(item)
    return preview_spec


def _mark_active(value: Any) -> None:
    if isinstance(value, dict):
        value["status"] = "active"


def _normalize_string_list(value: Iterable[str] | str | None) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        values: Iterable[str] = value.split(",")
    else:
        values = value
    result: list[str] = []
    for item in values:
        text = str(item).strip()
        if text and text not in result:
            result.append(text)
    return result


def _semantic_preview_asset_key(spec: dict[str, Any]) -> str:
    cube = spec.get("cube") or {}
    if isinstance(cube, dict) and cube.get("name"):
        return str(cube["name"])
    metric_name = _semantic_preview_metric_name(spec)
    return f"semantic_model:{metric_name or 'preview'}"


def _semantic_compile_result_from_preview(compile_preview: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(compile_preview, dict):
        return {
            "status": "failed",
            "message": "语义中心编译预演返回非法响应。",
        }

    logical_sql = _compiled_sql_from_preview(compile_preview)
    access_context = _access_context_from_compile_preview(compile_preview)
    result = {
        "status": "passed" if compile_preview.get("status") == "ready" and logical_sql else "failed",
        "message": "语义中心编译预演通过。"
        if compile_preview.get("status") == "ready" and logical_sql
        else f"语义中心编译预演未通过：{compile_preview.get('reason') or '未生成物理 SQL'}",
        "target_type": compile_preview.get("target_type") or "sql",
        "logical_sql": logical_sql,
        "query_dsl": compile_preview.get("query_dsl"),
        "execution_request": compile_preview.get("execution_request"),
        "access_context": access_context,
        "compiler_preview": compile_preview,
    }
    physical_bindings = access_context.get("resource_set_physical")
    if isinstance(physical_bindings, list):
        result["physical_bindings"] = deepcopy(physical_bindings)
    if result["status"] == "passed":
        result["compiled_sql"] = logical_sql
    return result


def _compiled_sql_from_preview(compile_preview: dict[str, Any]) -> str:
    for key in ("logical_sql", "pseudo_sql"):
        value = compile_preview.get(key)
        if isinstance(value, str) and value.strip():
            return value
    execution_request = compile_preview.get("execution_request") or {}
    if isinstance(execution_request, dict):
        value = execution_request.get("sql_query")
        if isinstance(value, str) and value.strip():
            return value
    return ""


def _access_context_from_compile_preview(compile_preview: dict[str, Any]) -> dict[str, Any]:
    resource_set = compile_preview.get("resource_set") or {}
    physical = resource_set.get("physical") if isinstance(resource_set, dict) else []
    return {
        "semantic_compile": {
            "source": "execution_compiler_preview",
            "target_type": compile_preview.get("target_type") or "sql",
        },
        "resource_set": deepcopy(resource_set) if isinstance(resource_set, dict) else {},
        "resource_set_physical": deepcopy(physical) if isinstance(physical, list) else [],
        "policy": deepcopy(compile_preview.get("policy") or {}),
        "sql_hash": compile_preview.get("sql_hash"),
        "ticket_material": deepcopy(compile_preview.get("ticket_material") or {}),
        "bindings": deepcopy(compile_preview.get("bindings") or {}),
        "traceability": deepcopy(compile_preview.get("traceability") or {}),
    }


class ReleaseValidationPreviewService:
    """组织发布校验预演材料，不直接连接或查询物理数据源。"""

    def __init__(
        self,
        semantic_compile_preview: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
        gateway_sql_dry_run: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
    ):
        self._semantic_compile_preview = semantic_compile_preview
        self._gateway_sql_dry_run = gateway_sql_dry_run

    def preview(
        self,
        session_id: str,
        namespace: str,
        spec: dict[str, Any],
        previous_spec: dict[str, Any] | None = None,
        sample_questions: Iterable[str] | None = None,
        viewer_roles: Iterable[str] | None = None,
    ) -> dict[str, Any]:
        semantic_spec = deepcopy(spec)
        release_diff = self._build_release_diff(semantic_spec, previous_spec)
        semantic_compile = self._run_semantic_compile(
            session_id=session_id,
            namespace=namespace,
            semantic_spec=semantic_spec,
            viewer_roles=viewer_roles,
        )
        compiled_sql = self._extract_compiled_sql(semantic_compile)
        gateway_validation = self._run_gateway_validation(
            session_id=session_id,
            namespace=namespace,
            semantic_spec=semantic_spec,
            compiled_sql=compiled_sql,
            semantic_compile=semantic_compile,
        )

        return {
            "session_id": session_id,
            "namespace": namespace,
            "target": "semantic_center",
            "semantic_spec": semantic_spec,
            "semantic_compile": semantic_compile,
            "compiled_sql": compiled_sql,
            "release_diff": release_diff,
            "impact_summary": self._build_impact_summary(release_diff),
            "gateway_validation": gateway_validation,
            "consumer_validation": self._build_consumer_validation(sample_questions),
        }

    def _run_semantic_compile(
        self,
        *,
        session_id: str,
        namespace: str,
        semantic_spec: dict[str, Any],
        viewer_roles: Iterable[str] | None = None,
    ) -> dict[str, Any]:
        if self._semantic_compile_preview is None:
            return deepcopy(SEMANTIC_COMPILE_NOT_CONFIGURED)

        try:
            payload = {
                "namespace": namespace,
                "session_id": session_id,
                "semantic_spec": deepcopy(semantic_spec),
            }
            normalized_roles = _normalize_string_list(viewer_roles)
            if normalized_roles:
                payload["viewer_roles"] = normalized_roles
            result = self._semantic_compile_preview(payload)
        except Exception as exc:
            return {
                "status": "failed",
                "message": f"语义中心编译预演失败：{exc}",
            }
        if not isinstance(result, dict):
            return {
                "status": "failed",
                "message": "语义中心编译预演返回非法响应。",
            }
        return result

    def _run_gateway_validation(
        self,
        *,
        session_id: str,
        namespace: str,
        semantic_spec: dict[str, Any],
        compiled_sql: str,
        semantic_compile: dict[str, Any],
    ) -> dict[str, Any]:
        if not compiled_sql.strip():
            return deepcopy(GATEWAY_WAITING_FOR_COMPILED_SQL)
        if self._gateway_sql_dry_run is None:
            return deepcopy(GATEWAY_SQL_DRY_RUN_NOT_CONFIGURED)

        try:
            result = self._gateway_sql_dry_run(
                {
                    "sql": compiled_sql,
                    "access_context": self._build_gateway_access_context(
                        session_id=session_id,
                        namespace=namespace,
                        semantic_spec=semantic_spec,
                        semantic_compile=semantic_compile,
                    ),
                    "idempotency_key": f"semantic-release-preview:{namespace}:{session_id}",
                    "runtime_options": {
                        "mode": "semantic_release_preview",
                        "dry_run": True,
                    },
                    "namespace": namespace,
                    "session_id": session_id,
                }
            )
        except Exception as exc:
            return {
                "status": "failed",
                "message": f"Gateway SQL dry-run 调用失败：{exc}",
            }
        if not isinstance(result, dict):
            return {
                "status": "failed",
                "message": "Gateway SQL dry-run 返回非法响应。",
            }
        return result

    def _build_gateway_access_context(
        self,
        *,
        session_id: str,
        namespace: str,
        semantic_spec: dict[str, Any],
        semantic_compile: dict[str, Any],
    ) -> dict[str, Any]:
        access_context = semantic_compile.get("access_context")
        if isinstance(access_context, dict):
            result = deepcopy(access_context)
        else:
            result = {}

        result.setdefault("semantic_asset_refs", [self._cube_asset_key(semantic_spec)])
        release_preview = result.get("release_preview")
        if not isinstance(release_preview, dict):
            release_preview = {}
        release_preview.update({"session_id": session_id, "namespace": namespace})
        result["release_preview"] = release_preview

        physical_bindings = semantic_compile.get("physical_bindings")
        if isinstance(physical_bindings, list) and "resource_set_physical" not in result:
            result["resource_set_physical"] = deepcopy(physical_bindings)
        return result

    def _extract_compiled_sql(self, semantic_compile: dict[str, Any]) -> str:
        if str(semantic_compile.get("status") or "").strip() != "passed":
            return ""
        for key in ("compiled_sql", "sql", "physical_sql"):
            value = semantic_compile.get(key)
            if isinstance(value, str) and value.strip():
                return value
        return ""

    def _build_release_diff(
        self,
        spec: dict[str, Any],
        previous_spec: dict[str, Any] | None,
    ) -> dict[str, list[str]]:
        current = self._cube_asset_key(spec)
        if not previous_spec:
            return {"added": [current], "changed": [], "removed": []}

        previous = self._cube_asset_key(previous_spec)
        if current == previous:
            return {"added": [], "changed": [current], "removed": []}
        return {"added": [current], "changed": [], "removed": [previous]}

    def _cube_asset_key(self, spec: dict[str, Any]) -> str:
        cube = spec.get("cube") or {}
        name = cube.get("name") or "semantic_source"
        return f"cube.{name}"

    def _build_impact_summary(self, release_diff: dict[str, list[str]]) -> dict[str, Any]:
        affected_assets = [
            *release_diff["added"],
            *release_diff["changed"],
            *release_diff["removed"],
        ]
        if release_diff["removed"]:
            risk_level = "high"
        elif release_diff["changed"]:
            risk_level = "medium"
        else:
            risk_level = "low"

        return {
            "affected_assets": affected_assets,
            "affected_consumers": ["Data Agent", "BI", "数据分析"],
            "risk_level": risk_level,
        }

    def _build_consumer_validation(
        self,
        sample_questions: Iterable[str] | None,
    ) -> dict[str, Any]:
        return {
            "status": "pending",
            "samples": [
                {
                    "question": question,
                    "consumer": "semantic_center",
                    "status": "pending_gateway_validation",
                    "message": "等待 gateway SQL dry-run 验证样例问题。",
                }
                for question in sample_questions or []
            ],
        }
