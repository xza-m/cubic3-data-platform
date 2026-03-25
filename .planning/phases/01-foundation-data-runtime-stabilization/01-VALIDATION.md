---
phase: 1
slug: foundation-data-runtime-stabilization
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-25
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `pytest + Vitest + Playwright`（统一通过 `Makefile` 编排） |
| **Config file** | `Makefile`、`frontend/vitest.config.ts`、`frontend/playwright.config.ts` |
| **Quick run command** | `make test-regression-platform-data` |
| **Full suite command** | `make verify-backend && make verify-frontend` |
| **Estimated runtime** | ~180 seconds |

---

## Sampling Rate

- **After every task commit:** 运行该任务对应的定向 pytest / Vitest / Playwright 命令
- **After every plan wave:** 运行 `make test-regression-platform-data`
- **Before `$gsd-verify-work`:** `make verify-backend && make verify-frontend` 必须为绿色
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | DATA-01 | unit | `PYTHONPATH=. python -m pytest --no-cov tests/unit/application/datasource/test_handler_coverage.py` | ✅ | ⬜ pending |
| 01-01-02 | 01 | 1 | DATA-02 | integration | `PYTHONPATH=. python -m pytest --no-cov tests/integration/test_datasource_api.py` | ✅ | ⬜ pending |
| 01-01-03 | 01 | 1 | DATA-05 | smoke | `PYTHONPATH=. python -m pytest --no-cov tests/integration/test_api_routes_smoke.py` | ✅ | ⬜ pending |
| 01-02-01 | 02 | 1 | DATA-04 | unit | `PYTHONPATH=. python -m pytest --no-cov tests/unit/application/dataset/test_handler_coverage.py` | ✅ | ⬜ pending |
| 01-02-02 | 02 | 1 | DATA-03 | integration | `PYTHONPATH=. python -m pytest --no-cov tests/integration/test_dataset_api.py` | ✅ | ⬜ pending |
| 01-02-03 | 02 | 1 | DATA-05 | smoke | `PYTHONPATH=. python -m pytest --no-cov tests/integration/test_api_routes_smoke.py` | ✅ | ⬜ pending |
| 01-03-01 | 03 | 2 | DATA-01 | frontend-unit | `cd frontend && npm run test:unit -- src/pages/Datasources.page.test.tsx` | ✅ | ⬜ pending |
| 01-03-02 | 03 | 2 | DATA-03 | frontend-unit | `cd frontend && npm run test:unit -- src/pages/Datasets.page.test.tsx src/pages/DatasetRegister.page.test.tsx src/pages/FileDatasetRegister.page.test.tsx` | ❌ W0 | ⬜ pending |
| 01-03-03 | 03 | 2 | DATA-04 | frontend-e2e | `cd frontend && npm exec -- playwright test tests/e2e-node/platform-data-inventory.spec.ts` | ✅ | ⬜ pending |
| 01-04-01 | 04 | 3 | DATA-05 | regression | `make test-regression-platform-data` | ✅ | ⬜ pending |
| 01-04-02 | 04 | 3 | OPS-01 | full | `make verify-backend && make verify-frontend && make verify-docs` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/pages/DatasetRegister.page.test.tsx` — 补齐物理表注册流程页面回归
- [ ] `frontend/src/pages/FileDatasetRegister.page.test.tsx` — 补齐文件注册流程页面回归

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PostgreSQL 与 MaxCompute 真机接入、首次目录同步与错误反馈 | DATA-01 / DATA-02 / DATA-05 | 依赖真实网络、凭证和外部系统状态 | 在内网联调环境创建各 1 个数据源，确认创建后会自动排队首次同步；人为制造错误凭证，确认列表展示摘要、详情展示完整错误 |
| 平台统一固定周期同步实际触发 | DATA-02 | 依赖真实 scheduler 时钟与运行进程 | 在联调环境等待或临时调整 cron，确认 APScheduler 触发后会把 datasource / dataset sync job 投递到 RQ，并能回写状态 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 180s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-25
