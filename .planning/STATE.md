# STATE: CUBIC3 企业数据应用平台

## Project Reference

- **Project doc:** `.planning/PROJECT.md`
- **Core value:** 在统一语义层支撑下，让企业内部用户可以稳定地完成从数据接入、数据建模、数据查询到数据应用消费的完整闭环

## Current Status

- **Project status:** Initialized
- **Milestone status:** Brownfield roadmap established
- **Current focus:** Phase 1 - 基础接入与运行底座稳定化
- **Plan readiness:** 可直接进入 `$gsd-plan-phase 1`

## Completed Setup

- 项目初始化已完成
- codebase map 已完成
- project config 已读取
- research 已完成
- requirements 已定义并补齐 traceability

## Working Memory

| Area | Memory |
|---|---|
| Architecture | 主线保持 `React SPA + Flask API + PostgreSQL/Redis/RQ`，不做大规模技术迁移 |
| Delivery target | 以内网单机 Docker 可用为当前交付边界 |
| Dependency order | 数据接入 -> 语义中心 -> 语义运行与查询 -> 应用消费 -> 智能验证 |
| Scope guardrails | 不引入多租户、权限治理、通用 Agent 平台或云原生扩展 |
| Phase risk | 语义口径分叉、查询 fan-out、物理层漂移、AI 假答案、启动副作用 |
| Validation memory | 核心链路必须可追踪、可回放、可回归；失败原因不能被通用兜底吞掉 |

## Next Actions

1. 进入 Phase 1 详细规划。
2. 在 Phase 1 中优先核对数据接入、元数据同步、数据集预览和部署底座的现状边界。
3. 后续 phase 只在前序依赖稳定后推进，避免把语义与智能能力建立在不稳定输入上。

