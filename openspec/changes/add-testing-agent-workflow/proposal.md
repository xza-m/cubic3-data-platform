# Change: 引入测试 Agent 与分层验证工作流

## Why
当前前端与语义中心的验证主要依赖 `tsc`、`build` 和零散手工操作。真实浏览器烟测已经证明能够捕获“类型与构建都通过但运行链路失效”的问题，例如错误端口、旧服务未刷新、路由未命中等。该能力不应继续散落在领域建模或语义层提案中，而应被抽象为独立的测试 Agent 与验证工作流。

## What Changes
- **ADDED** Testing Agent Workflow：定义统一的分层验证流程，覆盖类型检查、构建校验、关键路径浏览器烟测、发布前回归。
- **ADDED** Frontend Smoke Checklist：将 `playwright-cli` 浏览器烟测纳入语义中心相关改动的固定校验项。
- **ADDED** Verification Contract：明确何种改动必须执行哪一层验证，并要求测试结果可复现、可脚本化。
- **ADDED** Testing Agent Task Matrix：把前端 Playwright E2E 视为测试 Agent 清单中的一类任务，而非唯一实现。

## Impact
- Affected specs: `testing-workflow`, `frontend-ui`
- Affected code:
  - `frontend/package.json`
  - `frontend/tests/e2e/*`
  - `docs/` 或开发者说明文档
  - CI / 本地验证脚本（若后续接入）
