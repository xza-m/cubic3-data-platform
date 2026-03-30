# Branch Governance Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前混杂分支拆成可审阅、可验证、可回滚的提交批次，并先隔离明确的生成噪声。

**Architecture:** 采用“先降噪、再分批、最后验证”的治理方式，不尝试一次性提交整个工作树。先处理 `.gitignore` 与高置信生成物，再把文档与治理工具、后端语义运行时、前端 IA 与测试基线拆成独立批次。

**Tech Stack:** Git、Make、Pytest、Vitest、Playwright、React SPA、Flask API

---

### Task 1: 生成噪声隔离

**Files:**
- Modify: `.gitignore`
- Inspect: `frontend/coverage/`
- Inspect: `app/infrastructure/semantic/cubes/playwright_cube_*.yml`
- Inspect: `output/`

- [ ] **Step 1: 补齐忽略规则**

已确认应忽略：
- `frontend/coverage/`
- `app/infrastructure/semantic/cubes/playwright_cube_*.yml`

- [ ] **Step 2: 验证噪声是否从状态中消失**

Run: `git ls-files --others --exclude-standard | wc -l`
Expected: 未跟踪文件数量明显下降，且不再出现 `frontend/coverage/` 与 `playwright_cube_*.yml`

- [ ] **Step 3: 列出仍然存在但暂不删除的可疑生成物**

Run: `git status --short | awk '$1=="??"{print $2}' | sort`
Expected: 输出仍保留 `output/`、`.planning/debug/`、`images/`、`.pen` 等待人工确认的条目

### Task 2: 文档与治理工具批次

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/readme.md`
- Modify: `docs/DOC_ALIGNMENT_REPORT.md`
- Modify: `docs/QUICK_START.md`
- Modify: `docs/STARTUP_GUIDE.md`
- Modify: `docs/TECH_STACK_AND_ARCHITECTURE.md`
- Modify/Create: `docs/architecture/`
- Modify/Create: `docs/quality/`
- Modify/Create: `docs/runbooks/`
- Modify/Create: `scripts/checks/`
- Modify/Create: `scripts/detect_verification_scope.py`
- Modify/Create: `scripts/*_coverage_rules.json`
- Modify/Create: `Makefile`
- Modify/Create: `.github/`
- Modify/Create: `openspec/changes/`

- [ ] **Step 1: 只保留能支撑当前工作流的治理文档与脚本**

目标：把“文档导航、验证入口、规则文件、规范变更”收敛成一个独立批次。

- [ ] **Step 2: 运行治理批次自检**

Run: `make -n verify-detect`
Expected: 能解析验证入口，不报命令结构错误

- [ ] **Step 3: 形成独立提交**

Run: `git add README.md AGENTS.md docs scripts Makefile .github openspec .gitignore`
Expected: 只包含治理与文档，不包含业务代码与测试生成物

### Task 3: 后端语义运行时与数据任务批次

**Files:**
- Modify/Create: `app/application/**`
- Modify/Create: `app/domain/**`
- Modify/Create: `app/infrastructure/**`
- Modify/Create: `app/interfaces/api/**`
- Test: `tests/unit/application/**`
- Test: `tests/unit/domain/**`
- Test: `tests/unit/infrastructure/**`
- Test: `tests/integration/test_api_routes_smoke.py`
- Test: `tests/integration/test_dataset_api.py`
- Test: `tests/integration/test_datasource_api.py`
- Test: `tests/integration/test_semantic_api.py`

- [ ] **Step 1: 只暂存后端和对应后端测试**

Run: `git add app tests/unit tests/integration pytest.ini`
Expected: 不混入 `frontend/` 与 `docs/`

- [ ] **Step 2: 跑后端验证**

Run: `make test`
Expected: 至少确认后端单测与集成测试入口没有新增结构性失败

- [ ] **Step 3: 形成独立提交**

Commit message: `feat: align semantic runtime and backend validation`

### Task 4: 前端产品代码批次

**Files:**
- Modify/Create: `frontend/src/App.tsx`
- Modify/Create: `frontend/src/api/**`
- Modify/Create: `frontend/src/components/**`
- Modify/Create: `frontend/src/pages/**`
- Modify/Create: `frontend/src/hooks/**`
- Modify/Create: `frontend/src/utils/sqlGenerator.ts`
- Modify/Create: `frontend/package.json`
- Modify/Create: `frontend/package-lock.json`
- Modify/Create: `frontend/vitest.config.ts`
- Modify/Create: `frontend/.eslintrc.cjs`

- [ ] **Step 1: 只暂存前端产品代码**

Run: `git add frontend/src frontend/package.json frontend/package-lock.json frontend/vitest.config.ts frontend/.eslintrc.cjs`
Expected: 不混入 `frontend/tests/` 与快照

- [ ] **Step 2: 跑前端基线验证**

Run: `cd frontend && npm run test:unit -- src/pages/QueryCenter/Dashboard.page.test.tsx src/pages/Semantic/DomainCanvas.page.test.tsx src/pages/Semantic/DevTools.page.test.tsx`
Expected: 关键页面基线继续通过

- [ ] **Step 3: 形成独立提交**

Commit message: `feat: refactor semantic and query center frontend flows`

### Task 5: 前端测试与视觉基线批次

**Files:**
- Modify/Create: `frontend/tests/e2e-node/**`
- Modify/Create: `frontend/tests/e2e/**`
- Modify/Create: `frontend/src/**/*.test.tsx`
- Modify/Create: `frontend/src/**/*.test.ts`
- Snapshot: `frontend/tests/e2e-node/*.spec.ts-snapshots/**`

- [ ] **Step 1: 只暂存测试与快照**

Run: `git add frontend/tests frontend/src/**/*.test.*`
Expected: 与产品代码批次解耦

- [ ] **Step 2: 跑核心验证**

Run: `cd frontend && npx playwright test tests/e2e-node/platform-query-analysis.spec.ts tests/e2e-node/domain-creation.spec.ts tests/e2e-node/devtools-browse.spec.ts tests/e2e-node/semantic.visual.spec.ts`
Expected: 当前已确认失败点全部变绿

- [ ] **Step 3: 跑回归验证**

Run: `cd frontend && npx playwright test tests/e2e-node/platform-shell.spec.ts tests/e2e-node/platform-data-inventory.spec.ts tests/e2e-node/cube-browse.spec.ts tests/e2e-node/domain-publish.spec.ts`
Expected: 已通过链路不回退

- [ ] **Step 4: 形成独立提交**

Commit message: `test: align e2e and visual baselines with current semantic UX`

### Task 6: 收口与待人工确认项

**Files:**
- Inspect: `output/`
- Inspect: `.planning/debug/`
- Inspect: `images/`
- Inspect: `test_pencil.pen`
- Inspect: `uiv2.pen`

- [ ] **Step 1: 标记需要人工判断的本地产物**

这些条目暂不自动删除，也不默认加入提交。

- [ ] **Step 2: 生成最终检查清单**

Run: `git status --short`
Expected: 剩余变更能明确落入“待提交批次”或“待人工确认”两类

- [ ] **Step 3: 按批次提交，不做一次性大提交**

要求：
- 每个提交都能单独解释
- 每个提交都有对应验证
- 不把待确认本地产物混入提交
