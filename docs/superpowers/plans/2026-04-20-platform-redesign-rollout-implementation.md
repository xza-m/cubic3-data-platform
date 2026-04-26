<!-- docs/superpowers/plans/2026-04-20-platform-redesign-rollout-implementation.md -->

# Platform Redesign · Master Plan

> 状态：**Round 3 完成 · Day 0 ready**（封盘报告 § 决策签字 GO 推荐）
> 作者：UI/UX 重构小组
> 最近更新：2026-04-21
> 目标节奏：**6 周内一次性切换**（full-replace-fast，无灰度）→ **已按计划完成**
>
> 交付物索引：
> - 架构主文档：[2026-04-20-platform-redesign/00-architecture.md](2026-04-20-platform-redesign/00-architecture.md)
> - 子工作流（5 份）：[01-frontend](2026-04-20-platform-redesign/01-frontend-workstream.md) · [02-backend](2026-04-20-platform-redesign/02-backend-workstream.md) · [03-cross-cutting](2026-04-20-platform-redesign/03-cross-cutting-concerns.md) · [04-cutover](2026-04-20-platform-redesign/04-cutover-and-migration.md) · [05-governance](2026-04-20-platform-redesign/05-governance-and-process.md)
> - 周报：Round1 / Round2 W1-W3 / Round3 W4-W6（执行报告，全部 ✅）
> - 封盘：[round3-cutover-final-report.md](2026-04-20-platform-redesign/round3-cutover-final-report.md)
> - 历史路径计划已迁至 [archive/README.md](archive/README.md) — 部分能力被 Master Plan 覆盖或暂缓到 Round 4。

---

## 0. North Star

> **把 `tmp/platform-redesign/` 验证过的全新 UIUX 一次性铺到 `frontend/`，6 周内替代 legacy，
> 视觉与交互严格对齐 demo，业务功能与后端契约严格对齐 `app/interfaces/api/v1/*`。**

判定本方案"成功"的硬指标：

  | 维度 | 验收线 |
  | --- | --- |
  | 视觉一致性 | 首屏五大模块（Dashboard / Data / Query / Semantic / Apps）与 demo 截图像素级一致（视觉基线 0 diff） |
  | 功能覆盖 | `app/interfaces/api/v1/*` 内**每条路由**在前端都有承载页面或操作入口（详见 [01-frontend-workstream.md](2026-04-20-platform-redesign/01-frontend-workstream.md)） |
  | 数据真实 | `frontend/src/v2/` 内 `rg "mockStore\|seedRuns\|mockApps\|mockExecutions"` 仅命中 `lib/mocks.ts` 的 type 定义 |
  | 性能 | 首屏 JS chunk ≤ 350 KB gzipped；列表页 P50 渲染 ≤ 200ms |
  | 可观测 | 接入前端错误上报；关键操作（新建/发布/执行）100% 埋点 |
  | 测试 | 单元 ≥ 80% / 集成 100%（每个域 1 个）/ E2E 覆盖 P1~P22 关键流程 |
  | 切换 | Day 0 完成切换，Day +7 P0 缺陷为 0 |

---

## 1. 三大原则（写进 PR 模板）

1. **风格 demo + 功能后端 + 双向对齐**。差异 4 档：`align / extend-backend / new-backend / drop-frontend`。
   见 [03-cross-cutting-concerns.md](2026-04-20-platform-redesign/03-cross-cutting-concerns.md) §对齐规则。
2. **完整性优先**：后端有的能力，前端必须有入口；不允许 hide / display:none / 假数据。
3. **一次性切换**：无 feature flag、无双轨；冻结周收尾，Day 0 直接 cutover；
   回滚靠 `git revert` + 紧急部署，**不靠开关**。

---

## 2. 体系结构概览

  ```mermaid
  flowchart LR
    User[终端用户] --> Browser[浏览器 v2 前端]
    Browser -->|axios + JWT| API["/api/v1/* (Flask)"]
    API --> Service[Application Service Layer]
    Service --> Domain[Domain + Repo]
    Domain --> DB[(MySQL/Postgres)]
    Domain --> Files[(语义文件 yaml)]

    subgraph FE [frontend/src/v2]
      Routes[v2/routes.tsx] --> Pages[v2/pages/*]
      Pages --> Hooks[react-query hooks]
      Hooks --> ApiLayer[v2/api/*]
      Pages --> Layout[v2/layout AppShell + Peek + ContextPanel]
      Pages --> UI[v2/components/ui]
    end

    Browser -.加载.-> FE
  ```

