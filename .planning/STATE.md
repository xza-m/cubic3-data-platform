# STATE: CUBIC3 企业数据应用平台

## Project Reference

- **Project doc:** `.planning/PROJECT.md`
- **Core value:** 在统一语义层支撑下，让企业内部用户可以稳定地完成从数据接入、数据建模、数据查询到数据应用消费的完整闭环

## Current Status

- **Project status:** Phase 3 planned
- **Milestone status:** Brownfield roadmap established
- **Current focus:** Phase 3 - 语义运行闭环与查询可信（plans ready for execution）
- **Plan readiness:** Phase 3 的 context / research / validation / plans 已完成，可直接进入 `$gsd-execute-phase 3`

## Completed Setup

- 项目初始化已完成
- codebase map 已完成
- project config 已读取
- research 已完成
- requirements 已定义并补齐 traceability
- phase 1 context / research / validation / plans 已生成
- phase 1 execute / summaries / verification 已完成
- phase 2 context / research / validation / plans / reviews 已生成
- phase 2 execute / summaries / verification 已完成（仓库级 `verify-semantic` 因无关 lint 问题阻塞，已记录）
- phase 3 context / discussion-log 已生成
- phase 3 research / validation / plans 已生成

## Working Memory

| Area | Memory |
|---|---|
| Architecture | 主线保持 `React SPA + Flask API + PostgreSQL/Redis/RQ`，不做大规模技术迁移 |
| Delivery target | 以内网单机 Docker 可用为当前交付边界 |
| Dependency order | 数据接入 -> 语义中心 -> 语义运行与查询 -> 应用消费 -> 智能验证 |
| Scope guardrails | 不引入多租户、权限治理、通用 Agent 平台或云原生扩展 |
| Phase risk | 语义口径分叉、查询 fan-out、物理层漂移、AI 假答案、启动副作用 |
| Validation memory | 核心链路必须可追踪、可回放、可回归；失败原因不能被通用兜底吞掉 |
| Phase 1 context | 已落地 `PostgreSQL + MaxCompute`、三种数据集类型稳定可用、混合同步模式、`LIMIT 20` 样本预览与失败可见性 |
| Phase 1 verification | 已通过 Wave 1 后端定向 pytest、Wave 2 前端页面测试与 typecheck、Wave 3 `make test-regression-platform-data`、`tests/integration/test_api_routes_smoke.py`、`make verify-docs` |
| Phase 2 context | 已锁定 `Cube / Domain` 为正式建模对象，`View` 作为特殊 `Cube` 做展示层并入，`Recipe` 保持轻量对象；领域画布是真相、`Cube` 与 `Domain` 为多对多、目录页偏治理看板 |
| Phase 2 execution | 已收敛多领域投影、领域治理摘要、`View / Recipe` 轻量摘要与语义工作台展示；仓库级 `verify-semantic` 被无关前端 lint 阻塞，但定向 pytest、语义专项回归、`make typecheck-frontend`、`make verify-docs` 与 `make docs-impact` 已通过 |
| Phase 3 context | 已锁定 `DevTools` 为唯一正式运行入口；运行只服务调试，真实调用在应用层；Phase 3 需要补齐标准证据包、轻量调试历史/回放，以及物化/漂移摘要收敛 |

## Next Actions

1. 进入 `$gsd-execute-phase 3`，按 Wave 1 → Wave 2 → Wave 3 依次落地后端证据包、`DevTools` 闭环和详情页摘要收敛。
2. 继续复用 Phase 1 与 Phase 2 已稳定的输入和对象摘要，不重新打开接入、部署或对象定位范围。
3. 在 Phase 3 中坚持“运行只服务调试、真实消费在应用层”的边界，避免把语义中心扩成查询产品。
4. 将仓库里与语义 Phase 无关的前端 lint 存量问题单独清理，避免持续阻塞仓库级 `verify-semantic`。
