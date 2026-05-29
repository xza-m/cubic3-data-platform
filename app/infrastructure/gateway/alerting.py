"""dw-query-gateway 运行态告警评价。"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from typing import Any


@dataclass(frozen=True)
class GatewayAlertThresholds:
    """控制台默认告警阈值，运行事实仍来自 dw-query-gateway。"""

    stability_warning: float = 99.0
    stability_critical: float = 95.0
    pending_warning: int = 1
    pending_critical: int = 10
    current_queue_wait_warning_ms: float = 0
    current_queue_wait_critical_ms: float = 300_000
    avg_queue_wait_warning_ms: float = 60_000
    avg_queue_wait_critical_ms: float = 300_000
    timeout_warning_count: int = 1
    rejected_warning_count: int = 1
    export_failure_warning_count: int = 1
    publish_conflict_warning_count: int = 1


Severity = str

_SEVERITY_RANK: dict[Severity, int] = {
    "healthy": 0,
    "warning": 1,
    "critical": 2,
}


def evaluate_gateway_alerts(
    summary: dict[str, Any] | None,
    readiness: dict[str, Any] | None = None,
    *,
    telemetry_error: str | None = None,
    thresholds: GatewayAlertThresholds | None = None,
) -> dict[str, Any]:
    """基于 gateway summary / readyz 输出控制台告警，不生成第二套运行事实。"""

    threshold = thresholds or GatewayAlertThresholds()
    source = dict(summary or {})
    ready = dict(readiness or {})
    alerts: list[dict[str, Any]] = []

    def add_alert(
        *,
        code: str,
        severity: Severity,
        title: str,
        message: str,
        value: Any = None,
        threshold_value: Any = None,
    ) -> None:
        alerts.append(
            {
                "code": code,
                "severity": severity,
                "title": title,
                "message": message,
                "value": value,
                "threshold": threshold_value,
            }
        )

    if telemetry_error:
        add_alert(
            code="gateway_telemetry_unavailable",
            severity="critical",
            title="Gateway 遥测不可用",
            message=telemetry_error,
        )

    _append_readiness_alerts(ready, add_alert)

    stability = _number(source, "stability", default=100)
    if stability < threshold.stability_critical:
        add_alert(
            code="gateway_stability_low",
            severity="critical",
            title="Gateway 稳定性低于严重阈值",
            message=f"当前稳定性 {stability:.2f}% 低于 {threshold.stability_critical:.2f}%",
            value=round(stability, 2),
            threshold_value=threshold.stability_critical,
        )
    elif stability < threshold.stability_warning:
        add_alert(
            code="gateway_stability_low",
            severity="warning",
            title="Gateway 稳定性低于预警阈值",
            message=f"当前稳定性 {stability:.2f}% 低于 {threshold.stability_warning:.2f}%",
            value=round(stability, 2),
            threshold_value=threshold.stability_warning,
        )

    pending_count = int(_number(source, "pending_count"))
    if pending_count >= threshold.pending_critical:
        add_alert(
            code="gateway_pending_backlog",
            severity="critical",
            title="Gateway 等待队列积压",
            message=f"当前等待查询 {pending_count} 个，达到严重阈值",
            value=pending_count,
            threshold_value=threshold.pending_critical,
        )
    elif pending_count >= threshold.pending_warning:
        add_alert(
            code="gateway_pending_backlog",
            severity="warning",
            title="Gateway 等待队列出现积压",
            message=f"当前等待查询 {pending_count} 个",
            value=pending_count,
            threshold_value=threshold.pending_warning,
        )

    current_queue_wait_ms = _number(source, "max_current_queue_wait_ms")
    if current_queue_wait_ms >= threshold.current_queue_wait_critical_ms:
        add_alert(
            code="gateway_queue_wait_high",
            severity="critical",
            title="Gateway 当前排队等待过长",
            message=f"当前最大等待 {current_queue_wait_ms:.0f}ms",
            value=round(current_queue_wait_ms),
            threshold_value=threshold.current_queue_wait_critical_ms,
        )
    elif current_queue_wait_ms > threshold.current_queue_wait_warning_ms:
        add_alert(
            code="gateway_queue_wait_high",
            severity="warning",
            title="Gateway 当前存在排队等待",
            message=f"当前最大等待 {current_queue_wait_ms:.0f}ms",
            value=round(current_queue_wait_ms),
            threshold_value=threshold.current_queue_wait_warning_ms,
        )

    avg_queue_wait_ms = _number(source, "avg_queue_wait_ms")
    if avg_queue_wait_ms >= threshold.avg_queue_wait_critical_ms:
        add_alert(
            code="gateway_avg_queue_wait_high",
            severity="critical",
            title="Gateway 平均排队等待过长",
            message=f"平均等待 {avg_queue_wait_ms:.0f}ms",
            value=round(avg_queue_wait_ms),
            threshold_value=threshold.avg_queue_wait_critical_ms,
        )
    elif avg_queue_wait_ms >= threshold.avg_queue_wait_warning_ms:
        add_alert(
            code="gateway_avg_queue_wait_high",
            severity="warning",
            title="Gateway 平均排队等待偏高",
            message=f"平均等待 {avg_queue_wait_ms:.0f}ms",
            value=round(avg_queue_wait_ms),
            threshold_value=threshold.avg_queue_wait_warning_ms,
        )

    _append_counter_alert(
        source,
        add_alert,
        key="timeout_count",
        code="gateway_timeout_seen",
        title="Gateway 查询超时",
        threshold_value=threshold.timeout_warning_count,
    )
    _append_counter_alert(
        source,
        add_alert,
        key="rejected_count",
        code="gateway_rejected_seen",
        title="Gateway 执行拒绝",
        threshold_value=threshold.rejected_warning_count,
    )
    _append_counter_alert(
        source,
        add_alert,
        key="export_failure_count",
        code="gateway_export_failure_seen",
        title="Gateway 导出失败",
        threshold_value=threshold.export_failure_warning_count,
    )
    _append_counter_alert(
        source,
        add_alert,
        key="publish_conflict_count",
        code="gateway_publish_conflict_seen",
        title="Gateway 结果发布冲突",
        threshold_value=threshold.publish_conflict_warning_count,
    )

    alerts.sort(key=lambda item: _SEVERITY_RANK.get(str(item.get("severity")), 0), reverse=True)
    status = alerts[0]["severity"] if alerts else "healthy"
    return {
        "status": status,
        "alerts": alerts,
        "thresholds": asdict(threshold),
        "readiness": ready,
        "summary": {
            "query_count": int(_number(source, "query_count")),
            "success_count": int(_number(source, "success_count")),
            "failed_count": int(_number(source, "failed_count")),
            "stability": stability,
            "pending_count": pending_count,
            "avg_queue_wait_ms": avg_queue_wait_ms,
            "max_current_queue_wait_ms": current_queue_wait_ms,
            "timeout_count": int(_number(source, "timeout_count")),
        },
        "evaluated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
    }


def _append_readiness_alerts(readiness: dict[str, Any], add_alert) -> None:
    status = str(readiness.get("status") or "").lower()
    if status and status != "healthy":
        add_alert(
            code="gateway_readiness_unhealthy",
            severity="critical",
            title="Gateway readyz 非健康",
            message=f"readyz 状态为 {status}",
            value=status,
            threshold_value="healthy",
        )

    checks = readiness.get("checks") or {}
    if not isinstance(checks, dict):
        return
    failed = {
        str(name): value
        for name, value in checks.items()
        if str(value).lower() not in {"ok", "healthy", "0"}
    }
    if failed:
        add_alert(
            code="gateway_ready_check_failed",
            severity="critical",
            title="Gateway readyz 检查失败",
            message=", ".join(f"{name}={value}" for name, value in failed.items()),
            value=failed,
            threshold_value="ok",
        )


def _append_counter_alert(
    source: dict[str, Any],
    add_alert,
    *,
    key: str,
    code: str,
    title: str,
    threshold_value: int,
) -> None:
    value = int(_number(source, key))
    if value < threshold_value:
        return
    add_alert(
        code=code,
        severity="warning",
        title=title,
        message=f"{title}累计 {value} 次",
        value=value,
        threshold_value=threshold_value,
    )


def _number(source: dict[str, Any], key: str, *, default: float = 0) -> float:
    value = source.get(key)
    try:
        return float(value)
    except (TypeError, ValueError):
        return default
