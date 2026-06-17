"""语义建模冷启动批量扫描器。

这是「建模 Agent（广度）+ Copilot（深度）」产品形态里 Agent 侧的确定性执行核：
给定数据源与库，从真实表缓存读取库表，按命名分层规划，逐表用 FieldCandidateService
推断字段角色并组装候选资产包，最后做确定性分诊（confidence / risk / status），
产出待人工审阅的队列。本扫描器不依赖 LLM、不触碰发布闸门，只产 draft 队列。

设计约束：
- 表列表来自 ``TableCacheService`` 缓存（数据源接入时已自动同步），不在扫描中重复探库列表。
- 单表列结构通过 adapter ``get_table_schema`` 取一次，写入候选包的 schema_snapshot，
  保证候选包进入单资产 Copilot 时离线可用（与现有 ``_modeling_source`` 结构一致）。
- ``max_tables`` 限流，避免审核队列爆炸（审核疲劳是冷启动真正的瓶颈）。
"""
from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional, Tuple

from app.application.semantic.field_candidates import FieldCandidateService, FieldCandidateSet
from app.domain.semantic.modeling_build_project import (
    FieldCandidate,
    ModelingAssetPackage,
    ModelingBuildProject,
    RiskLevel,
    create_asset_package_id,
    refresh_package_review_state,
)
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)

DEFAULT_MAX_TABLES = 20
MAX_TABLES_HARD_CAP = 100

# 命名前缀 -> 资产包类型。维度优先级最高，其次汇总/应用层（指标），最后明细/事实。
_LAYER_RULES: Tuple[Tuple[Tuple[str, ...], str], ...] = (
    (("dim_", "dimension_"), "dimension"),
    (("dws_", "ads_", "dm_", "adm_"), "metric"),
    (("dwd_", "fact_", "ods_", "fct_"), "fact"),
)
_DEFAULT_PREFIXES: Tuple[str, ...] = tuple(
    prefix for prefixes, _ in _LAYER_RULES for prefix in prefixes
)
# 分诊：包类型在队列里的展示优先级（维度最稳、指标最需确认口径）。
_LAYER_SORT_WEIGHT = {"dimension": 0, "fact": 1, "metric": 2, "object": 3}