详细分层、数据流、设计系统基线见 [00-architecture.md](2026-04-20-platform-redesign/00-architecture.md)。

---

## 3. 三轨工作流（同时启动，串行收口）

  | 轨道 | 主负责 | 输入 | 产出 | 详情文档 |
  | --- | --- | --- | --- | --- |
  | **FE 业务轨** | 2 名前端 | demo 全套 + 后端契约 | `frontend/src/v2/` 全部页面与 mock 摘除 | [01-frontend-workstream.md](2026-04-20-platform-redesign/01-frontend-workstream.md) |
  | **BE 拓展轨** | 1~2 名后端 | §4.1 字段对账（master 内引） | 9 项接口拓展 + 2 张新表 + 集成测试 | [02-backend-workstream.md](2026-04-20-platform-redesign/02-backend-workstream.md) |
  | **横切基础轨** | 1 名前端兼任 | demo 视觉 + 平台规范 | 设计系统、认证、状态/错误、性能、可观测、a11y、测试金字塔 | [03-cross-cutting-concerns.md](2026-04-20-platform-redesign/03-cross-cutting-concerns.md) |

  三轨协同节奏：

  ```mermaid
  gantt
    title 6 周切换计划
    dateFormat  YYYY-MM-DD
    axisFormat  W%V
    section 工程基线
    Phase A 搬迁 + 仓内整合       :a1, 2026-04-21, 3d
    section FE 业务轨
    批次1 关键缺口 P1 P11 P15 P16 P21 P22 :f1, after a1, 7d
    批次2 治理与策略 P4-P10 P19           :f2, after f1, 7d
    批次3 生产力 P2 P3 P9 P12-P14 P17 P18 P20 :f3, after f2, 7d
    section BE 拓展轨
    extend-backend 6 项     :b1, after a1, 7d
    new-backend Cube 派生   :b2, after b1, 5d
    new-backend ScheduledQuery + Diagnose :b3, after b1, 10d
    section 横切轨
    设计系统基线 + 状态错误规范 :c1, after a1, 5d
    性能预算 + 可观测埋点    :c2, after c1, 7d
    a11y 与测试金字塔        :c3, after c2, 7d
    section 切换
    冻结周 + 演练            :cut1, after f3, 5d
    Cutover Day 0           :milestone, cut2, after cut1, 1d
    稳定期 P0 修复           :cut3, after cut2, 7d
  ```

详细甘特、关键路径、人员排期见各子文档；冻结周与切换日 runbook 见
[04-cutover-and-migration.md](2026-04-20-platform-redesign/04-cutover-and-migration.md)。

---

## 4. 关键里程碑（6 周）

  | 周 | 里程碑 | 出口判定 |
  | --- | --- | --- |
  | **W1** | 工程基线就绪 | `frontend/src/v2/` 落地、`legacy/` 改名归档完成、CI 通过；BE 9 项 issue 立卡 |
  | **W2** | FE 批次 1 + BE extend 完成 | P1 应用实例、P11 视图物化、P15/16 数据源能力上线；6 项 BE extend 接口可用 |
  | **W3** | FE 批次 2 + BE Cube 派生完成 | 本体治理完整（P4~P10/P19）；Cube list 直接返回派生字段，前端无 `enrich*` |
  | **W4** | FE 批次 3 + BE new-backend 完成 | ScheduledQuery 与 DiagnoseRuns 新表上线；前端三批次 22 项全 ✅ |
  | **W5** | 测试金字塔 + 冻结周演练 | 单元 ≥ 80%；P1~P22 E2E 全绿；视觉基线刷新；切换日演练完成 |
  | **W6** | Cutover + 稳定期 | Day 0 切换、Day +7 P0 = 0、文档/培训/截图全部同步 |

---

