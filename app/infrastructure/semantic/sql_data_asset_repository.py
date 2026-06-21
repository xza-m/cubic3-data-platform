"""SQL 数据资产底座仓储。"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.domain.semantic.data_asset import (
    AssetField,
    AssetLineage,
    AssetSnapshot,
    AssetSyncRun,
    AssetTable,
    AssetUsage,
)
from app.infrastructure.semantic.models import (
    DataAssetFieldORM,
    DataAssetLineageORM,
    DataAssetSnapshotORM,
    DataAssetSyncRunORM,
    DataAssetTableORM,
    DataAssetUsageORM,
)


class SqlDataAssetRepository:
    """数据资产事实层 SQL 仓储。"""

    def __init__(self, session: Session):
        self.session = session

    def upsert_table(self, table: AssetTable) -> AssetTable:
        row = self.session.get(DataAssetTableORM, table.id)
        if row is None:
            row = (
                self.session.query(DataAssetTableORM)
                .filter(
                    DataAssetTableORM.source_id == table.source_id,
                    DataAssetTableORM.database == table.database,
                    DataAssetTableORM.schema == table.source_schema,
                    DataAssetTableORM.name == table.name,
                )
                .first()
            )
        if row is None:
            row = DataAssetTableORM(id=table.id, created_at=_parse_utc(table.created_at) or datetime.utcnow())
            self.session.add(row)
        _apply_table(row, table)
        self.session.commit()
        return _table_from_row(row)

    def replace_fields(self, table_id: str, fields: list[AssetField]) -> None:
        (
            self.session.query(DataAssetFieldORM)
            .filter(DataAssetFieldORM.table_id == table_id)
            .delete(synchronize_session=False)
        )
        for index, field in enumerate(fields):
            ordered_field = field.model_copy(update={"ordinal": field.ordinal or index})
            self.session.add(_field_to_row(ordered_field))
        table_row = self.session.get(DataAssetTableORM, table_id)
        if table_row is not None:
            table_row.field_count = len(fields)
            table_row.updated_at = datetime.utcnow()
        self.session.commit()

    def save_snapshot(self, snapshot: AssetSnapshot) -> AssetSnapshot:
        row = self.session.get(DataAssetSnapshotORM, snapshot.id)
        if row is None:
            row = DataAssetSnapshotORM(id=snapshot.id)
            self.session.add(row)
        row.table_id = snapshot.table_id
        row.snapshot_type = snapshot.snapshot_type
        row.payload_json = snapshot.payload
        row.sync_run_id = snapshot.sync_run_id
        row.created_at = _parse_utc(snapshot.created_at) or datetime.utcnow()
        self.session.commit()
        return _snapshot_from_row(row)

    def start_sync_run(self, sync_run: AssetSyncRun) -> AssetSyncRun:
        row = DataAssetSyncRunORM(
            id=sync_run.id,
            source_id=sync_run.source_id,
            status=sync_run.status,
            started_at=_parse_utc(sync_run.started_at) or datetime.utcnow(),
            finished_at=_parse_utc(sync_run.finished_at),
            error_message=sync_run.error_message,
            stats_json=sync_run.stats,
        )
        self.session.add(row)
        self.session.commit()
        return _sync_run_from_row(row)

    def finish_sync_run(
        self,
        sync_run_id: str,
        *,
        status: str,
        error_message: Optional[str] = None,
        stats: Optional[Dict[str, object]] = None,
    ) -> Optional[AssetSyncRun]:
        row = self.session.get(DataAssetSyncRunORM, sync_run_id)
        if row is None:
            return None
        row.status = status
        row.error_message = error_message
        row.stats_json = dict(stats or {})
        row.finished_at = datetime.utcnow()
        self.session.commit()
        return _sync_run_from_row(row)

    def list_sync_runs(self, *, page: int = 1, page_size: int = 20) -> Dict[str, Any]:
        query = self.session.query(DataAssetSyncRunORM)
        total = query.count()
        page = max(1, int(page or 1))
        page_size = max(1, min(int(page_size or 20), 200))
        rows = (
            query
            .order_by(DataAssetSyncRunORM.started_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return {
            "items": [_sync_run_from_row(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
            "page_count": (total + page_size - 1) // page_size if total else 0,
        }

    def get_sync_run(self, sync_run_id: str) -> Optional[AssetSyncRun]:
        row = self.session.get(DataAssetSyncRunORM, sync_run_id)
        return _sync_run_from_row(row) if row is not None else None

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
        query = self.session.query(DataAssetTableORM)
        normalized = (keyword or "").strip()
        if normalized:
            pattern = f"%{normalized}%"
            query = query.filter(
                or_(
                    DataAssetTableORM.name.ilike(pattern),
                    DataAssetTableORM.title.ilike(pattern),
                    DataAssetTableORM.description.ilike(pattern),
                    DataAssetTableORM.source_id.ilike(pattern),
                    DataAssetTableORM.database.ilike(pattern),
                    DataAssetTableORM.schema.ilike(pattern),
                )
            )
        if source_id:
            query = query.filter(DataAssetTableORM.source_id == source_id)
        if database:
            query = query.filter(DataAssetTableORM.database == database)
        if schema:
            query = query.filter(DataAssetTableORM.schema == schema)
        if sync_status:
            query = query.filter(DataAssetTableORM.sync_status == sync_status)
        if lifecycle_status:
            query = query.filter(DataAssetTableORM.lifecycle_status == lifecycle_status)
        total = query.count()
        page = max(1, int(page or 1))
        page_size = max(1, min(int(page_size or 20), 200))
        rows = (
            query.order_by(DataAssetTableORM.updated_at.desc(), DataAssetTableORM.name.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return {
            "items": [_table_from_row(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
            "page_count": (total + page_size - 1) // page_size if total else 0,
        }

    def get_table(self, table_id: str) -> Optional[AssetTable]:
        row = self.session.get(DataAssetTableORM, table_id)
        return _table_from_row(row) if row is not None else None

    def list_fields(self, table_id: str) -> list[AssetField]:
        rows = (
            self.session.query(DataAssetFieldORM)
            .filter(DataAssetFieldORM.table_id == table_id)
            .order_by(DataAssetFieldORM.ordinal.asc(), DataAssetFieldORM.name.asc())
            .all()
        )
        return [_field_from_row(row) for row in rows]

    def latest_snapshot(self, table_id: str, *, snapshot_type: str = "schema") -> Optional[AssetSnapshot]:
        row = (
            self.session.query(DataAssetSnapshotORM)
            .filter(
                DataAssetSnapshotORM.table_id == table_id,
                DataAssetSnapshotORM.snapshot_type == snapshot_type,
            )
            .order_by(DataAssetSnapshotORM.created_at.desc())
            .first()
        )
        return _snapshot_from_row(row) if row is not None else None

    def record_usage(self, usage: AssetUsage) -> AssetUsage:
        row = self.session.get(DataAssetUsageORM, usage.id)
        if row is None:
            row = DataAssetUsageORM(id=usage.id)
            self.session.add(row)
        row.table_id = usage.table_id
        row.field_id = usage.field_id
        row.source_type = usage.source_type
        row.source_ref = usage.source_ref
        row.usage_count = usage.usage_count
        row.last_used_at = _parse_utc(usage.last_used_at) or datetime.utcnow()
        row.metadata_json = usage.metadata
        self.session.commit()
        return _usage_from_row(row)

    def list_usage(self, table_id: str) -> list[AssetUsage]:
        rows = (
            self.session.query(DataAssetUsageORM)
            .filter(DataAssetUsageORM.table_id == table_id)
            .order_by(DataAssetUsageORM.last_used_at.desc())
            .all()
        )
        return [_usage_from_row(row) for row in rows]

    def record_lineage(self, lineage: AssetLineage) -> AssetLineage:
        row = self.session.get(DataAssetLineageORM, lineage.id)
        if row is None:
            row = DataAssetLineageORM(id=lineage.id)
            self.session.add(row)
        row.source_table_id = lineage.source_table_id
        row.target_table_id = lineage.target_table_id
        row.target_type = lineage.target_type
        row.target_ref = lineage.target_ref
        row.relation_type = lineage.relation_type
        row.metadata_json = lineage.metadata
        row.created_at = _parse_utc(lineage.created_at) or datetime.utcnow()
        self.session.commit()
        return _lineage_from_row(row)

    def list_lineage(self, table_id: str) -> list[AssetLineage]:
        rows = (
            self.session.query(DataAssetLineageORM)
            .filter(
                or_(
                    DataAssetLineageORM.source_table_id == table_id,
                    DataAssetLineageORM.target_table_id == table_id,
                )
            )
            .order_by(DataAssetLineageORM.created_at.desc())
            .all()
        )
        return [_lineage_from_row(row) for row in rows]

    def radar_summary(self) -> Dict[str, Any]:
        table_count = self.session.query(func.count(DataAssetTableORM.id)).scalar() or 0
        field_count = self.session.query(func.count(DataAssetFieldORM.id)).scalar() or 0
        sync_rows = (
            self.session.query(DataAssetSyncRunORM.source_id, DataAssetSyncRunORM.status)
            .order_by(
                DataAssetSyncRunORM.source_id.asc(),
                DataAssetSyncRunORM.started_at.desc(),
                DataAssetSyncRunORM.id.desc(),
            )
            .all()
        )
        latest_sync_status_by_source: Dict[str, str] = {}
        for source_id, status in sync_rows:
            if source_id not in latest_sync_status_by_source:
                latest_sync_status_by_source[source_id] = status
        failed_sync_count = sum(
            1 for status in latest_sync_status_by_source.values() if status == "failed"
        )
        stale_profile_count = (
            self.session.query(func.count(DataAssetTableORM.id))
            .filter(DataAssetTableORM.profile_status == "stale")
            .scalar()
            or 0
        )
        drift_risk_count = (
            self.session.query(func.count(DataAssetTableORM.id))
            .filter(DataAssetTableORM.sync_status == "drift_risk")
            .scalar()
            or 0
        )
        last_sync_at = (
            self.session.query(func.max(DataAssetSyncRunORM.finished_at))
            .filter(DataAssetSyncRunORM.status == "success")
            .scalar()
        )
        return {
            "table_count": int(table_count),
            "field_count": int(field_count),
            "failed_sync_count": int(failed_sync_count),
            "stale_profile_count": int(stale_profile_count),
            "drift_risk_count": int(drift_risk_count),
            "last_sync_at": _format_utc(last_sync_at),
        }


def _apply_table(row: DataAssetTableORM, table: AssetTable) -> None:
    row.source_id = table.source_id
    row.database = table.database
    row.schema = table.source_schema
    row.name = table.name
    row.title = table.title
    row.description = table.description
    row.layer = table.layer
    row.owner = table.owner
    row.table_type = table.table_type
    row.lifecycle_status = table.lifecycle_status
    row.row_count = table.row_count
    row.partition_count = table.partition_count
    row.field_count = table.field_count
    row.profile_status = table.profile_status
    row.sync_status = table.sync_status
    row.last_synced_at = _parse_utc(table.last_synced_at)
    row.last_profiled_at = _parse_utc(table.last_profiled_at)
    row.extra_json = table.extra
    row.updated_at = _parse_utc(table.updated_at) or datetime.utcnow()


def _table_from_row(row: DataAssetTableORM) -> AssetTable:
    return AssetTable(
        id=row.id,
        source_id=row.source_id,
        database=row.database,
        schema=row.schema,
        name=row.name,
        title=row.title,
        description=row.description,
        layer=row.layer,
        owner=row.owner,
        table_type=row.table_type,
        lifecycle_status=row.lifecycle_status,
        row_count=row.row_count,
        partition_count=row.partition_count,
        field_count=row.field_count or 0,
        profile_status=row.profile_status,
        sync_status=row.sync_status,
        last_synced_at=_format_utc(row.last_synced_at),
        last_profiled_at=_format_utc(row.last_profiled_at),
        extra=row.extra_json or {},
        created_at=_format_utc(row.created_at),
        updated_at=_format_utc(row.updated_at),
    )


def _field_to_row(field: AssetField) -> DataAssetFieldORM:
    return DataAssetFieldORM(
        id=field.id,
        table_id=field.table_id,
        source_id=field.source_id,
        database=field.database,
        schema=field.source_schema,
        table_name=field.table_name,
        name=field.name,
        data_type=field.data_type,
        ordinal=field.ordinal,
        nullable=field.nullable,
        comment=field.comment,
        profile_json=field.profile,
        sensitivity_level=field.sensitivity_level,
        created_at=_parse_utc(field.created_at) or datetime.utcnow(),
        updated_at=_parse_utc(field.updated_at) or datetime.utcnow(),
    )


def _field_from_row(row: DataAssetFieldORM) -> AssetField:
    return AssetField(
        id=row.id,
        table_id=row.table_id,
        source_id=row.source_id,
        database=row.database,
        schema=row.schema,
        table_name=row.table_name,
        name=row.name,
        data_type=row.data_type,
        ordinal=row.ordinal or 0,
        nullable=bool(row.nullable),
        comment=row.comment,
        profile=row.profile_json or {},
        sensitivity_level=row.sensitivity_level,
        created_at=_format_utc(row.created_at),
        updated_at=_format_utc(row.updated_at),
    )


def _snapshot_from_row(row: DataAssetSnapshotORM) -> AssetSnapshot:
    return AssetSnapshot(
        id=row.id,
        table_id=row.table_id,
        snapshot_type=row.snapshot_type,
        payload=row.payload_json or {},
        sync_run_id=row.sync_run_id,
        created_at=_format_utc(row.created_at),
    )


def _sync_run_from_row(row: DataAssetSyncRunORM) -> AssetSyncRun:
    return AssetSyncRun(
        id=row.id,
        source_id=row.source_id,
        status=row.status,
        started_at=_format_utc(row.started_at),
        finished_at=_format_utc(row.finished_at),
        error_message=row.error_message,
        stats=row.stats_json or {},
    )


def _usage_from_row(row: DataAssetUsageORM) -> AssetUsage:
    return AssetUsage(
        id=row.id,
        table_id=row.table_id,
        field_id=row.field_id,
        source_type=row.source_type,
        source_ref=row.source_ref,
        usage_count=row.usage_count or 0,
        last_used_at=_format_utc(row.last_used_at),
        metadata=row.metadata_json or {},
    )


def _lineage_from_row(row: DataAssetLineageORM) -> AssetLineage:
    return AssetLineage(
        id=row.id,
        source_table_id=row.source_table_id,
        target_table_id=row.target_table_id,
        target_type=row.target_type,
        target_ref=row.target_ref,
        relation_type=row.relation_type,
        metadata=row.metadata_json or {},
        created_at=_format_utc(row.created_at),
    )


def _parse_utc(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    text = str(value)
    if text.endswith("Z"):
        text = text[:-1]
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def _format_utc(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    return value.replace(tzinfo=None).isoformat(timespec="seconds") + "Z"
