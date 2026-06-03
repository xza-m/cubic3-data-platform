from app.application.platform_facts.source_status import (
    is_connected_datasource_status,
    normalize_data_asset_sync_status,
    normalize_datasource_connection_status,
)


def test_datasource_success_is_connected_compatibility():
    assert is_connected_datasource_status("connected")
    assert is_connected_datasource_status("success")
    assert normalize_datasource_connection_status("success") == "connected"


def test_data_asset_sync_status_normalizes_legacy_values():
    assert normalize_data_asset_sync_status("success") == "synced"
    assert normalize_data_asset_sync_status("running") == "pending"
    assert normalize_data_asset_sync_status(None) == "unknown"