## 5. RACI（概览）

  | 工作项 | R | A | C | I |
  | --- | --- | --- | --- | --- |
  | 前端业务页面 | FE Lead | Tech Lead | UX | 全员 |
  | 后端拓展接口 | BE Lead | Tech Lead | FE Lead | 全员 |
  | 设计系统基线 | UX + FE | Tech Lead | 全员 FE | — |
  | 切换日 runbook | Tech Lead | Tech Lead | SRE / OnCall | 全员 |
  | 用户沟通 | PM | PM | Tech Lead | 全员 |

详细 RACI（每条 issue 级）见 [05-governance-and-process.md](2026-04-20-platform-redesign/05-governance-and-process.md)。

---

## 6. 决策摘要（来自方案讨论）

按时间顺序记录关键决策，避免回退讨论：

  | # | 决策 | 关联讨论 |
  | --- | --- | --- |
  | D1 | 视觉以 demo 为准，功能与契约以后端为准 | 讨论 1 |
  | D2 | 前端不允许 hide / 假数据，差异走 4 档分类 | 讨论 2 |
  | D3 | 后端可拓展，但 drop-frontend 类（rating / capabilities / install-uninstall）由前端删除 | 讨论 3 |
  | D4 | 完整性原则：后端有的能力，前端必须有入口（22 项覆盖审计） | 讨论 3 |
  | D5 | 一次性切换，无灰度、无 feature flag、不保留 legacy 双轨 | 讨论 4（本轮） |
  | D6 | 文档拆为 master + 6 子文档矩阵 | 讨论 4（本轮） |

---

## 7. 子文档导航

  | 文档 | 核心问题 | 必读人 |
  | --- | --- | --- |
  | [00-architecture.md](2026-04-20-platform-redesign/00-architecture.md) | 目标架构长什么样、分层与数据流、设计系统基线在哪里 | 全员 |
  | [01-frontend-workstream.md](2026-04-20-platform-redesign/01-frontend-workstream.md) | 前端做哪些页面、路由长什么样、状态/错误/性能怎么处理 | FE / UX |
  | [02-backend-workstream.md](2026-04-20-platform-redesign/02-backend-workstream.md) | 后端拓展哪 9 项、DDL 怎么改、集成测试怎么写 | BE / Tech Lead |
  | [03-cross-cutting-concerns.md](2026-04-20-platform-redesign/03-cross-cutting-concerns.md) | 设计系统 / 认证 / 状态 / 性能 / 可观测 / a11y / 测试 7 条横切线 | 全员 |
  | [04-cutover-and-migration.md](2026-04-20-platform-redesign/04-cutover-and-migration.md) | 冻结周做什么、Day 0 runbook、回滚剧本 | Tech Lead / SRE / PM |
  | [05-governance-and-process.md](2026-04-20-platform-redesign/05-governance-and-process.md) | PR 模板、review SLA、RACI 详表、升级路径 | 全员 |

---

## 8. 启动 checklist（W1 第 1 天）

启动会上对照这张表，每项有 owner、有 deadline，缺 1 不开工：

  - [ ] [01](2026-04-20-platform-redesign/01-frontend-workstream.md) FE 三批次 owner 分配
  - [ ] [02](2026-04-20-platform-redesign/02-backend-workstream.md) BE 9 项 issue 落卡，含验收标准
  - [ ] [03](2026-04-20-platform-redesign/03-cross-cutting-concerns.md) 设计系统 token 表 review 通过
  - [ ] [04](2026-04-20-platform-redesign/04-cutover-and-migration.md) 切换日窗口与冻结周日期与业务方对齐
  - [ ] [05](2026-04-20-platform-redesign/05-governance-and-process.md) PR 模板与 review SLA 在 GitHub 落地
  - [ ] CI：`VITE_UI_V2` 双轨 build 通过；后端集成测试矩阵新增 `redesign` tag
  - [ ] 用户沟通：切换公告草稿 + 培训日程

---

> **方案哲学**：一次性切换的关键不在"快"，而在"齐"——同一个 Day 0，
> 前端无 mock、后端无缺口、横切轨无空白、运维有 runbook、用户有公告。
> 凡有一项没齐，都不算到 W6 出口。
