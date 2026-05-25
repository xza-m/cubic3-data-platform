"""Cube 建模服务。"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from app.application.semantic.field_candidates import FieldCandidateService, FieldCandidateSet
from app.application.semantic.semantic_runtime_binding_service import SemanticRuntimeBindingService
from app.domain.semantic.entities import CubeDefinition, MeasureDef
from app.domain.semantic.ports.cube_repository import ICubeRepository
from app.domain.ports.repositories.semantic_registry_repository import (
    ISemanticRegistryRepository,
)
from app.shared.exceptions import ApplicationException


class CubeModelingService:
    def __init__(
        self,
        cube_repo: ICubeRepository,
        runtime_binding_service: SemanticRuntimeBindingService,
        definition_service: Any = None,
        registry_repo: Optional[ISemanticRegistryRepository] = None,
        metric_repository: Any = None,
        field_candidate_service: Optional[FieldCandidateService] = None,
    ):
        self._cube_repo = cube_repo
        self._runtime = runtime_binding_service
        self._definition_service = definition_service
        self._registry_repo = registry_repo
        self._metric_repository = metric_repository
        self._field_candidate_service = field_candidate_service or FieldCandidateService()

    def generate_cube_draft(
        self,
        *,
        source_id: int,
        database: str,
        table: str,
        schema: Optional[str] = None,
        name: Optional[str] = None,
        title: Optional[str] = None,
        description: Optional[str] = None,
    ) -> Dict[str, Any]:
        datasource = self._runtime.resolve_datasource(source_id)
        config = dict(datasource.connection_config or {})
        if datasource.source_type == "maxcompute":
            config["project"] = database
        else:
            config["database"] = database

        from app.infrastructure.adapters.datasources.factory import AdapterFactory

        adapter = AdapterFactory.create_adapter(datasource.source_type, config)
        try:
            table_ref = f"{schema}.{table}" if schema else table
            schema_info = adapter.get_table_schema(database, table_ref)
        except Exception as exc:
            raise ApplicationException(f"读取表结构失败: {str(exc)}") from exc
        finally:
            adapter.close()
        return self.build_cube_draft_payload(
            source_id=int(source_id),
            database=database,
            schema=schema,
            table=table_ref,
            columns=schema_info.get("columns", []),
            partitions=schema_info.get("partitions", []) or [],
            name=name or table,
            title=title or self._humanize_name(table),
            description=description,
            comment=schema_info.get("comment"),
            data_source=datasource.source_type,
        )

    def build_cube_draft_payload(
        self,
        *,
        source_id: int,
        database: Optional[str],
        schema: Optional[str],
        table: str,
        columns: List[Dict[str, Any]],
        partitions: Optional[List[Any]] = None,
        name: Optional[str] = None,
        title: Optional[str] = None,
        description: Optional[str] = None,
        comment: Optional[str] = None,
        data_source: str = "maxcompute",
        source_sql: Optional[str] = None,
        source_dataset_id: Optional[int] = None,
        source_dataset_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        namespace = ".".join(part for part in (database, schema, table) if part)
        candidate_set = self._field_candidate_service.preview_from_columns(
            source={
                "source_kind": "raw_columns_facade",
                "source_ref": f"{source_id}:{namespace}",
                "database": database,
                "schema": schema,
                "table": table,
            },
            columns=[self._column_with_candidate_source(column) for column in columns],
        )
        return self.build_cube_draft_from_candidate_set(
            candidate_set=candidate_set,
            source_id=source_id,
            database=database,
            schema=schema,
            table=table,
            partitions=partitions,
            name=name,
            title=title,
            description=description,
            comment=comment,
            data_source=data_source,
            source_sql=source_sql,
            source_dataset_id=source_dataset_id,
            source_dataset_type=source_dataset_type,
            draft_source_mode="candidate_facade",
        )

    def build_cube_draft_from_candidate_set(
        self,
        *,
        candidate_set: FieldCandidateSet,
        source_id: int,
        database: Optional[str],
        schema: Optional[str],
        table: str,
        partitions: Optional[List[Any]] = None,
        name: Optional[str] = None,
        title: Optional[str] = None,
        description: Optional[str] = None,
        comment: Optional[str] = None,
        data_source: str = "maxcompute",
        source_sql: Optional[str] = None,
        source_dataset_id: Optional[int] = None,
        source_dataset_type: Optional[str] = None,
        partition: Optional[Dict[str, Any]] = None,
        entity_key: Optional[str] = None,
        grain: Optional[str] = None,
        draft_source_mode: str = "candidate_set",
    ) -> Dict[str, Any]:
        cube_name = self._normalize_name(name or table)
        cube_title = title or self._humanize_name(table)
        dimensions = self._build_dimensions_from_candidate_set(candidate_set)
        measures = self._build_measures_from_candidate_set(candidate_set, dimensions)
        if not measures and dimensions:
            first_dim = next(iter(dimensions.keys()))
            measures["total_count"] = MeasureDef(
                title="总数",
                type="count",
                sql=f"COUNT(`{first_dim}`)",
                description="自动生成的记录总数指标",
                certified=True,
            )

        payload: Dict[str, Any] = {
            "name": cube_name,
            "title": cube_title,
            "description": description or comment or f"基于 {table} 自动生成的 Cube 草稿",
            "table": table,
            "source_id": int(source_id),
            "source_database": database,
            "source_schema": schema,
            "data_source": data_source,
            "status": "draft",
            "dimensions": dimensions,
            "measures": {key: measure.model_dump(exclude_none=True) for key, measure in measures.items()},
            "segments": {},
            "joins": {},
            "field_candidate_trace": {
                "candidate_set_id": candidate_set.candidate_set_id,
                "ruleset_version": candidate_set.ruleset_version,
                "summary": candidate_set.summary,
                "source": candidate_set.source,
                "draft_source_mode": draft_source_mode,
            },
        }
        if source_sql:
            payload["source_sql"] = source_sql
        if source_dataset_id is not None:
            payload["source_dataset_id"] = int(source_dataset_id)
        if source_dataset_type:
            payload["source_dataset_type"] = source_dataset_type
        if partition:
            payload["partition"] = partition
        normalized_partitions = partitions or []
        if normalized_partitions and "partition" not in payload:
            first_partition = normalized_partitions[0]
            part_field = str(first_partition.get("name") if isinstance(first_partition, dict) else first_partition)
            payload["partition"] = {
                "field": part_field,
                "type": "date" if self._infer_dimension_type(part_field, "string") == "time" else "string",
                "format": "yyyyMMdd" if "ds" in part_field.lower() else "yyyy-MM-dd",
                "max_range_days": 90,
            }
        primary_key = entity_key or next((field_name for field_name, dim in dimensions.items() if dim.get("primary_key")), None)
        if primary_key:
            payload["entity_key"] = primary_key
            payload["grain"] = grain or primary_key
        elif grain:
            payload["grain"] = grain
        return payload

    def build_cube_draft_from_inline_candidate_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        candidate_set_payload = dict(payload.get("candidate_set") or {})
        fields = candidate_set_payload.get("fields") or []
        if not isinstance(fields, list):
            raise ApplicationException("candidate_set.fields 必须是 list")
        source = dict(candidate_set_payload.get("source") or {})
        source.setdefault("source_kind", "inline_candidate")
        incoming_candidate_set_id = candidate_set_payload.get("candidate_set_id") or payload.get("candidate_set_id")
        if incoming_candidate_set_id:
            source["incoming_candidate_set_id"] = incoming_candidate_set_id

        columns = [self._column_from_inline_candidate(field) for field in fields]
        selected_overrides = {
            str(field.get("field") or field.get("name")): field.get("selected_role")
            for field in fields
            if isinstance(field, dict) and field.get("selected_role") and (field.get("field") or field.get("name"))
        }
        candidate_set = self._field_candidate_service.preview_from_columns(
            source=source,
            columns=columns,
            selected_overrides=selected_overrides,
        )
        return self.build_cube_draft_from_candidate_set(
            candidate_set=candidate_set,
            source_id=payload.get("source_id") or source.get("source_id") or 0,
            database=payload.get("database") or source.get("database"),
            schema=payload.get("schema") or source.get("schema"),
            table=payload.get("table") or source.get("table") or payload.get("name") or "inline_candidate",
            partitions=payload.get("partitions"),
            name=payload.get("name"),
            title=payload.get("title"),
            description=payload.get("description"),
            comment=payload.get("comment"),
            data_source=payload.get("data_source") or source.get("data_source") or "maxcompute",
            source_sql=payload.get("source_sql"),
            source_dataset_id=payload.get("source_dataset_id"),
            source_dataset_type=payload.get("source_dataset_type"),
            partition=payload.get("partition"),
            entity_key=payload.get("entity_key"),
            grain=payload.get("grain"),
            draft_source_mode="inline_candidate",
        )

    def create_cube(self, payload: Dict[str, Any]) -> CubeDefinition:
        cube = CubeDefinition(**payload)
        if cube.status not in {"draft", "active", "deprecated"}:
            raise ApplicationException(f"不支持的 Cube 状态: {cube.status}")
        if cube.source_id is None:
            raise ApplicationException("Cube 必须绑定 source_id")
        if self._cube_repo.get(cube.name):
            import time as _time
            tag = hex(int(_time.time()) % 0xFFFF)[2:]
            draft_name = f"{cube.name}_draft_{tag}"
            while self._cube_repo.get(draft_name):
                tag = hex((int(_time.time()) + 1) % 0xFFFF)[2:]
                draft_name = f"{cube.name}_draft_{tag}"
            cube = CubeDefinition(**{**payload, "name": draft_name})
        self._runtime.resolve_cube_datasource(cube)
        self._cube_repo.save(cube)
        self._after_save(cube)
        return cube

    def update_cube(self, name: str, payload: Dict[str, Any]) -> CubeDefinition:
        existing = self._cube_repo.get(name)
        if existing is None:
            raise ApplicationException(f"未找到 Cube: {name}")
        if payload.get("name") and payload["name"] != name:
            raise ApplicationException("当前不支持修改 Cube 名称")
        merged = existing.model_dump(mode="json")
        merged.update(payload)
        merged["name"] = name
        cube = CubeDefinition(**merged)
        self._runtime.resolve_cube_datasource(cube)
        self._cube_repo.save(cube)
        self._after_save(cube)
        return cube

    def activate_cube(self, name: str) -> CubeDefinition:
        cube = self._must_get_cube(name)
        self._validate_ontology_first_activation(cube)
        cube = CubeDefinition(**{**cube.model_dump(mode="json"), "status": "active"})
        self._cube_repo.save(cube)
        self._after_save(cube)
        return cube

    def deprecate_cube(self, name: str) -> CubeDefinition:
        cube = self._must_get_cube(name)
        cube = CubeDefinition(**{**cube.model_dump(mode="json"), "status": "deprecated"})
        self._cube_repo.save(cube)
        self._after_save(cube)
        return cube

    def create_revision_draft(self, name: str) -> CubeDefinition:
        cube = self._must_get_cube(name)
        if cube.status != "active":
            raise ApplicationException("只有已发布 Cube 才能发起修订")
        revision_name = self._build_revision_draft_name(cube.name)
        revision = CubeDefinition(**{**cube.model_dump(mode="json"), "name": revision_name, "status": "draft"})
        self._cube_repo.save(revision)
        self._after_save(revision)
        return revision

    def _must_get_cube(self, name: str) -> CubeDefinition:
        cube = self._cube_repo.get(name)
        if cube is None:
            raise ApplicationException(f"未找到 Cube: {name}")
        return cube

    def _after_save(self, cube: CubeDefinition) -> None:
        if self._definition_service is not None:
            self._definition_service.invalidate_cache()
        if self._registry_repo is not None:
            binding = self._runtime.resolve_source_binding_summary(cube)
            self._registry_repo.upsert(
                "cube",
                cube.name,
                source_id=cube.source_id,
                status=cube.status,
                source_binding_summary=binding,
                measure_summary_snapshot={
                    "count": len(cube.measures),
                    "names": list(cube.measures.keys()),
                },
                certified_measure_list=[name for name, measure in cube.measures.items() if measure.certified],
            )
            self._registry_repo.commit()

    def _build_revision_draft_name(self, base_name: str) -> str:
        candidate = f"{base_name}__revision_draft"
        if self._cube_repo.get(candidate) is None:
            return candidate
        suffix = 2
        while True:
            candidate = f"{base_name}__revision_draft_{suffix}"
            if self._cube_repo.get(candidate) is None:
                return candidate
            suffix += 1

    def _validate_ontology_first_activation(self, cube: CubeDefinition) -> None:
        if self._metric_repository is None:
            return
        certified_measure_refs = [
            f"{cube.name}.{measure_name}"
            for measure_name, measure in cube.measures.items()
            if getattr(measure, "certified", False)
        ]
        if not certified_measure_refs:
            return
        linked_refs = set()
        for metric in self._metric_repository.list_all():
            for measure_ref in getattr(metric, "measure_refs", []) or []:
                if measure_ref in certified_measure_refs:
                    linked_refs.add(measure_ref)
        missing_refs = [ref for ref in certified_measure_refs if ref not in linked_refs]
        if missing_refs:
            raise ApplicationException(
                "认证指标发布失败：以下 Measure 尚未关联 BusinessMetric: "
                + ", ".join(missing_refs)
            )

    def _build_dimensions_from_candidate_set(self, candidate_set: FieldCandidateSet) -> Dict[str, Dict[str, Any]]:
        dimensions: Dict[str, Dict[str, Any]] = {}
        for candidate in candidate_set.fields:
            if not str(candidate.selected_role or "").startswith("dimension."):
                continue
            field_name = str(candidate.field or "").strip()
            if not field_name:
                continue
            source_type = candidate.physical_type.raw_type or candidate.physical_type.normalized_type
            dimensions[field_name] = {
                "title": self._candidate_title(candidate),
                "type": self._candidate_dimension_type(candidate.semantic_type),
                "sql": f"`{field_name}`",
                "description": self._candidate_description(candidate, candidate_set),
                "source_data_type": source_type,
                "primary_key": candidate.selected_role == "dimension.identifier",
            }
        return dimensions

    def _build_measures_from_candidate_set(
        self,
        candidate_set: FieldCandidateSet,
        dimensions: Dict[str, Dict[str, Any]],
    ) -> Dict[str, MeasureDef]:
        measures: Dict[str, MeasureDef] = {}
        count_basis = next(
            (name for name, dim in dimensions.items() if dim.get("primary_key")),
            next(iter(dimensions.keys()), "id"),
        )
        measures["total_count"] = MeasureDef(
            title="总数",
            type="count",
            sql=f"COUNT(`{count_basis}`)",
            description="自动生成的记录总数指标",
            source_data_type="count",
            certified=True,
        )
        for candidate in candidate_set.fields:
            if not str(candidate.selected_role or "").startswith("measure."):
                continue
            field_name = str(candidate.field or "").strip()
            if not field_name:
                continue
            semantics = candidate.measure_semantics
            raw_agg = str(getattr(semantics, "aggregation", "") or "sum")
            agg_type = "avg" if raw_agg == "percentile" else raw_agg
            if agg_type not in {"sum", "avg", "min", "max", "count", "count_distinct", "number"}:
                agg_type = "sum"
            measure_name = self._build_measure_name(agg_type, field_name)
            source_type = candidate.physical_type.raw_type or candidate.physical_type.normalized_type
            additivity = str(getattr(semantics, "additivity", "") or "")
            is_ratio = bool(getattr(semantics, "is_ratio", False))
            measures[measure_name] = MeasureDef(
                title=self._candidate_title(candidate),
                type=agg_type,
                sql=f"{agg_type.upper()}(`{field_name}`)",
                description=self._candidate_description(candidate, candidate_set),
                source_data_type=source_type,
                format=getattr(semantics, "default_format", None),
                unit=getattr(semantics, "unit", None),
                non_additive=is_ratio or additivity == "non_additive" or raw_agg == "percentile",
                tags=list(candidate.issue_codes or []),
            )
        return measures

    @staticmethod
    def _candidate_dimension_type(semantic_type: str) -> str:
        if semantic_type in {"string", "number", "time", "boolean"}:
            return semantic_type
        return "string"

    @staticmethod
    def _candidate_title(candidate: Any) -> str:
        source = dict(getattr(candidate, "source", {}) or {})
        return str(source.get("comment") or source.get("description") or CubeModelingService._humanize_name(candidate.field))

    @staticmethod
    def _candidate_description(candidate: Any, candidate_set: FieldCandidateSet) -> str:
        parts = [f"来自字段候选集 {candidate_set.candidate_set_id}，角色 {candidate.selected_role}"]
        if candidate.warnings:
            parts.append("警告：" + "；".join(candidate.warnings))
        if candidate.issue_codes:
            parts.append("问题码：" + "，".join(candidate.issue_codes))
        return "；".join(parts)

    @staticmethod
    def _column_with_candidate_source(column: Dict[str, Any]) -> Dict[str, Any]:
        enriched = dict(column)
        source = dict(enriched.get("source") or {})
        for key in ("comment", "description", "display_name"):
            if enriched.get(key) is not None:
                source.setdefault(key, enriched.get(key))
        if source:
            enriched["source"] = source
        return enriched

    @staticmethod
    def _column_from_inline_candidate(field: Any) -> Dict[str, Any]:
        if not isinstance(field, dict):
            return {"name": "", "type": ""}
        physical_type = field.get("physical_type") or {}
        if isinstance(physical_type, dict):
            raw_type = physical_type.get("raw_type") or physical_type.get("normalized_type")
        else:
            raw_type = getattr(physical_type, "raw_type", None) or getattr(physical_type, "normalized_type", None)
        source = dict(field.get("source") or {})
        for key in ("comment", "description", "display_name"):
            if field.get(key) is not None:
                source.setdefault(key, field.get(key))
        column = {
            "name": field.get("field") or field.get("name") or field.get("physical_name") or "",
            "type": raw_type or field.get("type") or field.get("data_type") or "",
            "comment": field.get("comment") or field.get("description") or field.get("display_name") or "",
        }
        if source:
            column["source"] = source
        return column

    @staticmethod
    def _normalize_name(name: str) -> str:
        cleaned = re.sub(r"[^a-zA-Z0-9_]+", "_", name.strip()).strip("_").lower()
        return cleaned or "cube_draft"

    @staticmethod
    def _humanize_name(name: str) -> str:
        return re.sub(r"[_\-]+", " ", name).strip().title() or "新建 Cube"

    def _build_dimensions(self, columns: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
        dimensions: Dict[str, Dict[str, Any]] = {}
        for column in columns:
            field_name = str(column.get("name") or "").strip()
            if not field_name:
                continue
            if column.get("is_partition"):
                continue
            col_type = str(column.get("type") or "string")
            lower_name = field_name.lower()
            if self._is_numeric_type(col_type) and self._is_likely_measure(lower_name, str(column.get("comment") or "")):
                continue
            column_comment = str(column.get("comment") or "").strip() or None
            dimensions[field_name] = {
                "title": str(column.get("comment") or self._humanize_name(field_name)),
                "type": self._infer_dimension_type(field_name, col_type),
                "sql": f"`{field_name}`",
                "description": column_comment,
                "source_data_type": col_type,
                "primary_key": bool(column.get("is_primary_key")) or lower_name in {"id", "pk"} or lower_name.endswith("_id"),
            }
        return dimensions

    def _build_measures(
        self,
        columns: List[Dict[str, Any]],
        dimensions: Dict[str, Dict[str, Any]],
    ) -> Dict[str, MeasureDef]:
        measures: Dict[str, MeasureDef] = {}
        count_basis = next(
            (name for name, dim in dimensions.items() if dim.get("primary_key")),
            next(iter(dimensions.keys()), "id"),
        )
        measures["total_count"] = MeasureDef(
            title="总数",
            type="count",
            sql=f"COUNT(`{count_basis}`)",
            description="自动生成的记录总数指标",
            source_data_type="count",
            certified=True,
        )
        for column in columns:
            field_name = str(column.get("name") or "").strip()
            column_type = str(column.get("type") or "")
            if not field_name or not self._is_numeric_type(column_type):
                continue
            if column.get("is_partition"):
                continue
            lower_name = field_name.lower()
            comment = str(column.get("comment") or "").strip()
            if not self._is_likely_measure(lower_name, comment):
                continue

            agg_type = self._infer_measure_aggregation(lower_name, comment)
            measure_name = self._build_measure_name(agg_type, field_name)
            measure_title = comment if comment else f"{self._humanize_name(field_name)} 合计"

            measures[measure_name] = MeasureDef(
                title=measure_title,
                type=agg_type,
                sql=f"{agg_type.upper()}(`{field_name}`)",
                description=f"自动生成的 {field_name} {agg_type}指标",
                source_data_type=column_type,
                non_additive=agg_type == "avg",
            )
        return measures

    @staticmethod
    def _is_likely_measure(lower_name: str, comment: str) -> bool:
        """判断一个数值型字段是否适合作为 Measure（正向命中制）。

        仅当字段名或注释命中"可度量语义"时才返回 True。
        这比"排除 ID 后把所有数值列都当 measure"更准确。
        """
        ID_PATTERNS = ('_id', '_key', '_code', '_no', '_seq')
        if any(lower_name.endswith(p) for p in ID_PATTERNS) or lower_name in {"id", "pk"}:
            return False

        DIM_NAME_PATTERNS = (
            '_type', '_status', '_level', '_grade', '_class', '_category',
            '_flag', '_mode', '_kind', '_state', '_tag', '_role', '_rank',
            '_phase', '_stage', '_step', '_version', '_priority',
        )
        BOOL_NAME_PATTERNS = ('is_', 'has_', 'can_', 'should_', 'allow_', 'enable_')
        if any(lower_name.endswith(p) for p in DIM_NAME_PATTERNS):
            return False
        if any(lower_name.startswith(p) for p in BOOL_NAME_PATTERNS):
            return False

        DIM_COMMENT_KEYWORDS = (
            'ID', 'id', '编码', '编号', '状态', '类型', '类别', '名称',
            '标识', '标志', '级别', '等级', '序号', '排序', '版本',
            '是否', '标记', '分类',
        )
        if comment and any(kw in comment for kw in DIM_COMMENT_KEYWORDS):
            return False

        MEASURE_NAME_SIGNALS = (
            '_cnt', '_count', '_sum', '_total', '_amt', '_amount',
            '_num', '_number', '_price', '_rate', '_ratio', '_pct',
            '_percent', '_quantity', '_qty', '_volume', '_value',
            '_score', '_weight', '_duration', '_cost', '_fee',
            '_salary', '_revenue', '_profit', '_balance', '_income',
            '_expense', '_size', '_length', '_area', '_distance',
            '_energy', '_power', '_times', '_avg', '_mean', '_median',
            '_stddev', '_variance', '_wow', '_mom', '_yoy',
        )
        MEASURE_NAME_PREFIXES = (
            'avg_', 'mean_', 'median_', 'stddev_', 'std_', 'variance_', 'var_',
            'max_', 'min_',
        )
        MEASURE_COMMENT_KEYWORDS = (
            '金额', '数量', '比率', '比例', '百分比', '时长', '次数',
            '分数', '价格', '重量', '面积', '距离', '能量', '功率',
            '费用', '成本', '收入', '支出', '利润', '余额', '工资',
            '总计', '合计', '累计', '均值', '平均', '得分', '难度',
            '分位', '中位数', '标准差', '方差', '环比', '同比',
        )
        if any(lower_name.endswith(s) for s in MEASURE_NAME_SIGNALS):
            return True
        if any(lower_name.startswith(p) for p in MEASURE_NAME_PREFIXES):
            return True
        if re.match(r"^p\d{1,3}(_|$)", lower_name) or re.search(r"_p\d{1,3}(_|$)", lower_name):
            return True
        if comment and any(kw in comment for kw in MEASURE_COMMENT_KEYWORDS):
            return True
        if comment and re.search(r"[Pp]\d{1,3}", comment):
            return True
        return False

    @staticmethod
    def _infer_measure_aggregation(lower_name: str, comment: str) -> str:
        if lower_name.startswith("max_") or lower_name.endswith("_max"):
            return "max"
        if lower_name.startswith("min_") or lower_name.endswith("_min"):
            return "min"

        non_additive_suffixes = (
            '_rate', '_ratio', '_pct', '_percent', '_avg', '_mean',
            '_median', '_stddev', '_variance', '_wow', '_mom', '_yoy',
        )
        non_additive_prefixes = (
            'avg_', 'mean_', 'median_', 'stddev_', 'std_', 'variance_', 'var_',
        )
        non_additive_keywords = (
            '比率', '比例', '百分比', '均值', '平均', '分位', '中位数',
            '标准差', '方差', '环比', '同比',
        )
        if any(lower_name.endswith(s) for s in non_additive_suffixes):
            return "avg"
        if any(lower_name.startswith(p) for p in non_additive_prefixes):
            return "avg"
        if re.match(r"^p\d{1,3}(_|$)", lower_name) or re.search(r"_p\d{1,3}(_|$)", lower_name):
            return "avg"
        if comment and any(kw in comment for kw in non_additive_keywords):
            return "avg"
        if comment and re.search(r"[Pp]\d{1,3}", comment):
            return "avg"
        return "sum"

    @staticmethod
    def _build_measure_name(prefix: str, field_name: str) -> str:
        lower_name = field_name.lower()
        if lower_name.startswith(f"{prefix}_") or lower_name.endswith(f"_{prefix}"):
            return field_name
        return f"{prefix}_{field_name}"

    @staticmethod
    def _infer_dimension_type(field_name: str, db_type: str) -> str:
        lower_type = db_type.lower()
        lower_name = field_name.lower()
        if any(token in lower_type for token in ("date", "time", "timestamp")) or lower_name.endswith("_at") or lower_name in {"ds", "dt", "date"}:
            return "time"
        if any(token in lower_type for token in ("int", "double", "float", "decimal", "numeric", "bigint")):
            return "number"
        if "bool" in lower_type:
            return "boolean"
        return "string"

    @staticmethod
    def _is_numeric_type(db_type: str) -> bool:
        lower_type = db_type.lower()
        return any(token in lower_type for token in ("int", "double", "float", "decimal", "numeric", "bigint"))
