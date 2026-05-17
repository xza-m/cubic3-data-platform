from __future__ import annotations

from datetime import datetime
from typing import Any, Iterable, Protocol


class IQueryExecutionRepository(Protocol):
    """查询执行仓储端口。"""

    def create_job(self, **kwargs: Any):
        ...

    def get_by_id(self, query_id: str):
        ...

    def find_for_principal(self, query_id: str, principal_id: str):
        ...

    def claim_next_query(self, *, worker_id: str, lease_until: datetime):
        ...

    def transition_status(self, query_id: str, next_status: str, *, event_type: str, payload: dict[str, Any] | None = None):
        ...


class IResultStore(Protocol):
    """查询结果存储端口。"""

    def persist_rows(self, *, query_id: str, columns: list[str], rows: Iterable[dict[str, Any]], expires_at: datetime | None = None):
        ...


class WarehouseExecutionAdapter(Protocol):
    """数仓执行适配器端口。"""

    def submit(self, *, source_id: int, sql: str) -> str:
        ...

    def get_status(self, engine_query_id: str) -> str:
        ...

    def fetch_result(self, engine_query_id: str) -> Iterable[dict[str, Any]]:
        ...

    def cancel(self, engine_query_id: str) -> None:
        ...
