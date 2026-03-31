# Phase 3: 语义运行闭环与查询可信 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 3-语义运行闭环与查询可信
**Areas discussed:** 运行入口收敛, 查询可信证据包, 调试历史与重放, 物化与漂移检测入口

---

## 运行入口收敛

| Option | Description | Selected |
|--------|-------------|----------|
| `A` | `DevTools` 做唯一正式运行入口；详情页只保留摘要和跳转。 | ✓ |
| `B` | `Query Center` 做查询主入口，`DevTools` 只做编译/漂移调试。 | |
| `C` | 保持分散入口，只补状态与链接。 | |
| `Other` | 运行只是调试，真实调用不在平台上，而在应用层；唯一正式运行入口是 `DevTools`。 | ✓ |

**User's choice:** 语义中心的重点在于语义建设和规模化，运行只是调试；真实调用不在平台上，而在应用层，所以唯一一个涉及语义运行的正式入口就是 `DevTools` 中的调试。  
**Notes:** 这条判断直接修正了 Phase 3 的产品口径，后续不能把语义中心规划成平台内消费查询产品。

---

## 查询可信证据包

| Option | Description | Selected |
|--------|-------------|----------|
| `A` | 最小证据包：SQL、执行是否成功、错误信息或结果样本。 | |
| `B` | 标准证据包：SQL、主对象/关联对象摘要、结果样本与行数、执行时间、错误分类与 hint、定义版本标识。 | ✓ |
| `C` | 强证据包：在 `B` 基础上再加更细的编译过程、Join 路径、适配器与缓存信息。 | |

**User's choice:** `B`  
**Notes:** 可信证据服务于调试与排查，不需要发展成完整查询分析产品，但必须足够解释“为什么这次结果可信或不可信”。

---

## 调试历史与重放

| Option | Description | Selected |
|--------|-------------|----------|
| `A` | 不做真正历史，只保留当前结果。 | |
| `B` | 只在 `DevTools` 保留轻量调试历史，并支持一键回放。 | ✓ |
| `C` | 做独立完整查询历史产品。 | |

**User's choice:** `B`  
**Notes:** 最小闭环是 `DevTools` 内可追溯、可重放，而不是另做查询历史系统。

---

## 物化与漂移检测入口

| Option | Description | Selected |
|--------|-------------|----------|
| `A` | 物化和漂移检测都收敛到 `DevTools`；详情页只保留摘要和跳转。 | ✓ |
| `B` | 保留现在的混合方式，`ViewDetail` 继续承担部分运行动作。 | |
| `C` | 额外做一个运行看板。 | |

**User's choice:** `A`  
**Notes:** 这和“运行只服务调试”的定位保持一致，也避免 Phase 3 再把运行能力分散到多个页面。

---

## the agent's Discretion

- 调试历史的具体留存形式、默认排序和信息密度。
- 详情页上运行摘要卡片的具体文案、视觉层级和跳转入口名称。
- 标准证据包中各字段的排布方式，以及错误 hint 与定义版本标识的具体呈现。

## Deferred Ideas

- 独立查询历史产品或查询运营看板，延后到后续阶段。
- 语义中心内面向最终消费的查询工作台，不纳入 Phase 3。

---

*Phase: 03-semantic-runtime-and-query-trust*
*Discussion log generated: 2026-03-26*
