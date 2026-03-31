---
phase: 3
slug: semantic-runtime-and-query-trust
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-26
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `pytest + Vitest + Playwright`（统一通过 `Makefile` 编排） |
| **Config file** | `Makefile`、`frontend/vitest.config.ts`、`frontend/playwright.config.ts` |
| **Quick run command** | `make test-regression-semantic` |
| **Full suite command** | `make verify-semantic` |
| **Estimated runtime** | ~300 seconds |

---

## Sampling Rate

- **After every task commit:** 运行该任务对应的定向 `pytest` / `Vitest` / `Playwright` 命令
- **After every plan wave:** 运行 `make test-regression-semantic`
- **Before `$gsd-verify-work`:** `make verify-semantic` 必须为绿色；如果本阶段改了文档，再补 `make verify-docs`
- **Max feedback latency:** 300 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | RUN-01 / RUN-02 / QRY-01 | unit | `PYTHONPATH=. python -m pytest --no-cov tests/unit/application/semantic/test_semantic_query_service.py` | ✅ | ⬜ pending |
| 03-01-02 | 01 | 1 | RUN-03 / RUN-04 / RUN-05 / QRY-02 | integration | `PYTHONPATH=. python -m pytest --no-cov tests/integration/test_semantic_api.py tests/unit/application/semantic/test_schema_sync.py tests/unit/application/semantic/test_view_publish_service.py` | ✅ | ⬜ pending |
| 03-02-01 | 02 | 2 | RUN-01 / RUN-02 / QRY-01 / QRY-03 | frontend-unit | `cd frontend && npm run test:unit -- src/components/Semantic/DevTools/CompileDebugTab.test.tsx src/pages/Semantic/DevTools.page.test.tsx` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 2 | QRY-02 / RUN-05 | frontend-unit | `cd frontend && npm run test:unit -- src/components/Semantic/DevTools/SchemaSyncTab.test.tsx src/pages/Semantic/DevTools.page.test.tsx` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 2 | RUN-03 / RUN-04 / QRY-04 | frontend-unit | `cd frontend && npm run test:unit -- src/pages/Semantic/ViewDetail.page.test.tsx src/pages/Semantic/CubeDetail.page.test.tsx` | ✅ | ⬜ pending |
| 03-03-02 | 03 | 2 | RUN-03 / RUN-04 / QRY-04 | frontend-e2e | `cd frontend && npm exec -- playwright test tests/e2e-node/devtools-browse.spec.ts tests/e2e-node/semantic.visual.spec.ts` | ✅ | ⬜ pending |
| 03-04-01 | 04 | 3 | RUN-05 / QRY-02 / QRY-03 | regression | `make test-regression-semantic` | ✅ | ⬜ pending |
| 03-04-02 | 04 | 3 | RUN-01 / RUN-02 / RUN-03 / RUN-04 / RUN-05 / QRY-01 / QRY-02 / QRY-03 / QRY-04 | full | `make verify-semantic && make verify-docs` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/components/Semantic/DevTools/CompileDebugTab.test.tsx` — 补齐 `DevTools` 编译 / 执行证据包、历史与回放逻辑的组件级回归
- [ ] `frontend/src/components/Semantic/DevTools/SchemaSyncTab.test.tsx` — 补齐漂移检测聚焦、高亮对象和 `View` 物化摘要的组件级回归

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 真实运行绑定下的语义查询结果可信度 | RUN-02 / QRY-01 / QRY-03 | 自动化能验证字段和回放逻辑，但无法替代真实数据源联调结果 | 在可用语义运行环境中进入 `/semantic/tools`，选择一个真实 `Cube` 或 `View`，执行一次编译和查询，确认 SQL、样本结果、定义哈希与对象摘要一致 |
| `DevTools` 历史回放是否足够可理解 | QRY-02 / QRY-03 | 自动化能断言按钮和状态存在，但难以判断回放链路是否真能支撑排查 | 在同一浏览器会话中执行多次调试，刷新页面后从历史记录回放，确认 DSL、对象上下文和结果摘要都能恢复 |
| 详情页到 `DevTools` 的运行摘要跳转是否符合心智 | RUN-03 / RUN-04 / QRY-04 | 自动化可验证跳转存在，但很难判断是否仍残留“详情页直接运行”的误导 | 打开 `CubeDetail`、`ViewDetail`，确认页面只展示摘要和跳转，不再承担正式运行动作 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 300s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-26
