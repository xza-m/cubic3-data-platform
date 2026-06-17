"""dw-query-gateway telemetry client."""

from __future__ import annotations

from typing import Any

import requests


class GatewayTelemetryError(RuntimeError):
    """Gateway telemetry 调用失败。"""


class GatewayQueryError(RuntimeError):
    """Gateway 查询调用失败。"""


class GatewayTelemetryClient:
    """data-platform 只读代理 gateway 可观测数据。"""

    def __init__(self, *, base_url: str, platform_service_token: str, timeout_seconds: int = 5) -> None:
        self._base_url = base_url.rstrip("/")
        self._token = platform_service_token
        self._timeout_seconds = timeout_seconds

    def get_observability_snapshot(
        self,
        *,
        window: str = "24h",
        bucket: str = "1h",
        query_run_limit: int = 200,
    ) -> dict[str, Any]:
        """聚合 gateway 新版可观测接口，供控制台一次性渲染看板。"""

        overview = self.get_overview(window=window)
        timeseries = self.get_timeseries(window=window, bucket=bucket)
        breakdowns = self.get_breakdowns(window=window)
        contract_completeness = self.get_contract_completeness(window=window)
        result_export_storage = self.get_result_export_storage(window=window)
        security = self.get_security(window=window)
        workers = self.get_workers(window=window)
        query_runs = self.list_query_runs(limit=query_run_limit)
        return build_gateway_observability_snapshot(
            overview=overview,
            timeseries=timeseries,
            breakdowns=breakdowns,
            contract_completeness=contract_completeness,
            result_export_storage=result_export_storage,
            security=security,
            workers=workers,
            query_runs=query_runs,
            window=window,
            bucket=bucket,
        )

    def get_overview(self, *, window: str = "24h") -> dict[str, Any]:
        return self._get("/api/v1/telemetry/gateway/overview", params={"window": window})

    def get_timeseries(self, *, window: str = "24h", bucket: str = "1h") -> dict[str, Any]:
        return self._get(
            "/api/v1/telemetry/gateway/timeseries",
            params={"window": window, "bucket": bucket},
        )

    def get_breakdowns(self, *, window: str = "24h") -> dict[str, Any]:
        return self._get("/api/v1/telemetry/gateway/breakdowns", params={"window": window})

    def get_contract_completeness(self, *, window: str = "24h") -> dict[str, Any]:
        return self._get("/api/v1/telemetry/gateway/contract-completeness", params={"window": window})

    def get_result_export_storage(self, *, window: str = "24h") -> dict[str, Any]:
        return self._get("/api/v1/telemetry/gateway/result-export-storage", params={"window": window})

    def get_security(self, *, window: str = "24h") -> dict[str, Any]:
        return self._get("/api/v1/telemetry/gateway/security", params={"window": window})

    def get_workers(self, *, window: str = "24h") -> dict[str, Any]:
        return self._get("/api/v1/telemetry/gateway/workers", params={"window": window})

    def get_readiness(self) -> dict[str, Any]:
        return self._get_raw("/readyz")

    def get_health(self) -> dict[str, Any]:
        return self._get_raw("/healthz")

    def list_query_runs(self, *, limit: int = 50) -> dict[str, Any]:
        return self._get("/api/v1/telemetry/gateway/query-runs", params={"limit": limit})

    def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        payload = self._get_raw(path, params=params)
        return payload.get("data") or {}

    def _get_raw(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        response = requests.get(
            f"{self._base_url}{path}",
            params=params,
            headers={"X-Platform-Service-Token": self._token},
            timeout=self._timeout_seconds,
        )
        if response.status_code >= 400:
            raise GatewayTelemetryError(f"gateway telemetry failed: {response.status_code}")
        payload = response.json()
        if payload.get("success") is False:
            error = payload.get("error") or {}
            raise GatewayTelemetryError(str(error.get("message") or "gateway telemetry failed"))
        return payload


class GatewayQueryClient:
    """data-platform 向 dw-query-gateway 下发已授权查询。"""

    def __init__(
        self,
        *,
        base_url: str,
        platform_service_token: str,
        timeout_seconds: int = 5,
        sql_dry_run_path: str = "/api/v1/queries/dry-run",
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._token = platform_service_token
        self._timeout_seconds = timeout_seconds
        self._sql_dry_run_path = _normalize_path(sql_dry_run_path)

    def execute_sql(
        self,
        *,
        sql: str,
        access_context: dict[str, Any],
        wait_for_completion: bool = False,
        idempotency_key: str | None = None,
        runtime_options: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        response = requests.post(
            f"{self._base_url}/api/v1/queries",
            json={
                "sql": sql,
                "project": _default_project(access_context),
                "wait_for_completion": wait_for_completion,
                "access_context": access_context,
                "idempotency_key": idempotency_key,
                "runtime_options": runtime_options or {},
            },
            headers={"X-Platform-Service-Token": self._token},
            timeout=self._timeout_seconds,
        )
        if response.status_code >= 400:
            raise GatewayQueryError(f"gateway query failed: {response.status_code}")
        payload = response.json()
        if payload.get("success") is False:
            error = payload.get("error") or {}
            raise GatewayQueryError(str(error.get("message") or "gateway query failed"))
        return payload.get("data") or {}

    def dry_run_sql(self, payload: dict[str, Any]) -> dict[str, Any]:
        """调用 gateway 侧物理 SQL dry-run；gateway 不接收 semantic spec。"""

        payload = dict(payload or {})
        if "semantic_spec" in payload:
            raise GatewayQueryError("gateway SQL dry-run does not accept semantic_spec")
        sql = str(payload.get("sql") or "").strip()
        if not sql:
            raise GatewayQueryError("gateway SQL dry-run requires sql")
        access_context = payload.get("access_context")
        if not isinstance(access_context, dict):
            access_context = {}
        runtime_options = payload.get("runtime_options")
        if not isinstance(runtime_options, dict):
            runtime_options = {}
        runtime_options = {**runtime_options, "dry_run": True}

        response = requests.post(
            f"{self._base_url}{self._sql_dry_run_path}",
            json={
                "sql": sql,
                "project": payload.get("project") or _default_project(access_context),
                "access_context": access_context,
                "idempotency_key": payload.get("idempotency_key"),
                "runtime_options": runtime_options,
            },
            headers={"X-Platform-Service-Token": self._token},
            timeout=self._timeout_seconds,
        )
        if response.status_code >= 400:
            raise GatewayQueryError(f"gateway SQL dry-run failed: {response.status_code}")
        response_payload = response.json()
        if response_payload.get("success") is False:
            error = response_payload.get("error") or {}
            raise GatewayQueryError(str(error.get("message") or "gateway SQL dry-run failed"))
        return response_payload.get("data") or {}


def _default_project(access_context: dict[str, Any]) -> str | None:
    for item in access_context.get("resource_set_physical") or []:
        if isinstance(item, dict) and item.get("project"):
            return str(item["project"])
    return None


def _normalize_path(path: str | None) -> str:
    value = str(path or "").strip() or "/api/v1/queries/dry-run"
    return value if value.startswith("/") else f"/{value}"


def build_gateway_observability_snapshot(
    *,
    overview: dict[str, Any],
    timeseries: dict[str, Any],
    breakdowns: dict[str, Any],
    contract_completeness: dict[str, Any],
    result_export_storage: dict[str, Any],
    security: dict[str, Any],
    workers: dict[str, Any],
    query_runs: dict[str, Any],
    window: str,
    bucket: str,
) -> dict[str, Any]:
    """把 gateway 新指标接口整理成看板快照，保持 gateway 为唯一事实源。"""

    sections = {
        "overview": overview,
        "timeseries": timeseries,
        "breakdowns": breakdowns,
        "contract_completeness": contract_completeness,
        "result_export_storage": result_export_storage,
        "security": security,
        "workers": workers,
    }
    overview_meta = _metric_meta(overview)
    timeseries_data = _metric_data(timeseries)
    query_run_items = query_runs.get("items") if isinstance(query_runs, dict) else []
    if not isinstance(query_run_items, list):
        query_run_items = []
    summary = build_gateway_summary_from_sections(
        overview=overview,
        breakdowns=breakdowns,
        result_export_storage=result_export_storage,
        security=security,
        workers=workers,
    )
    return {
        "window": overview_meta.get("window") or window,
        "bucket": timeseries_data.get("bucket") or bucket,
        "since": overview_meta.get("since"),
        "until": overview_meta.get("until"),
        "generated_at": overview_meta.get("generated_at"),
        "metric_version": overview_meta.get("metric_version"),
        "source": overview_meta.get("source"),
        "is_partial": any(bool(_metric_meta(section).get("is_partial")) for section in sections.values()),
        "sections": {name: _metric_meta(section) for name, section in sections.items()},
        "summary": summary,
        "overview": _metric_data(overview),
        "timeseries": {
            "bucket": timeseries_data.get("bucket") or bucket,
            "points": _list(timeseries_data.get("points")),
        },
        "breakdowns": _metric_data(breakdowns),
        "contract_completeness": _metric_data(contract_completeness),
        "result_export_storage": _metric_data(result_export_storage),
        "security": _metric_data(security),
        "workers": _metric_data(workers),
        "query_runs": {
            "items": query_run_items,
            "total": int(_number(query_runs, "total", default=len(query_run_items))),
        },
    }


def build_gateway_summary_from_sections(
    *,
    overview: dict[str, Any],
    breakdowns: dict[str, Any] | None = None,
    result_export_storage: dict[str, Any] | None = None,
    security: dict[str, Any] | None = None,
    workers: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """从 gateway 新版指标接口生成看板 summary。"""

    overview_data = _metric_data(overview)
    query = dict(overview_data.get("query") or {})
    runtime = dict(overview_data.get("runtime") or {})
    breakdown_data = _metric_data(breakdowns or {})
    export_storage_data = _metric_data(result_export_storage or {})
    export = dict(export_storage_data.get("export") or {})
    security_data = _metric_data(security or {})
    worker_data = _metric_data(workers or {})
    meta = _metric_meta(overview)

    query_count = int(_number(query, "total"))
    success_count = int(_number(query, "success"))
    failed_count = int(_number(query, "failed"))
    timeout_count = int(_number(query, "timeout"))
    rejected_count = int(_number(query, "rejected", default=_number(security_data, "sql_guard_rejected_count")))
    success_rate = _number(
        query,
        "success_rate",
        default=round((success_count / query_count) * 100, 2) if query_count else 100,
    )

    normalized = {
        "query_count": query_count,
        "success_count": success_count,
        "failed_count": failed_count,
        "physical_denied_count": int(_number(query, "physical_denied", default=_number(security_data, "physical_denied_count"))),
        "stability": success_rate,
        "success_rate": success_rate,
        "timeout_rate": _number(query, "timeout_rate"),
        "by_data_level": _counts_from_breakdown(breakdown_data.get("data_level"), exclude_missing=True),
        "queued_count": int(_number(runtime, "queued")),
        "running_count": int(_number(runtime, "running")),
        "pending_count": int(_number(runtime, "pending")),
        "avg_queue_wait_ms": _number(runtime, "queue_wait_avg_ms"),
        "max_current_queue_wait_ms": _number(runtime, "queue_wait_current_max_ms"),
        "queue_wait_p95_ms": _number(runtime, "queue_wait_p95_ms"),
        "avg_execute_ms": _number(runtime, "execute_avg_ms"),
        "execute_p95_ms": _number(runtime, "execute_p95_ms"),
        "remote_timeout_count": 0,
        "client_wait_timeout_count": timeout_count,
        "timeout_count": timeout_count,
        "rejected_count": rejected_count,
        "export_request_count": int(_number(export, "request")),
        "export_started_count": int(_number(export, "started")),
        "export_not_ready_count": int(_number(export, "not_ready")),
        "export_success_count": int(_number(export, "success")),
        "export_failure_count": int(_number(export, "failure")),
        "export_failure_by_reason": dict(export.get("failure_by_reason") or {}),
        "result_rejected_count": int(_number(export_storage_data, "result_rejected_count")),
        "result_rejected_by_reason": dict(export_storage_data.get("result_rejected_by_reason") or {}),
        "result_too_large_rejected_count": int(_number(export_storage_data, "result_too_large_rejected_count")),
        "result_row_too_large_rejected_count": int(_number(export_storage_data, "result_row_too_large_rejected_count")),
        "max_result_rejected_bytes": int(_number(export_storage_data, "max_result_rejected_bytes")),
        "max_result_rejected_row_bytes": int(_number(export_storage_data, "max_result_rejected_row_bytes")),
        "result_object_count": int(_number(export_storage_data, "result_object_count")),
        "spool_object_count": int(_number(export_storage_data, "spool_result_count")),
        "spool_result_total_bytes": int(_number(export_storage_data, "spool_result_total_bytes")),
        "spool_age_buckets": dict(export_storage_data.get("spool_age_buckets") or {}),
        "cleanup_lag_seconds": int(_number(export_storage_data, "cleanup_lag_seconds")),
        "publish_conflict_count": int(_number(export_storage_data, "publish_conflict_count")),
        "auth_denied_count": int(_number(security_data, "auth_denied_count")),
        "invalid_token_count": int(_number(security_data, "invalid_token_count")),
        "missing_token_count": int(_number(security_data, "missing_token_count")),
        "legacy_protocol_count": int(_number(security_data, "legacy_protocol_count")),
        "sql_guard_rejected_count": int(_number(security_data, "sql_guard_rejected_count", default=rejected_count)),
        "credential_missing_count": int(_number(security_data, "credential_missing_count")),
        "credential_invalid_count": int(_number(security_data, "credential_invalid_count")),
        "worker_heartbeat_stale_count": int(_number(worker_data, "heartbeat_stale_count")),
        "worker_orphan_lease_reclaimed_count": int(_number(worker_data, "orphan_lease_reclaimed_count")),
        "worker_housekeeping_completed_count": int(_number(worker_data, "housekeeping_completed_count")),
        "gateway_readyz_degraded_count": int(_number(worker_data, "readyz_degraded_count")),
        "active_worker_count": int(_number(worker_data, "active_worker_count")),
        "live_worker_count": int(_number(worker_data, "live_worker_count")),
        "draining_worker_count": int(_number(worker_data, "draining_worker_count")),
        "worker_capacity": int(_number(worker_data, "worker_capacity")),
        "generated_at": meta.get("generated_at"),
        "window": {
            "window": meta.get("window"),
            "since": meta.get("since"),
            "until": meta.get("until"),
        },
        "metric_version": meta.get("metric_version"),
        "source": meta.get("source"),
    }
    return normalized


def _metric_data(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {}
    data = payload.get("data")
    return data if isinstance(data, dict) else {}


def _metric_meta(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {}
    return {
        key: payload.get(key)
        for key in ("window", "since", "until", "generated_at", "metric_version", "source", "is_partial")
        if key in payload
    }


def _counts_from_breakdown(value: Any, *, exclude_missing: bool = False) -> dict[str, int]:
    result: dict[str, int] = {}
    for item in _list(value):
        if not isinstance(item, dict):
            continue
        key = str(item.get("key") or "").strip()
        if not key or (exclude_missing and key == "missing"):
            continue
        result[key] = int(_number(item, "count"))
    return result


def _list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _number(source: Any, key: str, *, default: float = 0) -> float:
    if not isinstance(source, dict):
        return default
    value = source.get(key)
    try:
        return float(value)
    except (TypeError, ValueError):
        return default