class ModelingSourceScanner:
    """从真实表缓存批量产出候选资产包（确定性，无 LLM）。"""

    def __init__(
        self,
        *,
        table_cache_service: Any,
        runtime_binding_service: Any,
        field_candidate_service: Optional[FieldCandidateService] = None,
        adapter_factory: Optional[Callable[[str, Dict[str, Any]], Any]] = None,
    ):
        self._table_cache_service = table_cache_service
        self._runtime = runtime_binding_service
        self._field_candidate_service = field_candidate_service or FieldCandidateService()
        self._adapter_factory = adapter_factory

    # ------------------------------------------------------------------
    # 对外入口
    # ------------------------------------------------------------------
    def can_scan(self, project: ModelingBuildProject) -> bool:
        """scope 是否带有真实数据源坐标（决定走真实扫描还是降级）。"""
        scope = dict(project.scope or {})
        source_id = scope.get("source_id")
        database = str(scope.get("database") or "").strip()
        return source_id is not None and bool(database)

    def scan(
        self,
        project: ModelingBuildProject,
        strategy: str = "balanced",
    ) -> List[ModelingAssetPackage]:
        scope = dict(project.scope or {})
        source_id = scope.get("source_id")
        database = str(scope.get("database") or "").strip()
        if source_id is None or not database:
            return []
        source_id = int(source_id)

        max_tables = self._resolve_max_tables(scope)
        prefixes = self._resolve_prefixes(scope)
        allowlist = {
            str(item).strip()
            for item in (scope.get("table_allowlist") or [])
            if str(item).strip()
        }

        tables = self._list_tables(source_id, database)
        selected = self._select_tables(tables, prefixes, allowlist, max_tables)
        if not selected:
            logger.info(
                "modeling_scan_no_table_selected",
                source_id=source_id,
                database=database,
                cached_tables=len(tables),
            )
            return []

        adapter = self._open_adapter(source_id, database)
        packages: List[ModelingAssetPackage] = []
        try:
            for table_meta in selected:
                package = self._build_package(
                    project=project,
                    source_id=source_id,
                    database=database,
                    table_meta=table_meta,
                    strategy=strategy,
                    adapter=adapter,
                )
                if package is not None:
                    packages.append(package)
        finally:
            self._close_adapter(adapter)

        return [refresh_package_review_state(package) for package in packages]

    # ------------------------------------------------------------------
    # 表枚举与分层选择
    # ------------------------------------------------------------------
    def _list_tables(self, source_id: int, database: str) -> List[Dict[str, Any]]:
        try:
            tables, _from_cache = self._table_cache_service.get_cached_tables(
                source_id, database, force_refresh=False
            )
        except Exception:
            logger.warning(
                "modeling_scan_list_tables_failed",
                source_id=source_id,
                database=database,
                exc_info=True,
            )
            return []
        normalized: List[Dict[str, Any]] = []
        for item in tables or []:
            if isinstance(item, dict):
                normalized.append(item)
            elif item:
                normalized.append({"table_name": str(item)})
        return normalized

    def _select_tables(
        self,
        tables: List[Dict[str, Any]],
        prefixes: Tuple[str, ...],
        allowlist: set[str],
        max_tables: int,
    ) -> List[Dict[str, Any]]:
        candidates: List[Dict[str, Any]] = []
        for table_meta in tables:
            name = self._table_name(table_meta)
            if not name:
                continue
            if allowlist:
                if name in allowlist:
                    candidates.append(table_meta)
                continue
            if self._matches_prefix(name, prefixes):
                candidates.append(table_meta)

        # 显式 allowlist 缺省按分层前缀过滤；前缀全不命中时退化为全表扫描，
        # 让没有规范命名的数据源也能冷启动。
        if not allowlist and not candidates:
            candidates = [item for item in tables if self._table_name(item)]

        candidates.sort(key=lambda item: self._table_sort_key(item))
        return candidates[: max(1, max_tables)]

    def _table_sort_key(self, table_meta: Dict[str, Any]) -> Tuple[int, str]:
        name = self._table_name(table_meta)
        package_type = self._classify_layer(name)
        return (_LAYER_SORT_WEIGHT.get(package_type, 5), name)

    # ------------------------------------------------------------------
    # 单表 -> 候选资产包
    # ------------------------------------------------------------------
    def _build_package(
        self,
        *,
        project: ModelingBuildProject,
        source_id: int,
        database: str,
        table_meta: Dict[str, Any],
        strategy: str,
        adapter: Any,
    ) -> Optional[ModelingAssetPackage]:
        table = self._table_name(table_meta)
        if not table:
            return None
        schema_info = self._fetch_schema(adapter, database, table)
        if schema_info is None:
            return None

        raw_columns = schema_info.get("columns") or []
        columns = [self._normalize_column(column) for column in raw_columns]
        if not columns:
            logger.info(
                "modeling_scan_skip_empty_columns",
                source_id=source_id,
                database=database,
                table=table,
            )
            return None

        table_comment = str(
            schema_info.get("comment") or table_meta.get("comment") or ""
        ).strip()
        title = table_comment or self._humanize(table)
        package_type = self._classify_layer(table)

        candidate_set = self._field_candidate_service.preview_from_columns(
            source={
                "source_kind": "modeling_scan",
                "source_id": source_id,
                "source_ref": f"{source_id}:{database}.{table}",
                "database": database,
                "table": table,
            },
            columns=[self._column_with_comment_source(column) for column in columns],
        )

        field_candidates = self._build_field_candidates(table, candidate_set)
        cube_suggestions = self._build_cube_suggestions(candidate_set)
        ontology_suggestions = self._build_ontology_suggestions(
            package_type, table, title, cube_suggestions
        )
        confidence, risk, status, triage_notes = self._triage(
            package_type=package_type,
            columns=columns,
            candidate_set=candidate_set,
            cube_suggestions=cube_suggestions,
            strategy=strategy,
        )
        grain = self._infer_grain(package_type, title, cube_suggestions)

        package = ModelingAssetPackage(
            id=create_asset_package_id(project.id, table, package_type),
            project_id=project.id,
            title=f"{title}候选",
            package_type=package_type,
            source=table,
            grain=grain,
            confidence=confidence,
            risk=risk,
            status=status,
            evidence=triage_notes,
            modeling_source=self._build_modeling_source(
                source_id=source_id,
                database=database,
                table=table,
                title=title,
                columns=columns,
            ),
            ontology_suggestions=ontology_suggestions,
            cube_suggestions=cube_suggestions,
            field_candidates=field_candidates,
        )
        return package

    def _build_field_candidates(
        self,
        table: str,
        candidate_set: FieldCandidateSet,
    ) -> List[FieldCandidate]:
        candidates: List[FieldCandidate] = []
        for field in candidate_set.fields:
            field_name = str(field.field or "").strip()
            if not field_name:
                continue
            role = self._domain_role(field.selected_role)
            source = dict(getattr(field, "source", {}) or {})
            label = str(source.get("comment") or source.get("description") or "").strip() or None
            confidence = self._top_role_confidence(field)
            evidence: List[str] = []
            if field.warnings:
                evidence.extend(str(item) for item in field.warnings)
            candidates.append(
                FieldCandidate(
                    id=f"{table}__{field_name}",
                    field=field_name,
                    label=label,
                    role=role,
                    semantic_type=field.semantic_type or None,
                    confidence=confidence,
                    evidence=evidence,
                    risk=self._normalize_risk(field.risk_level),
                    action="pending",
                )
            )
        return candidates

    @staticmethod
    def _build_cube_suggestions(candidate_set: FieldCandidateSet) -> Dict[str, Any]:
        dimensions: List[str] = []
        measures: List[str] = []
        for field in candidate_set.fields:
            field_name = str(field.field or "").strip()
            if not field_name:
                continue
            selected = str(field.selected_role or "")
            if selected.startswith("dimension."):
                dimensions.append(field_name)
            elif selected.startswith("measure."):
                measures.append(field_name)
        return {"dimensions": dimensions, "measures": measures}

    @staticmethod
    def _build_ontology_suggestions(
        package_type: str,
        table: str,
        title: str,
        cube_suggestions: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        suggestions: List[Dict[str, Any]] = [
            {"type": "object", "name": table, "title": title}
        ]
        if package_type == "metric" and cube_suggestions.get("measures"):
            suggestions.append(
                {
                    "type": "metric",
                    "name": f"{table}_metric",
                    "title": f"{title}指标",
                }
            )
        return suggestions

    # ------------------------------------------------------------------
    # 分诊
    # ------------------------------------------------------------------
    def _triage(
        self,
        *,
        package_type: str,
        columns: List[Dict[str, Any]],
        candidate_set: FieldCandidateSet,
        cube_suggestions: Dict[str, Any],
        strategy: str,
    ) -> Tuple[float, RiskLevel, str, List[str]]:
        total = max(1, len(columns))
        commented = sum(1 for column in columns if str(column.get("comment") or "").strip())
        comment_ratio = commented / total

        summary = candidate_set.summary or {}
        classified = (summary.get("dimensions", 0) + summary.get("measures", 0)) / total
        has_time = summary.get("time_fields", 0) > 0
        has_key = any(
            str(field.selected_role or "") == "dimension.identifier"
            for field in candidate_set.fields
        )
        high_risk_fields = int(summary.get("high_risk", 0))

        confidence = (
            0.40 * comment_ratio
            + 0.30 * classified
            + 0.15 * (1.0 if has_time else 0.0)
            + 0.15 * (1.0 if has_key else 0.0)
        )
        confidence = round(min(1.0, max(0.0, confidence)), 2)

        notes: List[str] = []
        notes.append(
            f"字段注释完整度 {commented}/{total}，已识别维度/指标占比 {round(classified * 100)}%。"
        )

        ambiguous_metric = package_type == "metric" and not cube_suggestions.get("measures")

        if high_risk_fields > 0:
            risk: RiskLevel = "high"
            notes.append(f"存在 {high_risk_fields} 个高风险字段，需人工确认。")
        elif strategy == "exploratory" or confidence < 0.6:
            risk = "medium"
        else:
            risk = "low"

        if ambiguous_metric:
            status = "needs_scope"
            notes.append("汇总/应用层未识别到明确度量，需业务确认指标口径。")
        elif high_risk_fields > 0:
            status = "high_risk"
        elif confidence < 0.45:
            status = "needs_scope"
            notes.append("字段证据不足，建议补充注释或主时间/主键字段后再生成。")
        else:
            status = "ready_for_review"

        return confidence, risk, status, notes

    @staticmethod
    def _infer_grain(
        package_type: str,
        title: str,
        cube_suggestions: Dict[str, Any],
    ) -> str:
        if package_type == "dimension":
            return f"一条{title}维度记录"
        if package_type == "metric":
            dims = cube_suggestions.get("dimensions") or []
            if dims:
                return "按 " + "、".join(dims[:3]) + " 聚合"
            return "按统计周期聚合"
        return f"一条{title}明细记录"

    # ------------------------------------------------------------------
    # adapter 与 schema
    # ------------------------------------------------------------------
    def _open_adapter(self, source_id: int, database: str) -> Optional[Any]:
        try:
            datasource = self._runtime.resolve_datasource(source_id)
            config = dict(datasource.connection_config or {})
            if datasource.source_type == "maxcompute":
                config["project"] = database
            else:
                config["database"] = database
            factory = self._adapter_factory or self._default_adapter_factory()
            return factory(datasource.source_type, config)
        except Exception:
            logger.warning(
                "modeling_scan_open_adapter_failed",
                source_id=source_id,
                database=database,
                exc_info=True,
            )
            return None

    @staticmethod
    def _default_adapter_factory() -> Callable[[str, Dict[str, Any]], Any]:
        from app.infrastructure.adapters.datasources.factory import AdapterFactory

        return AdapterFactory.create_adapter

    def _fetch_schema(
        self,
        adapter: Any,
        database: str,
        table: str,
    ) -> Optional[Dict[str, Any]]:
        if adapter is None:
            return None
        try:
            return adapter.get_table_schema(database, table)
        except Exception:
            logger.warning(
                "modeling_scan_fetch_schema_failed",
                database=database,
                table=table,
                exc_info=True,
            )
            return None

    @staticmethod
    def _close_adapter(adapter: Any) -> None:
        if adapter is None:
            return
        close = getattr(adapter, "close", None)
        if callable(close):
            try:
                close()
            except Exception:
                logger.warning("modeling_scan_close_adapter_failed", exc_info=True)

    # ------------------------------------------------------------------
    # 工具
    # ------------------------------------------------------------------
    def _resolve_max_tables(self, scope: Dict[str, Any]) -> int:
        raw = scope.get("max_tables")
        try:
            value = int(raw) if raw is not None else DEFAULT_MAX_TABLES
        except (TypeError, ValueError):
            value = DEFAULT_MAX_TABLES
        if value < 1:
            value = DEFAULT_MAX_TABLES
        return min(value, MAX_TABLES_HARD_CAP)

    @staticmethod
    def _resolve_prefixes(scope: Dict[str, Any]) -> Tuple[str, ...]:
        configured = [
            str(item).strip().lower()
            for item in (scope.get("table_prefixes") or [])
            if str(item).strip()
        ]
        return tuple(configured) if configured else _DEFAULT_PREFIXES

    @staticmethod
    def _matches_prefix(name: str, prefixes: Tuple[str, ...]) -> bool:
        lowered = name.lower()
        return any(lowered.startswith(prefix) for prefix in prefixes)

    @staticmethod
    def _classify_layer(name: str) -> str:
        lowered = name.lower()
        for prefixes, package_type in _LAYER_RULES:
            if any(lowered.startswith(prefix) for prefix in prefixes):
                return package_type
        return "fact"

    @staticmethod
    def _table_name(table_meta: Dict[str, Any]) -> str:
        for key in ("table_name", "name", "table"):
            value = table_meta.get(key)
            if value:
                return str(value).strip()
        return ""

    @staticmethod
    def _normalize_column(column: Any) -> Dict[str, Any]:
        if not isinstance(column, dict):
            return {"name": str(column or ""), "type": "", "comment": "", "is_partition": False}
        name = column.get("name") or column.get("field_name") or column.get("physical_name") or ""
        col_type = column.get("type") or column.get("data_type") or column.get("field_type") or ""
        comment = column.get("comment") or column.get("description") or column.get("display_name") or ""
        is_partition = bool(column.get("is_partition") or column.get("partition"))
        normalized = {
            "name": str(name),
            "type": str(col_type),
            "comment": str(comment),
            "is_partition": is_partition,
        }
        if column.get("is_primary_key") is not None:
            normalized["is_primary_key"] = bool(column.get("is_primary_key"))
        return normalized

    @staticmethod
    def _column_with_comment_source(column: Dict[str, Any]) -> Dict[str, Any]:
        enriched = dict(column)
        comment = str(column.get("comment") or "").strip()
        if comment:
            enriched["source"] = {"comment": comment}
        return enriched

    @staticmethod
    def _build_modeling_source(
        *,
        source_id: int,
        database: str,
        table: str,
        title: str,
        columns: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """生成候选包进入单资产 builder 所需的最小建模源证据（带列快照，离线可用）。"""
        return {
            "source_kind": "physical_table",
            "source_id": source_id,
            "database": database,
            "schema": None,
            "table": table,
            "name": table,
            "title": title,
            "asset_ref": {
                "kind": "physical_table",
                "source_id": source_id,
                "database": database,
                "schema": None,
                "table": table,
            },
            "evidence_bundle": {
                "schema_snapshot": {
                    "snapshot_id": f"scan:{source_id}:{database}:{table}",
                    "database": database,
                    "schema": None,
                    "table": table,
                    "title": title,
                    "columns": columns,
                    "partitions": [
                        column["name"]
                        for column in columns
                        if column.get("is_partition")
                    ],
                }
            },
        }

    @staticmethod
    def _domain_role(selected_role: Any) -> Optional[str]:
        role = str(selected_role or "")
        if role.startswith("dimension.time") or role == "dimension.time":
            return "time"
        if role.startswith("dimension."):
            return "dimension"
        if role.startswith("measure."):
            return "measure"
        return None

    @staticmethod
    def _top_role_confidence(field: Any) -> Optional[float]:
        role_candidates = getattr(field, "role_candidates", None) or []
        confidences = [
            float(getattr(item, "confidence", 0) or 0) for item in role_candidates
        ]
        if not confidences:
            return None
        return round(max(confidences), 2)

    @staticmethod
    def _normalize_risk(risk_level: Any) -> RiskLevel:
        value = str(risk_level or "").lower()
        if value in {"low", "medium", "high"}:
            return value  # type: ignore[return-value]
        return "medium"

    @staticmethod
    def _humanize(name: str) -> str:
        import re

        cleaned = re.sub(r"[_\-]+", " ", str(name)).strip().title()
        return cleaned or "新建资产"
