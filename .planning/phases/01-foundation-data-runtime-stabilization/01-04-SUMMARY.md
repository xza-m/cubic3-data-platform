# 01-04 Summary

## Outcome

- `platform-data-inventory` Playwright 回归已扩展到目录同步摘要、三类数据集展示与三种注册入口可见性。
- `tests/integration/test_api_routes_smoke.py` 已覆盖 `sync-catalog` 与 `sync-schema` 路由非 404 保证。
- Phase 1 相关基线文档已回写：明确 `PostgreSQL + MaxCompute`、`APScheduler + RQ` 分工、`physical / virtual / file` 三类数据集，以及 `CSV / XLS / XLSX` 文件支持边界。
- 文档口径保持保守：当前目标是“支撑联调与验证”，不是一键部署收口。

## Key Files

- `frontend/tests/e2e-node/platform-data-inventory.spec.ts`
- `tests/integration/test_api_routes_smoke.py`
- `README.md`
- `docs/QUICK_START.md`
- `docs/STARTUP_GUIDE.md`
- `docs/runbooks/local-dev.md`
- `docs/TECH_STACK_AND_ARCHITECTURE.md`
- `frontend/README.md`

## Verification

- `make test-regression-platform-data`
- `PYTHONPATH=. python -m pytest --no-cov tests/integration/test_api_routes_smoke.py`
- `make verify-docs`
- `make docs-impact VERIFY_FILES="README.md docs/QUICK_START.md docs/STARTUP_GUIDE.md docs/runbooks/local-dev.md docs/TECH_STACK_AND_ARCHITECTURE.md frontend/README.md"`

## Notes

- `make test-regression-platform-data` 首次在沙箱里因 Vite 监听 `127.0.0.1:3100` 失败；提权重跑后通过，问题来自运行环境权限，不是回归用例本身。
