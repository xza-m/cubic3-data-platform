from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from app.infrastructure.adapters.datasources.factory import AdapterFactory
from app.infrastructure.repositories.datasource_repository import DatasourceRepository


@dataclass(frozen=True)
class WarehouseErrorClassification:
    """数仓执行错误分类，用于 Worker 和后续重试策略。"""

    code: str
    category: str
    retryable: bool


class WarehouseExecutionError(RuntimeError):
    """执行适配器抛出的标准错误。"""

    def __init__(self, message: str, *, classification: WarehouseErrorClassification):
        super().__init__(message)
        self.code = classification.code
        self.category = classification.category
        self.retryable = classification.retryable


def classify_warehouse_error(exc: Exception) -> WarehouseErrorClassification:
    message = str(exc).lower()
    if any(keyword in message for keyword in ("timeout", "timed out", "connection reset", "network")):
        return WarehouseErrorClassification(
            code="WAREHOUSE_TRANSIENT_ERROR",
            category="transient",
            retryable=True,
        )
    if any(keyword in message for keyword in ("temporarily unavailable", "service unavailable", "throttl", "rate limit", "too many requests")):
        return WarehouseErrorClassification(
            code="WAREHOUSE_TRANSIENT_ERROR",
            category="transient",
            retryable=True,
        )
    if any(keyword in message for keyword in ("permission", "access denied", "not authorized", "no privilege")):
        return WarehouseErrorClassification(
            code="WAREHOUSE_PERMISSION_DENIED",
            category="permission",
            retryable=False,
        )
    if any(keyword in message for keyword in ("syntax", "parse error", "odps-0130161")):
        return WarehouseErrorClassification(
            code="WAREHOUSE_SQL_SYNTAX_ERROR",
            category="sql",
            retryable=False,
        )
    if any(keyword in message for keyword in ("not found", "does not exist", "unknown table", "unknown column")):
        return WarehouseErrorClassification(
            code="WAREHOUSE_OBJECT_NOT_FOUND",
            category="metadata",
            retryable=False,
        )
    if "quota" in message:
        return WarehouseErrorClassification(
            code="WAREHOUSE_QUOTA_EXCEEDED",
            category="quota",
            retryable=False,
        )
    return WarehouseErrorClassification(
        code="WAREHOUSE_EXECUTION_FAILED",
        category="unknown",
        retryable=False,
    )


class DataSourceWarehouseExecutionAdapter:
    """基于本项目 DataSource 配置的数仓执行适配器。

    第一版复用现有 DataSourceAdapter 的同步查询能力，并封装成
    submit/status/fetch/cancel 协议。长轮询和可恢复 engine query 后续
    可在该适配器内部替换，不影响控制面与 Worker 状态机。
    """

    def __init__(self, *, datasource_repository: DatasourceRepository):
        self.datasource_repository = datasource_repository
        self._results: dict[str, dict[str, Any]] = {}
        self._statuses: dict[str, str] = {}
        self._errors: dict[str, str] = {}

    def submit(self, *, source_id: int, sql: str) -> str:
        engine_query_id = f"inline_{uuid.uuid4().hex}"
        datasource = self.datasource_repository.find_by_id(int(source_id))
        if datasource is None:
            raise ValueError(f"DataSource {source_id} not found")
        adapter = AdapterFactory.create_adapter(datasource.source_type, datasource.connection_config or {})
        try:
            self._results[engine_query_id] = adapter.execute_query(sql)
            self._statuses[engine_query_id] = "SUCCEEDED"
        except Exception as exc:
            self._statuses[engine_query_id] = "FAILED"
            self._errors[engine_query_id] = str(exc)
            classification = classify_warehouse_error(exc)
            raise WarehouseExecutionError(str(exc), classification=classification) from exc
        return engine_query_id

    def get_status(self, engine_query_id: str) -> str:
        return self._statuses.get(engine_query_id, "UNKNOWN")

    def fetch_result(self, engine_query_id: str) -> dict[str, Any]:
        if engine_query_id not in self._results:
            raise ValueError(f"Query result not found for engine query {engine_query_id}")
        return self._results[engine_query_id]

    def cancel(self, engine_query_id: str) -> None:
        self._statuses[engine_query_id] = "CANCELED"
