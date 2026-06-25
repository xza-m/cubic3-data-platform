"""数据资产底座应用服务。"""
from __future__ import annotations

import hashlib
import re
import uuid
from datetime import datetime
from typing import Any, Dict, Iterable, Optional

from app.domain.entities.data_source import is_sensitive_connection_config_key
from app.domain.semantic.data_asset import (
    AssetField,
    AssetLineage,
    AssetSnapshot,
    AssetSyncRun,
    AssetTable,
    AssetUsage,
    EvidenceBundle,
)
from app.domain.semantic.ports.data_asset_repository import IDataAssetRepository


class DataAssetService:
    """协调数据资产事实同步、查询和证据包构建。"""

    def __init__(
        self,
        repository: IDataAssetRepository,
        datasource_repository: Any = None,
        adapter_factory: Any = None,
    ):
        self._repository = repository
        self._datasource_repository = datasource_repository
        self._adapter_factory = adapter_factory

    def sync_from_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """从确定性元数据 payload 同步资产事实。

        传入 tables 时走确定性 payload 导入；未传 tables 时从已注册数据源读取真实物理 Schema。
        """

        if "tables" not in payload:
            return self._sync_from_registered_sources(payload)

        source_id = str(payload.get("source_id") or "maxcompute-default")
        sync_run = self._repository.start_sync_run(
            AssetSyncRun(id=f"sync_{uuid.uuid4().hex}", source_id=source_id)
        )
        stats = {
            "table_count": 0,
            "field_count": 0,
            "snapshot_count": 0,
            "usage_count": 0,
            "lineage_count": 0,
        }
        try:
            for table_payload in payload.get("tables") or []:
                table = self._table_from_payload(
                    table_payload,
                    source_id=source_id,
                    default_database=str(payload.get("database") or ""),
                    default_schema=payload.get("schema"),
                )
                fields = self._fields_from_payload(table_payload.get("fields") or [], table)
                table = table.model_copy(update={"field_count": len(fields)})
                saved_table = self._repository.upsert_table(table)
                fields = _rebind_fields_to_table(fields, saved_table)
                self._repository.replace_fields(saved_table.id, fields)
                self._repository.save_snapshot(
                    AssetSnapshot(
                        id=_stable_id("snap", sync_run.id, saved_table.id, "schema"),
                        table_id=saved_table.id,
                        snapshot_type="schema",
                        payload=_schema_snapshot_payload(saved_table, fields),
                        sync_run_id=sync_run.id,
                    )
                )
                stats["table_count"] += 1
                stats["field_count"] += len(fields)
                stats["snapshot_count"] += 1
                stats["usage_count"] += self._record_usage_items(
                    saved_table.id,
                    table_payload.get("usage") or [],
                )
                stats["lineage_count"] += self._record_lineage_items(
                    saved_table.id,
                    table_payload.get("lineage") or [],
                )
            finished = self._repository.finish_sync_run(
                sync_run.id,
                status="success",
                stats=stats,
            )
        except Exception as exc:
            finished = self._repository.finish_sync_run(
                sync_run.id,
                status="failed",
                error_message=_safe_error(exc),
                stats=stats,
            )
        return _sync_run_to_dict(finished or sync_run)

    def radar_summary(self) -> Dict[str, Any]:
        summary = dict(self._repository.radar_summary())
        summary["status"] = (
            "error"
            if summary.get("failed_sync_count", 0) > 0
            else "warn"
            if summary.get("stale_profile_count", 0) > 0 or summary.get("drift_risk_count", 0) > 0
            else "ok"
        )
        return summary

    def list_tables(
        self,
        *,
        keyword: str = "",
        page: int = 1,
        page_size: int = 20,
        source_id: Optional[str] = None,
        database: Optional[str] = None,
        schema: Optional[str] = None,
        sync_status: Optional[str] = None,
        lifecycle_status: Optional[str] = None,
    ) -> Dict[str, Any]:
        page_payload = self._repository.list_tables(
            keyword=keyword,
            page=page,
            page_size=page_size,
            source_id=source_id,
            database=database,
            schema=schema,
            sync_status=sync_status,
            lifecycle_status=lifecycle_status,
        )
        return {
            **{key: value for key, value in page_payload.items() if key != "items"},
            "items": [_table_to_dict(table) for table in page_payload.get("items", [])],
        }

    def get_table(self, table_id: str) -> Optional[Dict[str, Any]]:
        table = self._repository.get_table(table_id)
        return _table_to_dict(table) if table is not None else None

    def list_fields(self, table_id: str) -> Optional[Dict[str, Any]]:
        if self._repository.get_table(table_id) is None:
            return None
        fields = self._repository.list_fields(table_id)
        return {
            "items": [_field_to_dict(field) for field in fields],
            "total": len(fields),
        }

    def list_sync_runs(self, *, page: int = 1, page_size: int = 20) -> Dict[str, Any]:
        page_payload = self._repository.list_sync_runs(page=page, page_size=page_size)
        return {
            **{key: value for key, value in page_payload.items() if key != "items"},
            "items": [_sync_run_to_dict(run) for run in page_payload.get("items", [])],
        }

    def get_sync_run(self, sync_run_id: str) -> Optional[Dict[str, Any]]:
        sync_run = self._repository.get_sync_run(sync_run_id)
        return _sync_run_to_dict(sync_run) if sync_run is not None else None

    def build_table_evidence(self, table_id: str) -> Optional[Dict[str, Any]]:
        table = self._repository.get_table(table_id)
        if table is None:
            return None
        fields = self._repository.list_fields(table_id)
        snapshot = self._repository.latest_snapshot(table_id, snapshot_type="schema")
        usage_items = self._repository.list_usage(table_id)
        lineage_items = self._repository.list_lineage(table_id)
        bundle = EvidenceBundle(
            subject=f"data_asset_table:{table_id}",
            asset_refs=[table.to_ref(snapshot_id=snapshot.id if snapshot else None)],
            schema_snapshot=snapshot.payload if snapshot else _schema_snapshot_payload(table, fields),
            sample_profile={
                "row_count": table.row_count,
                "partition_count": table.partition_count,
                "profile_status": table.profile_status,
                "field_profiles": {
                    field.name: field.profile for field in fields if field.profile
                },
            },
            usage_evidence=[_usage_to_dict(item) for item in usage_items],
            lineage_evidence=[_lineage_to_dict(item) for item in lineage_items],
            drift_evidence={
                "sync_status": table.sync_status,
                "status": "warn" if table.sync_status == "drift_risk" else "ok",
            },
        )
        return bundle.to_dict()

    def _table_from_payload(
        self,
        table_payload: Dict[str, Any],
        *,
        source_id: str,
        default_database: str,
        default_schema: Optional[str],
    ) -> AssetTable:
        name = str(table_payload.get("name") or "").strip()
        if not name:
            raise ValueError("table name is required")
        database = str(table_payload.get("database") or default_database).strip()
        if not database:
            raise ValueError(f"database is required for table {name}")
        schema = table_payload.get("schema", default_schema)
        profile = table_payload.get("profile") if isinstance(table_payload.get("profile"), dict) else {}
        return AssetTable(
            id=str(table_payload.get("id") or _stable_id("tbl", source_id, database, schema, name)),
            source_id=source_id,
            database=database,
            schema=schema,
            name=name,
            title=table_payload.get("title"),
            description=table_payload.get("description"),
            layer=table_payload.get("layer"),
            owner=table_payload.get("owner"),
            table_type=str(table_payload.get("table_type") or "table"),
            lifecycle_status=str(table_payload.get("lifecycle_status") or "active"),
            row_count=_optional_int(table_payload.get("row_count", profile.get("row_count"))),
            partition_count=_optional_int(table_payload.get("partition_count", profile.get("partition_count"))),
            profile_status=str(table_payload.get("profile_status") or profile.get("freshness_status") or "unknown"),
            sync_status=str(table_payload.get("sync_status") or "success"),
            last_synced_at=table_payload.get("last_synced_at") or _now_iso(),
            last_profiled_at=table_payload.get("last_profiled_at"),
            extra=dict(table_payload.get("extra") or {}),
        )

    def _fields_from_payload(self, fields_payload: Iterable[Dict[str, Any]], table: AssetTable) -> list[AssetField]:
        fields: list[AssetField] = []
        for index, field_payload in enumerate(fields_payload):
            name = str(field_payload.get("name") or "").strip()
            if not name:
                raise ValueError(f"field name is required for table {table.name}")
            data_type = str(field_payload.get("data_type") or field_payload.get("type") or "").strip()
            if not data_type:
                raise ValueError(f"field type is required for {table.name}.{name}")
            fields.append(
                AssetField(
                    id=str(field_payload.get("id") or _stable_id("fld", table.id, name)),
                    table_id=table.id,
                    source_id=table.source_id,
                    database=table.database,
                    schema=table.source_schema,
                    table_name=table.name,
                    name=name,
                    data_type=data_type,
                    ordinal=int(field_payload.get("ordinal", index) or index),
                    nullable=bool(field_payload.get("nullable", True)),
                    comment=field_payload.get("comment"),
                    profile=dict(field_payload.get("profile") or {}),
                    sensitivity_level=field_payload.get("sensitivity_level"),
                )
            )
        return fields

    def _record_usage_items(self, table_id: str, usage_items: Iterable[Dict[str, Any]]) -> int:
        count = 0
        for item in usage_items:
            source_type = str(item.get("source_type") or item.get("source") or "").strip()
            source_ref = str(item.get("source_ref") or "").strip()
            if not source_type or not source_ref:
                continue
            self._repository.record_usage(
                AssetUsage(
                    id=str(item.get("id") or _stable_id("usage", table_id, source_type, source_ref)),
                    table_id=table_id,
                    field_id=item.get("field_id"),
                    source_type=source_type,  # type: ignore[arg-type]
                    source_ref=source_ref,
                    usage_count=int(item.get("usage_count", item.get("count", 1)) or 1),
                    metadata=dict(item.get("metadata") or {}),
                )
            )
            count += 1
        return count

    def _sync_from_registered_sources(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        stats: Dict[str, Any] = {
            "table_count": 0,
            "field_count": 0,
            "snapshot_count": 0,
            "usage_count": 0,
            "lineage_count": 0,
            "datasource_count": 0,
            "database_count": 0,
            "failed_source_count": 0,
            "source_errors": [],
        }
        requested_source = _requested_datasource_ref(payload)
        if self._datasource_repository is None:
            sync_run = self._repository.start_sync_run(
                AssetSyncRun(
                    id=f"sync_{uuid.uuid4().hex}",
                    source_id=str(requested_source or "all"),
                )
            )
            return _sync_run_to_dict(
                self._repository.finish_sync_run(
                    sync_run.id,
                    status="failed",
                    error_message="未配置数据源仓储，无法执行真实元数据同步",
                    stats=stats,
                )
                or sync_run
            )

        datasources = [
            datasource
            for datasource in self._datasource_repository.find_all()
            if self._datasource_matches(datasource, payload)
        ]
        sync_run = self._repository.start_sync_run(
            AssetSyncRun(
                id=f"sync_{uuid.uuid4().hex}",
                source_id=_sync_run_source_id(requested_source, datasources),
            )
        )
        if not datasources:
            return _sync_run_to_dict(
                self._repository.finish_sync_run(
                    sync_run.id,
                    status="failed",
                    error_message="没有可同步的数据源，请先配置并测试数据源连接",
                    stats=stats,
                )
                or sync_run
            )

        max_tables = _positive_limit(payload.get("max_tables") or payload.get("limit"), default=200)
        for datasource in datasources:
            source_ref = _datasource_ref(datasource)
            adapter = None
            try:
                adapter = self._create_adapter(
                    datasource.source_type,
                    datasource.connection_config,
                )
                databases = self._datasource_databases(datasource, adapter, payload)
                stats["datasource_count"] += 1
                stats["database_count"] += len(databases)
                for database in databases:
                    table_payloads = self._table_payloads_from_adapter(
                        adapter=adapter,
                        datasource=datasource,
                        source_ref=source_ref,
                        database=database,
                        max_tables=max_tables,
                    )
                    for table_payload in table_payloads:
                        saved = self._sync_one_table_payload(
                            sync_run.id,
                            table_payload,
                            source_id=source_ref,
                            default_database=database,
                            default_schema=None,
                        )
                        stats["table_count"] += 1
                        stats["field_count"] += saved["field_count"]
                        stats["snapshot_count"] += 1
            except Exception as exc:
                stats["failed_source_count"] += 1
                stats["source_errors"].append(
                    {
                        "source_id": source_ref,
                        "message": _safe_error(exc),
                    }
                )
            finally:
                close = getattr(adapter, "close", None)
                if callable(close):
                    close()

        status = "success" if stats["table_count"] > 0 or stats["failed_source_count"] == 0 else "failed"
        error_message = None if status == "success" else "所有数据源同步失败"
        finished = self._repository.finish_sync_run(
            sync_run.id,
            status=status,
            error_message=error_message,
            stats=stats,
        )
        return _sync_run_to_dict(finished or sync_run)

    def _sync_one_table_payload(
        self,
        sync_run_id: str,
        table_payload: Dict[str, Any],
        *,
        source_id: str,
        default_database: str,
        default_schema: Optional[str],
    ) -> Dict[str, Any]:
        table = self._table_from_payload(
            table_payload,
            source_id=source_id,
            default_database=default_database,
            default_schema=default_schema,
        )
        fields = self._fields_from_payload(table_payload.get("fields") or [], table)
        table = table.model_copy(update={"field_count": len(fields)})
        saved_table = self._repository.upsert_table(table)
        fields = _rebind_fields_to_table(fields, saved_table)
        self._repository.replace_fields(saved_table.id, fields)
        self._repository.save_snapshot(
            AssetSnapshot(
                id=_stable_id("snap", sync_run_id, saved_table.id, "schema"),
                table_id=saved_table.id,
                snapshot_type="schema",
                payload=_schema_snapshot_payload(saved_table, fields),
                sync_run_id=sync_run_id,
            )
        )
        return {"table_id": saved_table.id, "field_count": len(fields)}

    def _datasource_matches(self, datasource: Any, payload: Dict[str, Any]) -> bool:
        if not bool(getattr(datasource, "is_active", True)):
            return False
        requested = payload.get("source_id") or payload.get("datasource_id")
        if requested not in (None, ""):
            requested_text = str(requested)
            return requested_text in {
                str(getattr(datasource, "id", "")),
                str(getattr(datasource, "name", "")),
                _datasource_ref(datasource),
            }
        can_use = getattr(datasource, "can_use", None)
        return bool(can_use()) if callable(can_use) else True

    def _datasource_databases(self, datasource: Any, adapter: Any, payload: Dict[str, Any]) -> list[str]:
        requested_database = str(payload.get("database") or "").strip()
        if requested_database:
            return [requested_database]
        catalog_sync = {}
        extra_config = getattr(datasource, "extra_config", None)
        if isinstance(extra_config, dict):
            catalog_sync = extra_config.get("catalog_sync") or {}
        tracked = [str(item).strip() for item in catalog_sync.get("tracked_databases") or [] if str(item).strip()]
        if tracked:
            return tracked
        return [str(item).strip() for item in adapter.list_databases() if str(item).strip()]

    def _create_adapter(self, source_type: str, connection_config: Dict[str, Any]) -> Any:
        if self._adapter_factory is not None:
            return self._adapter_factory.create_adapter(source_type, connection_config)
        from app.infrastructure.adapters.datasources.factory import AdapterFactory
        return AdapterFactory.create_adapter(source_type, connection_config)

    def _table_payloads_from_adapter(
        self,
        *,
        adapter: Any,
        datasource: Any,
        source_ref: str,
        database: str,
        max_tables: int,
    ) -> list[Dict[str, Any]]:
        payloads: list[Dict[str, Any]] = []
        for table_info in adapter.list_tables(database)[:max_tables]:
            raw_name = str(table_info.get("table_name") or table_info.get("name") or "").strip()
            if not raw_name:
                continue
            schema, table_name = _split_table_name(raw_name)
            schema_payload = adapter.get_table_schema(database, raw_name)
            if not isinstance(schema_payload, dict):
                schema_payload = {}
            columns = schema_payload.get("columns") or []
            payloads.append(
                {
                    "id": _stable_id("tbl", source_ref, database, schema, table_name),
                    "database": database,
                    "schema": schema,
                    "name": table_name,
                    "title": table_info.get("comment") or schema_payload.get("comment") or table_name,
                    "description": schema_payload.get("comment") or table_info.get("comment") or "",
                    "layer": _infer_layer(table_name),
                    "table_type": table_info.get("table_type") or "table",
                    "row_count": table_info.get("row_count") or schema_payload.get("row_count"),
                    "partition_count": len(schema_payload.get("partitions") or []),
                    "profile_status": "fresh",
                    "sync_status": "success",
                    "fields": [
                        {
                            "name": column.get("name"),
                            "type": column.get("type") or column.get("data_type") or "unknown",
                            "nullable": column.get("is_nullable", column.get("nullable", True)),
                            "comment": column.get("comment") or "",
                            "profile": {
                                "is_partition": bool(column.get("is_partition")),
                            },
                        }
                        for column in columns
                        if isinstance(column, dict) and column.get("name")
                    ],
                    "extra": {
                        "datasource_id": getattr(datasource, "id", None),
                        "datasource_name": getattr(datasource, "name", None),
                        "source_type": getattr(datasource, "source_type", None),
                    },
                }
            )
        return payloads

    def _record_lineage_items(self, table_id: str, lineage_items: Iterable[Dict[str, Any]]) -> int:
        count = 0
        for item in lineage_items:
            target_type = str(item.get("target_type") or "").strip()
            target_ref = str(item.get("target_ref") or "").strip()
            if not target_type or not target_ref:
                continue
            relation_type = item.get("relation_type")
            if relation_type not in {"upstream", "downstream"}:
                relation_type = item.get("direction") or "downstream"
            self._repository.record_lineage(
                AssetLineage(
                    id=str(item.get("id") or _stable_id("lin", table_id, target_type, target_ref)),
                    source_table_id=table_id,
                    target_table_id=item.get("target_table_id"),
                    target_type=target_type,
                    target_ref=target_ref,
                    relation_type=str(relation_type),  # type: ignore[arg-type]
                    metadata=dict(item.get("metadata") or {}),
                )
            )
            count += 1
        return count


def _schema_snapshot_payload(table: AssetTable, fields: list[AssetField]) -> Dict[str, Any]:
    return {
        "table_id": table.id,
        "qualified_name": table.to_ref().qualified_name,
        "columns": [
            {
                "name": field.name,
                "type": field.data_type,
                "nullable": field.nullable,
                "comment": field.comment,
                "ordinal": field.ordinal,
                "is_partition": bool((field.profile or {}).get("is_partition")),
            }
            for field in fields
        ],
        "partitions": [
            field.name
            for field in fields
            if bool((field.profile or {}).get("is_partition"))
        ],
    }


def _rebind_fields_to_table(fields: list[AssetField], table: AssetTable) -> list[AssetField]:
    return [
        field.model_copy(
            update={
                "table_id": table.id,
                "source_id": table.source_id,
                "database": table.database,
                "source_schema": table.source_schema,
                "table_name": table.name,
            }
        )
        for field in fields
    ]


def _table_to_dict(table: AssetTable) -> Dict[str, Any]:
    payload = table.model_dump(by_alias=True)
    payload["asset_key"] = table.asset_key
    payload["qualified_name"] = table.to_ref().qualified_name
    return payload


def _field_to_dict(field: AssetField) -> Dict[str, Any]:
    payload = field.model_dump(by_alias=True)
    payload["asset_key"] = field.asset_key
    payload["qualified_name"] = field.to_ref().qualified_name
    return payload


def _sync_run_to_dict(sync_run: AssetSyncRun) -> Dict[str, Any]:
    return sync_run.model_dump()


def _usage_to_dict(usage: AssetUsage) -> Dict[str, Any]:
    return usage.model_dump()


def _lineage_to_dict(lineage: AssetLineage) -> Dict[str, Any]:
    return lineage.model_dump()


def _stable_id(prefix: str, *parts: object) -> str:
    raw = "|".join("" if part is None else str(part) for part in parts)
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]
    return f"{prefix}_{digest}"


