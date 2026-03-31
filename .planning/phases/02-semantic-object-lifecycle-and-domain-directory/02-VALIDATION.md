---
phase: 2
slug: semantic-object-lifecycle-and-domain-directory
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-25
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `pytest + Vitest + Playwright`（统一通过 `Makefile` 编排） |
| **Config file** | `Makefile`、`frontend/vitest.config.ts`、`frontend/playwright.config.ts` |
| **Quick run command** | `make test-regression-semantic` |
| **Full suite command** | `make verify-semantic` |
| **Estimated runtime** | ~240 seconds |

---

## Sampling Rate

- **After every task commit:** 运行该任务对应的定向 `pytest` / `Vitest` / `Playwright` 命令
- **After every plan wave:** 运行 `make test-regression-semantic`
- **Before `$gsd-verify-work`:** `make verify-semantic` 必须为绿色；如果本阶段改了文档，再补 `make verify-docs`
- **Max feedback latency:** 240 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | SEM-03 / SEM-05 | unit | `PYTHONPATH=. python -m pytest --no-cov tests/unit/application/semantic/test_domain_modeling_service.py tests/unit/application/semantic/test_domain_canvas_service.py tests/unit/application/semantic/test_semantic_definition_service.py` | ✅ | ⬜ pending |
| 02-01-02 | 01 | 1 | SEM-01 / SEM-03 / SEM-05 | integration | `PYTHONPATH=. python -m pytest --no-cov tests/integration/test_semantic_api.py` | ✅ | ⬜ pending |
| 02-02-01 | 02 | 1 | SEM-02 / SEM-04 | unit | `PYTHONPATH=. python -m pytest --no-cov tests/unit/application/semantic/test_semantic_definition_service.py tests/unit/application/semantic/test_view_publish_service.py tests/unit/application/semantic/test_semantic_service.py` | ✅ | ⬜ pending |
| 02-02-02 | 02 | 1 | DOM-01 / DOM-03 / DOM-04 | frontend-unit | `cd frontend && npm run test:unit -- src/pages/Semantic/DomainList.page.test.tsx src/pages/Semantic/DevTools.page.test.tsx` | ✅ | ⬜ pending |
| 02-03-01 | 03 | 2 | SEM-01 / SEM-02 / SEM-05 | frontend-unit | `cd frontend && npm run test:unit -- src/pages/Semantic/CubeList.page.test.tsx src/pages/Semantic/CubeStudio.page.test.tsx src/pages/Semantic/ViewDetail.page.test.tsx src/pages/Semantic/CubeDetail.page.test.tsx` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 2 | DOM-02 / DOM-04 | frontend-e2e | `cd frontend && npm exec -- playwright test tests/e2e-node/semantic.visual.spec.ts tests/e2e-node/domain-catalog.spec.ts tests/e2e-node/domain-publish.spec.ts tests/e2e-node/cube-browse.spec.ts` | ✅ | ⬜ pending |
| 02-04-01 | 04 | 3 | SEM-05 / DOM-03 | regression | `make test-regression-semantic` | ✅ | ⬜ pending |
| 02-04-02 | 04 | 3 | SEM-01 / SEM-02 / SEM-03 / SEM-04 / DOM-01 / DOM-02 / DOM-03 / DOM-04 | full | `make verify-semantic && make verify-docs` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/pages/Semantic/ViewDetail.page.test.tsx` — 补齐 `View` 详情页的生命周期与关联展示回归
- [ ] `frontend/src/pages/Semantic/CubeDetail.page.test.tsx` — 补齐 `Cube` 详情页多领域投影与治理入口回归

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 真实可写语义目录中的领域发布、Cube 归属更新与 YAML 回写副作用 | SEM-03 / DOM-02 | 浏览器 smoke 会修改语义资产文件，且依赖本地/联调环境中的真实语义目录 | 在可写语义目录环境执行 `make smoke-semantic`，确认领域发布后 YAML 与画布状态一致，且不会破坏已有资产 |
| 多领域投影在目录、详情与工作台导航中的可理解性 | SEM-05 / DOM-04 | 自动化可验证字段存在，但难以判断治理入口是否足够清晰 | 在浏览器中依次打开 `DomainList`、`CubeDetail`、`ViewDetail`、`DevTools`，确认同一 `Cube` 被多个领域引用时，列表摘要、详情投影和跳转入口都可理解 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 240s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-25
