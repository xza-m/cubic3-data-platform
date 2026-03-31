# CUBIC3 企业数据应用平台

## What This Is

这是一个面向企业内部场景的数据应用平台，定位在“数据应用层”而不是单一的数据接入工具或 BI 展示工具。平台围绕异构数据源查询、语义层建设、客制化数据应用，以及智能数据应用能力展开，主要服务数据建模工程师、数据分析师、数据产品经理，并逐步支持业务人员消费数据能力。

当前项目是 brownfield 演进型仓库，已有 `React SPA + Flask API + PostgreSQL/Redis/RQ` 的平台骨架和多条业务链路。本轮工作的重点不是重新定义产品，而是在现有基础上把核心链路做稳、做通，形成内网单机部署下可持续演进的生产可用版本。

## Core Value

在统一语义层支撑下，让企业内部用户可以稳定地完成从数据接入、数据建模、数据查询到数据应用消费的完整闭环。

## Requirements

### Validated

- ✓ 数据源接入与管理能力已存在，支持异构数据源接入与维护 — existing
- ✓ 数据集管理与查询预览能力已存在，基础数据访问链路已具备雏形 — existing
- ✓ 语义对象基础能力已存在，包含 `Cube`、`View`、`Domain`、`Recipe` 等对象模型与部分工作流 — existing
- ✓ 应用市场与应用实例基础能力已存在，平台内已有多类应用实例雏形 — existing

### Active

- [ ] 让“数据源接入 -> 数据集管理 -> 查询预览”成为在内网环境下稳定、顺滑、可持续使用的基础链路
- [ ] 补齐领域设计与领域目录，使语义中心的组织层能力可真正支撑业务语义建设
- [ ] 打通 `Cube / View / Domain / Recipe` 的全生命周期状态流转，确保对象可创建、编辑、发布、校验、查询与维护
- [ ] 稳定语义层运行链路，包括编译、查询、物化、漂移检测等关键能力
- [ ] 让智能问数形成闭环可用能力，允许效果不稳定，但输入到结果返回的流程必须完整
- [ ] 让垂直场景 `DataAgent` 形成验证性落地能力，证明语义层可以支撑智能应用扩展
- [ ] 让数据应用能力至少覆盖一个可运行实例样板，包括数据异常监控订阅、数据看板订阅、数据集订阅、Schema 漂移检测等类型
- [ ] 让前后端联调与单机 Docker 部署达到生产可用标准，保证核心平台功能在内部环境可流畅运行

### Out of Scope

- 多租户能力 — 当前阶段只面向内网单环境，不引入租户隔离复杂度
- 权限体系与权限治理实现 — 本轮明确不做任何权限层面的正式实现
- 通用 Agent 平台化 — 先验证问数与垂直 `DataAgent` 场景，不建设通用 Agent 平台
- 云原生、高可用与大规模分布式部署 — 先以单机 Docker 部署跑通并稳定为目标
- 语义中心 UI/UX 全量重做 — 建模体验优化重要，但会作为独立项目推进，不纳入本轮正式范围
- 通用扩展开发框架 — 当前不建设可插拔扩展体系，避免范围扩散
- 低代码或 AI 引导式应用生产正式落地 — 只记录为后续方向与决策背景，不纳入本轮交付范围

## Context

- 当前仓库主线已经是企业数据平台，而非单点工具，代码基线显示系统覆盖数据中心、查询中心、语义中心、应用中心和配置中心
- 平台当前定位偏数据应用层，关键能力之间存在明显依赖关系，其中语义层是问数、DataAgent 和应用消费能力的共同底座
- 现有代码已经具备多项基础能力，但“已有雏形”不等于“生产可用”；本轮核心工作是把已有能力从可演示状态推进到稳定可用状态
- 用户判断现阶段的关键路径包括：基础数据链路、语义中心全生命周期、验证型智能能力、以及典型应用实例跑通
- 领域设计与领域目录被识别为当前薄弱环节，这意味着语义对象虽然存在，但业务语义组织层仍不足以支撑后续扩展
- 智能问数和垂直 `DataAgent` 被明确定位为验证性落地，而不是效果最优或全面铺开；这要求后续规划优先保证闭环和依赖底座稳定
- 应用市场当前依赖定制化模板，后续可以探索基于应用 base 模板的低代码或 AI 引导式生产方式，但目前仅作为方向，不进入正式 scope

## Constraints

- **Deployment**: 以内网单机 Docker 部署为当前交付目标 — 先让内部环境稳定可用，再考虑更复杂部署形态
- **Architecture**: 以现有项目技术栈和系统边界为准 — 当前阶段不做大规模技术迁移或架构翻新
- **Dependency**: 智能问数与 `DataAgent` 强依赖语义层完善 — 语义层稳定性直接决定上层能力可用性
- **Scope**: 优先打磨已有能力，不扩展新平台边界 — 避免在生产可用前继续增加系统复杂度
- **Quality**: 问数与 `DataAgent` 允许效果暂时不稳定 — 但必须形成从输入、编译/执行到结果返回的完整闭环
- **Operations**: 当前不追求云原生、高可用、多租户与权限治理 — 这些都属于后续阶段性扩展主题

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 本轮以“生产可用的基础平台”作为主目标，而不是扩展新能力边界 | 现有系统已有较多能力雏形，但关键问题在于链路稳定性、完整性和可部署性 | — Pending |
| 语义层被视为平台中枢，优先级高于问数与 DataAgent 的效果优化 | 上层智能能力和应用消费都依赖语义层对象完整度与运行稳定性 | — Pending |
| 智能问数与 `DataAgent` 只做验证性落地 | 当前目标是验证语义层支撑智能能力的可行性，不追求效果极致 | — Pending |
| 领域设计与领域目录列为重点补齐方向 | 这是当前语义中心组织层能力的短板，直接影响语义资产治理与后续扩展 | — Pending |
| 保持当前技术栈与单机 Docker 部署模式 | 先降低交付变量，把生产可用建立在现有实现之上 | — Pending |
| 低代码 / AI 引导式应用生产只记录为后续方向 | 该方向有价值，但前提是应用模板体系和基础平台先稳固 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-25 after initialization*