def _datasource_ref(datasource: Any) -> str:
    datasource_id = getattr(datasource, "id", None)
    if datasource_id is not None and str(datasource_id).strip():
        return str(datasource_id)
    name = str(getattr(datasource, "name", "") or "").strip()
    return name or "datasource_unknown"


def _split_table_name(raw_name: str) -> tuple[Optional[str], str]:
    if "." not in raw_name:
        return None, raw_name
    schema, table_name = raw_name.split(".", 1)
    return schema or None, table_name


def _infer_layer(table_name: str) -> Optional[str]:
    prefix = table_name.split("_", 1)[0].lower()
    return prefix if prefix in {"ods", "dwd", "dim", "dws", "ads"} else None


def _positive_limit(value: Any, *, default: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default


def _requested_datasource_ref(payload: Dict[str, Any]) -> Optional[str]:
    for key in ("datasource_id", "source_id"):
        value = payload.get(key)
        if value not in (None, ""):
            return str(value)
    return None


def _sync_run_source_id(requested_source: Optional[str], datasources: list[Any]) -> str:
    if requested_source and len(datasources) == 1:
        return _datasource_ref(datasources[0])
    return "all" if requested_source is None else requested_source


def _safe_error(exc: Exception) -> str:
    message = str(exc).strip() or exc.__class__.__name__
    return _sanitize_sensitive_text(message)[:500]


def _sanitize_sensitive_text(message: str) -> str:
    sanitized = str(message)
    sanitized = re.sub(
        r"(?P<key_quote>[\"']?)(?P<key>[A-Za-z][A-Za-z0-9_-]*)(?P=key_quote)"
        r"(?P<sep>\s*[:=]\s*)"
        r"(?P<value_quote>[\"']?)(?P<value>[^\"'\s,;}]+)(?P=value_quote)",
        _mask_sensitive_pair,
        sanitized,
    )
    sanitized = re.sub(r"LTAI[A-Za-z0-9]+", "LTAI******", sanitized)
    return sanitized


def _mask_sensitive_pair(match: re.Match[str]) -> str:
    key = match.group("key")
    if not is_sensitive_connection_config_key(key):
        return match.group(0)
    return (
        f"{match.group('key_quote')}{key}{match.group('key_quote')}"
        f"{match.group('sep')}"
        f"{match.group('value_quote')}******{match.group('value_quote')}"
    )


def _now_iso() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def _optional_int(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    return int(value)
