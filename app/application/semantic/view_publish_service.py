"""View 逻辑发布服务

职责：
1. 将 View 展开为 DSL 并编译为 SQL
2. 将编译结果发布为 virtual dataset
3. 维护发布元数据与状态查询

注意：
- 本服务只做逻辑发布，不创建物理结果表
- 发布元数据暂存于 Dataset.file_metadata.semantic_publish
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

from app.application.dataset.commands.create_dataset import CreateDatasetCommand
from app.domain.entities.dataset_field import DatasetField
from app.domain.ports.repositories.dataset_repository import IDatasetRepository
from app.domain.ports.repositories.semantic_registry_repository import (
    ISemanticRegistryRepository,
)
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


def _semantic_type_to_data_type(stype: str) -> str:
    return {
        "string": "STRING",
        "number": "BIGINT",
        "time": "STRING",
        "boolean": "BOOLEAN",
    }.get(stype, "STRING")


def _to_iso_datetime(value: Any) -> Optional[str]:
    if isinstance(value, datetime):
        return value.isoformat()
    return None


class ViewPublishService:
    """将 View 逻辑发布为 virtual dataset。"""

    def __init__(
        self,
        semantic_service: Any = None,
        definition_service: Any = None,
        query_service: Any = None,
        dataset_repo: IDatasetRepository = None,
        dataset_handler: Any = None,
        default_source_id_getter: Optional[Callable[[], Optional[int]]] = None,
        registry_repo: Optional[ISemanticRegistryRepository] = None,
        runtime_snapshot_service: Any = None,
    ):
        if semantic_service is not None:
            definition_delegate = getattr(semantic_service, "__dict__", {}).get("_definition_service")
            query_delegate = getattr(semantic_service, "__dict__", {}).get("_query_service")
            definition_service = definition_delegate or semantic_service
            query_service = query_delegate or semantic_service
        self._semantic_service = semantic_service or definition_service
        self._definition_service = definition_service
        self._query_service = query_service
        self._dataset_repo = dataset_repo
        self._dataset_handler = dataset_handler
        self._default_source_id_getter = default_source_id_getter
        self._registry_repo = registry_repo
        self._runtime_snapshot_service = runtime_snapshot_service

    def publish_view(self, view_name: str, source_id: Optional[int] = None) -> Dict[str, Any]:
        view = self._definition_service._view_repo.get(view_name)
        if view is None:
            raise ValueError(f"未找到 View: {view_name}")
        validate_view = getattr(self._definition_service, "validate_view", None)
        diagnostics = validate_view(view) if callable(validate_view) else []
        blocking = [
            item for item in diagnostics
            if item.get("kind") == "inactive_view_dependency" and item.get("level") == "error"
        ]
        if blocking:
            raise ValueError(blocking[0]["message"])

        dsl_dict = self._definition_service.expand_view_to_dsl(view)
        compiled = self._query_service.compile_query(dsl_dict)
        field_list = self._build_field_list_from_dsl(dsl_dict)
        publish_meta = self._build_publish_metadata(view_name, dsl_dict, compiled.sql, field_list)
        dataset_code = f"view_{view.name}"
        existing = self._dataset_repo.find_by_code(dataset_code)

        if existing and not existing.is_deleted:
            existing.dataset_type = "virtual"
            existing.physical_table = ""
            existing.sql_query = compiled.sql
            existing.dataset_name = view.title
            existing.description = view.description or ""
            existing.file_metadata = publish_meta
            self._replace_dataset_fields(existing, field_list)
            existing.complete_sync(len(field_list))
            self._dataset_repo.save(existing)
            self._dataset_repo.commit()
            self._sync_registry(view_name, publish_meta)
            logger.info("view_publish_updated", view=view_name, dataset_id=existing.id)
            return self._build_publish_response(
                dataset=existing,
                view_name=view.name,
                field_mappings=dsl_dict.get("field_mappings", []),
                sql=compiled.sql,
                action="updated",
                publish_meta=publish_meta,
            )

        source_id = source_id or self._resolve_source_id_from_dsl(dsl_dict) or self._resolve_default_source_id()
        cmd = CreateDatasetCommand(
            dataset_code=dataset_code,
            dataset_name=view.title,
            source_id=source_id,
            physical_table="",
            fields=field_list,
            description=view.description or "",
            created_by="semantic_publish",
            dataset_type="virtual",
            sql_query=compiled.sql,
            file_metadata=publish_meta,
        )
        dataset = self._dataset_handler.handle(cmd)
        self._sync_registry(view_name, publish_meta)
        logger.info("view_publish_created", view=view_name, dataset_id=dataset.id)
        return self._build_publish_response(
            dataset=dataset,
            view_name=view.name,
            field_mappings=dsl_dict.get("field_mappings", []),
            sql=compiled.sql,
            action="created",
            publish_meta=publish_meta,
        )

    def get_publish_status(self, view_name: str) -> Dict[str, Any]:
        dataset_code = f"view_{view_name}"
        existing = self._dataset_repo.find_by_code(dataset_code)
        view = self._definition_service._view_repo.get(view_name)
        registry_summary = self._get_registry_summary(view_name)

        if not existing or existing.is_deleted:
            return {
                "materialized": False,
                "publish_status": registry_summary.get("publish_status", "unpublished"),
                "view_name": view_name,
                "state_summary": registry_summary,
            }

        publish_meta = self._extract_publish_metadata(existing)
        field_mappings = publish_meta.get("field_mappings", [])
        if not field_mappings and view is not None:
            try:
                field_mappings = self._definition_service.expand_view_to_dsl(view).get("field_mappings", [])
            except Exception as exc:  # pragma: no cover - 防御性兜底
                logger.warning("publish_status_expand_failed", view=view_name, error=str(exc))

        return {
            "materialized": True,
            "publish_status": publish_meta.get("publish_status", "published"),
            "view_name": view_name,
            "dataset_id": existing.id,
            "dataset_code": existing.dataset_code,
            "dataset_name": existing.dataset_name,
            "sql_query": existing.sql_query,
            "updated_at": _to_iso_datetime(existing.updated_at),
            "published_at": publish_meta.get("published_at") or _to_iso_datetime(existing.updated_at),
            "source_view": publish_meta.get("source_view", view_name),
            "field_mappings": field_mappings,
            "definition_hash": publish_meta.get("definition_hash"),
            "definition_summary": publish_meta.get("definition_summary"),
            "state_summary": registry_summary,
        }

    def get_batch_publish_status(self, public_only: bool = True) -> Dict[str, Dict[str, Any]]:
        views = self._definition_service.list_views(public_only=public_only)
        return {
            view.name: self.get_publish_status(view.name)
            for view in views
        }

    def _resolve_default_source_id(self) -> int:
        if self._default_source_id_getter is not None:
            source_id = self._default_source_id_getter()
            if source_id:
                return source_id
        return 1

    def _resolve_source_id_from_dsl(self, dsl_dict: Dict[str, Any]) -> Optional[int]:
        refs = []
        refs.extend(dsl_dict.get("dimensions", []))
        refs.extend(dsl_dict.get("measures", []))
        for ref in refs:
            if "." not in ref:
                continue
            cube_name = ref.split(".", 1)[0]
            cube = self._definition_service._cube_repo.get(cube_name)
            source_id = getattr(cube, "source_id", None) if cube else None
            if source_id:
                return int(source_id)
        return None

    def _build_publish_response(
        self,
        dataset: Any,
        view_name: str,
        field_mappings: List[Dict[str, Any]],
        sql: str,
        action: str,
        publish_meta: Dict[str, Any],
    ) -> Dict[str, Any]:
        metadata = publish_meta.get("semantic_publish", publish_meta)
        return {
            "dataset_id": dataset.id,
            "dataset_code": dataset.dataset_code,
            "sql_query": sql,
            "field_count": len(field_mappings),
            "source_view": view_name,
            "field_mappings": field_mappings,
            "updated_at": _to_iso_datetime(getattr(dataset, "updated_at", None)),
            "published_at": metadata.get("published_at"),
            "definition_hash": metadata.get("definition_hash"),
            "definition_summary": metadata.get("definition_summary"),
            "publish_status": metadata.get("publish_status", "published"),
            "state_summary": self._get_registry_summary(view_name),
            "action": action,
        }

    def _build_publish_metadata(
        self,
        view_name: str,
        dsl_dict: Dict[str, Any],
        sql: str,
        field_list: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        definition_payload = {
            "view_name": view_name,
            "dsl": dsl_dict,
            "sql": sql,
            "field_names": [field["physical_name"] for field in field_list],
        }
        definition_hash = hashlib.sha256(
            json.dumps(definition_payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
        ).hexdigest()
        metadata = {
            "source_view": view_name,
            "field_mappings": dsl_dict.get("field_mappings", []),
            "definition_hash": definition_hash,
            "definition_summary": {
                "dimension_count": len(dsl_dict.get("dimensions", [])),
                "measure_count": len(dsl_dict.get("measures", [])),
                "field_count": len(field_list),
            },
            "published_at": datetime.utcnow().isoformat(),
            "publish_status": "published",
        }
        metadata.update(self._release_pin_metadata())
        return {"semantic_publish": metadata}

    def _release_pin_metadata(self) -> Dict[str, Any]:
        """§6.1 消费方 pin 最小落点：virtual dataset 记录发布时的 release 与 pin 策略。

        当前 View 展开仍读建模态 YAML 仓储，运行时一律跟随 active release，
        因此 pin_policy 固定为 track_active；release_id 仅作为发布时口径证据。
        """
        if self._runtime_snapshot_service is None:
            return {}
        try:
            manifest = self._runtime_snapshot_service.get_active_manifest()
        except Exception as exc:  # pragma: no cover - manifest 不可用不阻断 View 发布
            logger.warning("view_publish_release_pin_unavailable", error=str(exc))
            return {}
        if not isinstance(manifest, dict) or not manifest.get("ok"):
            return {}
        return {
            "pin_policy": "track_active",
            "release_id": manifest.get("release_id"),
            "snapshot_id": manifest.get("snapshot_id"),
        }

    @staticmethod
    def _extract_publish_metadata(dataset: Any) -> Dict[str, Any]:
        metadata = dataset.file_metadata or {}
        if isinstance(metadata, dict):
            return metadata.get("semantic_publish", {})
        return {}

    def _build_field_list_from_dsl(self, dsl_dict: Dict[str, Any]) -> List[Dict[str, Any]]:
        fields: List[Dict[str, Any]] = []
        seen_names = set()
        field_mapping_map = {
            item["source_ref"]: item
            for item in dsl_dict.get("field_mappings", [])
            if item.get("source_ref") and item.get("physical_name")
        }

        def append_field(field: Dict[str, Any]) -> None:
            physical_name = field["physical_name"]
            if physical_name in seen_names:
                logger.warning("publish_duplicate_field_skipped", physical_name=physical_name)
                return
            field["field_order"] = len(fields)
            fields.append(field)
            seen_names.add(physical_name)

        for ref in dsl_dict.get("dimensions", []):
            cube_name, dim_name = ref.split(".", 1)
            cube = self._definition_service._cube_repo.get(cube_name)
            dim = cube.dimensions.get(dim_name) if cube else None
            mapping = field_mapping_map.get(ref, {})
            append_field({
                "physical_name": mapping.get("physical_name", ref.replace(".", "__")),
                "data_type": _semantic_type_to_data_type(dim.type if dim else "string"),
                "display_name": mapping.get("display_name", dim.title if dim else dim_name),
                "business_type": "dimension",
                "comment": f"来自 {cube_name}.{dim_name}",
                "source_ref": ref,
            })

        for ref in dsl_dict.get("measures", []):
            cube_name, measure_name = ref.split(".", 1)
            cube = self._definition_service._cube_repo.get(cube_name)
            measure = cube.measures.get(measure_name) if cube else None
            mapping = field_mapping_map.get(ref, {})
            append_field({
                "physical_name": mapping.get("physical_name", ref.replace(".", "__")),
                "data_type": "BIGINT" if measure and measure.type in ("count", "count_distinct", "sum") else "DOUBLE",
                "display_name": mapping.get("display_name", measure.title if measure else measure_name),
                "business_type": "metric",
                "comment": f"来自 {cube_name}.{measure_name}",
                "source_ref": ref,
            })

        return fields

    def _replace_dataset_fields(self, dataset: Any, field_list: List[Dict[str, Any]]) -> None:
        existing_field_names = [field.physical_name for field in dataset.fields.all()]
        if existing_field_names:
            self._dataset_repo.delete_fields(dataset.id, existing_field_names)

        new_fields = [
            DatasetField(
                dataset_id=dataset.id,
                physical_name=field["physical_name"],
                data_type=field["data_type"],
                display_name=field.get("display_name"),
                business_type=field.get("business_type", "dimension"),
                sensitivity_level=field.get("sensitivity_level", "public"),
                mask_rule=field.get("mask_rule"),
                comment=field.get("comment"),
                field_order=field.get("field_order", idx),
            )
            for idx, field in enumerate(field_list)
        ]
        if new_fields:
            self._dataset_repo.save_fields_batch(new_fields)

    def _sync_registry(self, view_name: str, publish_meta: Dict[str, Any]) -> None:
        if self._registry_repo is None:
            return
        metadata = publish_meta.get("semantic_publish", publish_meta)
        self._registry_repo.upsert(
            "view",
            view_name,
            definition_hash=metadata.get("definition_hash"),
            publish_status=metadata.get("publish_status", "published"),
            last_published_at=metadata.get("published_at"),
            last_loaded_at=datetime.utcnow(),
        )
        self._registry_repo.commit()

    def _get_registry_summary(self, view_name: str) -> Dict[str, Any]:
        if self._registry_repo is None:
            return {}
        entry = self._registry_repo.get("view", view_name)
        return entry.to_summary() if entry else {}
