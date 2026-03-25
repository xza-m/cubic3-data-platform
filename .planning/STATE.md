# STATE: CUBIC3 企业数据应用平台

## Project Reference

- **Project doc:** `.planning/PROJECT.md`
- **Core value:** 在统一语义层支撑下，让企业内部用户可以稳定地完成从数据接入、数据建模、数据查询到数据应用消费的完整闭环

## Current Status

- **Project status:** Phase 1 planned
- **Milestone status:** Brownfield roadmap established
- **Current focus:** Phase 1 - 基础接入与运行底座稳定化（ready for execute）
- **Plan readiness:** 已生成 4 个执行计划，可进入 `$gsd-execute-phase 1`

## Completed Setup

- 项目初始化已完成
- codebase map 已完成
- project config 已读取
- research 已完成
- requirements 已定义并补齐 traceability
- phase 1 context / research / validation / plans 已生成

## Working Memory

| Area | Memory |
|---|---|
| Architecture | 主线保持 `React SPA + Flask API + PostgreSQL/Redis/RQ`，不做大规模技术迁移 |
| Delivery target | 以内网单机 Docker 可用为当前交付边界 |
| Dependency order | 数据接入 -> 语义中心 -> 语义运行与查询 -> 应用消费 -> 智能验证 |
| Scope guardrails | 不引入多租户、权限治理、通用 Agent 平台或云原生扩展 |
| Phase risk | 语义口径分叉、查询 fan-out、物理层漂移、AI 假答案、启动副作用 |
| Validation memory | 核心链路必须可追踪、可回放、可回归；失败原因不能被通用兜底吞掉 |
| Phase 1 context | 已锁定 `PostgreSQL + MaxCompute`、三种数据集类型稳定可用、混合同步模式、`LIMIT 20` 样本预览与失败可见性 |

## Next Actions

1. 执行 Phase 1 的 4 个计划文件，优先完成 Wave 1 的后端底座计划。
2. 执行阶段持续用 `.planning/phases/01-foundation-data-runtime-stabilization/01-VALIDATION.md` 做定向回归抽样。
3. 仅把部署相关工作收敛为“支撑功能联调与验证”的最小运行底座，不扩展部署体验优化。
4. 后续 phase 只在前序依赖稳定后推进，避免把语义与智能能力建立在不稳定输入上。
