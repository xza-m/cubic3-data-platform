# 01-01 Summary

## Outcome

- 为数据源实体补齐 `extra_config.catalog_sync` 摘要，统一暴露 `status / last_run_at / last_error / tracked_databases / database_count`。
- 新建 `PostgreSQL`、`MaxCompute` 数据源后会自动入队首次目录同步，不阻塞 HTTP 请求。
- 新增 `POST /api/v1/data-center/datasources/<id>/sync-catalog`，支持手动目录同步。
- 平台固定周期目录同步已挂到现有 `APScheduler + RQ` 组合，job id 为 `platform_datasource_catalog_sync`。

## Key Files

- `app/domain/entities/data_source.py`
- `app/application/datasource/handlers/create_datasource_handler.py`
- `app/interfaces/api/v1/datasources.py`
- `app/infrastructure/tasks/jobs/datasource_catalog_sync_job.py`
- `app/infrastructure/scheduler.py`
- `tests/unit/application/datasource/test_handler_coverage.py`
- `tests/integration/test_datasource_api.py`

## Verification

- `PYTHONPATH=. python -m pytest --no-cov tests/unit/application/datasource/test_handler_coverage.py tests/integration/test_datasource_api.py tests/integration/test_api_routes_smoke.py`
- `PYTHONPATH=. python -m pytest --no-cov tests/unit/infrastructure/test_misc_coverage.py::TestScheduler::test_init_jobs_success_and_failure_paths`

## Notes

- 目录同步的长耗时工作全部留在 RQ worker，不在 APScheduler 线程或请求线程里直连数据源。
