from __future__ import annotations


CONNECTED_DATASOURCE_STATUSES = frozenset({"connected", "success"})


def normalize_datasource_connection_status(status: str | None) -> str:
    value = (status or "unknown").strip().lower()
    if value == "success":
        return "connected"
    return value or "unknown"


def is_connected_datasource_status(status: str | None) -> bool:
    return normalize_datasource_connection_status(status) == "connected"


def normalize_data_asset_sync_status(status: str | None) -> str:
    value = (status or "unknown").strip().lower()
    if value == "success":
        return "synced"
    if value == "running":
        return "pending"
    return value or "unknown"
