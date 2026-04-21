<!-- docs/superpowers/plans/2026-04-20-platform-redesign/05-governance-and-process.md -->

# 05 · 治理与流程

> 谁在做、谁在卡、谁来判，6 周内不回头讨论同一个问题。

---

## 1. RACI 详表

  R = Responsible（执行）
  A = Accountable（最终拍板）
  C = Consulted（必须 review）
  I = Informed（结果同步）

  | 工作项 | R | A | C | I |
  | --- | --- | --- | --- | --- |
  | **设计基线** |  |  |  |  |
  | 设计 token 表 | UX | Tech Lead | FE Lead | 全员 |
  | 组件库（v2/components/ui） | FE Lead | Tech Lead | UX | 全员 FE |
  | **前端业务页面** |  |  |  |  |
  | Data 域（datasource/dataset/extraction）| FE-A | FE Lead | BE Lead | 全员 |
  | Query 域（console/history/saved/scheduled） | FE-B | FE Lead | BE Lead | 全员 |
  | Semantic 域（cubes/views/ontology/devtools） | FE-A | FE Lead | BE Lead | 全员 |
  | Apps 域（marketplace/instances） | FE-B | FE Lead | BE Lead | 全员 |
  | Config 域（channels/subscriptions/users/roles） | FE-A | FE Lead | BE Lead | 全员 |
  | **后端拓展** |  |  |  |  |
  | B-back-1 ~ 7（extend） | BE-A | BE Lead | FE Lead | 全员 |
  | B-back-8 ScheduledQuery | BE-B | BE Lead | FE Lead, SRE | 全员 |
  | B-back-9 DiagnoseRuns | BE-A | BE Lead | FE Lead | 全员 |
  | **横切轨** |  |  |  |  |
  | 认证 + RBAC | FE Lead | Tech Lead | BE Lead | 全员 |
  | 状态/错误规范 | FE Lead | Tech Lead | 全员 FE | 全员 |
  | 性能预算 + 拆包 | FE-B | Tech Lead | FE Lead | 全员 |
  | 可观测性 | FE Lead + BE Lead | Tech Lead | SRE | 全员 |
  | a11y + i18n | FE-A | FE Lead | UX | 全员 |
  | 测试金字塔 + CI | FE Lead | Tech Lead | BE Lead | 全员 |
  | **切换** |  |  |  |  |
  | 切换日 runbook | Tech Lead | Tech Lead | SRE / OnCall | 全员 |
  | 用户沟通 | PM | PM | Tech Lead | 全员 |
  | 回滚 | OnCall | Tech Lead | SRE | 全员 |

---

