# 01-02 Summary

## Outcome

- 物理表预览统一返回 `preview_limit=20`、`sample_rows`、`sample_columns`、`fields`、`statistics`、`table_info`。
- 文件上传扩展为 `CSV / XLS / XLSX`，并复用统一文件元数据解析服务。
- 三类数据集的 `/sync-schema` 都改为后台入队，统一由 `dataset_sync_job` 回写 `sync_status / last_sync_at / sync_error`。
- Preview / sync 相关失败路径已透出 `details.reason_code`，前端可区分 `object_not_found / schema_fetch_failed / query_timeout / file_parse_failed` 等原因。

## Key Files

- `app/application/dataset/handlers/preview_dataset_handler.py`
- `app/application/dataset/services/dataset_metadata_refresh_service.py`
- `app/infrastructure/tasks/jobs/dataset_sync_job.py`
- `app/application/dataset/handlers/sync_schema_handler.py`
- `app/interfaces/api/v1/datasets.py`
- `app/interfaces/api/v1/files.py`
- `app/interfaces/api/middleware/error_handler.py`

## Verification

- `PYTHONPATH=. python -m pytest --no-cov tests/unit/application/dataset/test_handler_coverage.py tests/integration/test_dataset_api.py tests/integration/test_api_routes_smoke.py`
- `PYTHONPATH=. python -m pytest --no-cov tests/unit/application/query/test_handler_coverage.py::test_execute_sql_preview_command_and_handler_cover_core_paths tests/unit/infrastructure/test_small_modules.py::TestErrorHandlers::test_register_error_handlers_maps_exceptions`

## Notes

- 文件数据集仍然只支持“新建”，不提供覆盖旧对象的入口；这与 Phase 1 的范围约束保持一致。