## 2. PR 模板

  仓库根放 `.github/pull_request_template.md`：

  ```markdown
  ## 改动概述

  - 关联：#xxxx（issue）/ Plan §x.x
  - 范围：FE / BE / Cross-cut

  ## 红线 Checklist（缺一不可）

  - [ ] 不允许 hide 后端不支持字段；走 align / extend / new / drop
  - [ ] 不新增 mock 数据；新数据走真实接口
  - [ ] 不在页面层调 axios；统一 v2/api/*
  - [ ] mutation 必须 invalidate；不用裸 setQueryData
  - [ ] 无 # hex / px 字面量；只用 token
  - [ ] 新加的可见字符串走 t()
  - [ ] 删除项注释 `// drop-frontend: ...`
  - [ ] 接口变更同步 OpenAPI
  - [ ] 新接口有集成测试 `@pytest.mark.redesign`
  - [ ] 截图 / 录屏（如改 UI）

  ## 影响

  - 路由：是 / 否
  - 数据库：是 / 否（如是，含 migration 链接）
  - 性能：是 / 否（如是，附 size-limit 报告）
  ```

  必勾红线项缺一律打回，不论作者是谁。

---

## 3. Review SLA

  | 类型 | SLA | Reviewer 数量 | 升级 |
  | --- | --- | --- | --- |
  | 业务页面 PR | 1 工作日 | ≥ 1 同域 + 1 横切 | 超时 → FE Lead 接手 |
  | 后端拓展 PR | 1 工作日 | ≥ 1 同域 + 1 FE Lead | 超时 → BE Lead 接手 |
  | 横切轨 PR（基础设施） | 1 工作日 | ≥ 2（FE Lead + Tech Lead） | 超时 → Tech Lead 接手 |
  | 切换 / 回滚相关 PR | 4 小时 | Tech Lead + SRE | 超时 → 直接电话 |
  | 紧急修复 P0 | 30 分钟 | 任 1 名同域 + Tech Lead 事后 review | 立即 |

  超时机制：超 SLA 自动 ping 升级人；连续超 2 次进入治理回顾会议程。

---

## 4. 升级路径

  ```mermaid
  flowchart LR
    Dev[开发者卡住] --> A{1h 内自查}
    A -->|搞定| Done[继续]
    A -->|未解决| B[同 owner 配对 30min]
    B -->|搞定| Done
    B -->|未解决| C[FE/BE Lead 介入]
    C -->|搞定| Done
    C -->|跨域 / 决策| D[Tech Lead]
    D -->|跨业务 / 资源| E[PM + Tech Lead 共拍]
  ```

  原则：**卡 1 小时必须升级**，不允许默默卡 1 天。

---

## 5. 决策记录（ADR）

  目录：`docs/adr/`，编号顺延（如 `ADR-014-scheduled-query-runner.md`）。

  本期必须出 ADR 的决策点（与 [02 · backend](02-backend-workstream.md) §13 同步）：

  - ADR-XXX：调度器选型（B-back-8）
  - ADR-XXX：诊断历史保留期（B-back-9）
  - ADR-XXX：Cube 派生字段是否物化（B-back-7）
  - ADR-XXX：错误上报后端（自建 vs Sentry）
  - ADR-XXX：i18n 工具选型（react-i18next vs 自建）
  - ADR-XXX：CSS 方案（Tailwind 是否引入额外工具，如 vanilla-extract）

  ADR 模板：

  ```markdown
  # ADR-XXX: <决策标题>

  - 状态：proposed / accepted / superseded by ADR-YYY
  - 决策日期：YYYY-MM-DD
  - 决策人：Tech Lead

  ## 背景

  ## 选项

  | 选项 | 优 | 劣 |
  | --- | --- | --- |
  | A | ... | ... |

  ## 决策

  采用 X，原因…

  ## 影响

  - 代码：...
  - 运维：...
  - 后续：...
  ```

---

## 6. 沟通节奏

  | 频率 | 事件 | 时长 | 出席 |
  | --- | --- | --- | --- |
  | 每日 | 站会（异步 / 飞书 thread） | 5 min | 全员 |
  | 周一 | 周计划 | 30 min | 全员 |
  | 周五 | 周回顾 + 风险盘点 | 45 min | 全员 |
  | 双周 | demo（给业务看进度） | 30 min | 全员 + 关键业务 |
  | W3 / W5 | 健康度评审 | 60 min | Tech Lead + Leads + PM |
  | W6 -1 | GO / NO-GO 决策会 | 60 min | Tech Lead + PM |

---

## 7. 文档与培训

  ### 7.1 文档

  - 本计划全套（master + 6 子文档）：所有人入职项目第一周必读。
  - 切换前 1 周：发布 What's New 文档（带截图 + GIF）。
  - 切换后：更新内部 wiki / 用户手册。

  ### 7.2 培训

  - W4：内部 60min 演示会（FE Lead 主讲），覆盖 5 大模块新交互。
  - W5：业务方培训（PM 主导），20min 视频 + Q&A 群。
  - W6 + 1 周：1on1 答疑（按业务方申请）。

  ### 7.3 知识管理

  - 所有 Q&A、踩坑、最佳实践沉淀到 `docs/runbook/redesign/`。
  - 每周由轮值同学整理 1 篇周报。

---

## 8. 治理回顾

  - W3 末：第一次健康度评审（速度 / 缺陷率 / 覆盖度）。
  - W5 末：第二次健康度评审（前置条件 §[04](04-cutover-and-migration.md) §1 走查）。
  - W6 + 7：切换稳定期回顾（缺陷统计 / 用户反馈 / 性能数据）。
  - 项目结束 + 1 月：项目复盘（哪些做对了 / 哪些可以更好），输出"下次重构通用 playbook"。

---

## 9. 谁负责什么（具体到人，启动会前填）

  > 启动会上当面认领，不允许"待定"。

  | 角色 | 名字 | 备注 |
  | --- | --- | --- |
  | Tech Lead | TBD | 拍板权 |
  | PM | TBD | 用户沟通 / 资源调配 |
  | FE Lead | TBD | 三批次 + 横切轨 |
  | FE-A | TBD | Data + Semantic + Config + a11y |
  | FE-B | TBD | Query + Apps + 性能 |
  | BE Lead | TBD | 9 项拓展 + 契约稳定 |
  | BE-A | TBD | B-back-1 ~ 7 |
  | BE-B | TBD | B-back-8（含调度运维） |
  | UX | TBD | 设计基线 + a11y |
  | OnCall | 轮值 | 切换日 + 稳定期 |
