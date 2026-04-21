<!-- docs/superpowers/plans/2026-04-20-platform-redesign/04-cutover-and-migration.md -->

# 04 · 切换与迁移

> 一次性切换（full-replace-fast）：无 feature flag、无双轨。
> 关键不在快，而在"齐"——切换日所有项达标，否则推迟。

---

## 1. 切换前置条件 Checklist（W5 末）

任何一项未达标，**推迟切换日 1 周**。

  - [ ] 前端三批次 P1~P22 全部 ✅（[01](01-frontend-workstream.md) §3）
  - [ ] 后端 9 项拓展全部上线（[02](02-backend-workstream.md) §1）
  - [ ] `frontend/src/v2/` 内 `rg "mockStore|seed|mockApps|mockExecutions"` 仅命中 type 定义
  - [ ] 单元 ≥ 80% / 集成全绿 / E2E P1~P22 全绿
  - [ ] 视觉基线刷新并 review 通过
  - [ ] size-limit 首屏 ≤ 350 KB
  - [ ] a11y 关键页面 0 violations
  - [ ] 错误上报 + 埋点 dashboard 可看到数据
  - [ ] 切换日 runbook 演练完成（W5 中演练 1 次）
  - [ ] 用户公告草稿 + 培训日程出炉
  - [ ] 回滚剧本 review 通过

---

## 2. 冻结周（Day -7 ~ Day -1）

  | 天 | 主题 | 行动 |
  | --- | --- | --- |
  | **D -7** | 启动冻结 | `main` 分支只接受 P0 修复；新功能进入下一迭代 |
  | **D -6** | 全量回归 1 | 跑完整测试矩阵：单元 / 集成 / 视觉 / E2E / a11y / Lighthouse |
  | **D -5** | 性能压测 | 后端：B-back-7 / B-back-8 / B-back-9 接口压测 P95 |
  | **D -4** | 演练 1 | 模拟切换流程（含回滚演练）；记录耗时 |
  | **D -3** | 用户沟通 | 发通告 / 培训日程；FAQ 上线 |
  | **D -2** | 全量回归 2 | 跑全套 + 视觉对比；缺陷分级，P0/P1 限当日修 |
  | **D -1** | 走查 + 决策 | Tech Lead + PM 走查 §1 checklist；做 GO / NO-GO 决策 |

---

## 3. 切换日 Runbook（Day 0）

  推荐窗口：业务低峰期（周末 / 工作日 22:00 后）。

  ```mermaid
  flowchart LR
    A[T-30min<br/>公告: 切换开始] --> B[T-15min<br/>停 CI/CD<br/>冻结写入]
    B --> C[T-10min<br/>DB 备份]
    C --> D[T-5min<br/>后端最终拓展上线<br/>B-back-1~9 已提前灰度]
    D --> E[T 0<br/>部署 v2 镜像]
    E --> F[T+5min<br/>烟雾测试<br/>5 大模块各 1 个 happy path]
    F -->|通过| G[T+15min<br/>恢复 CI/CD<br/>解除冻结]
    F -->|失败| H[执行回滚<br/>见 §5]
    G --> I[T+30min<br/>公告: 切换完成]
    I --> J[T+1h ~ T+24h<br/>OnCall 值守]
  ```

  详细操作：

  ### 3.1 部署

  - 前端：`frontend/src/v2/` 编译产物覆盖 nginx 根，`legacy/*` 路径 410 Gone（不再服务）。
  - 后端：仅滚动重启（B-back-1~9 已在 W2~W4 灰度发布）。

  ### 3.2 烟雾测试（人 + 自动）

  自动：Playwright `e2e:smoke` 跑：

  - 登录
  - Dashboard 加载
  - 列出 datasources
  - 列出 ontology objects
  - 创建一个 saved query
  - 触发一个语义诊断

  人工（Tech Lead + 一名 BE + 一名 FE）：

  - 切到暗色主题再切回
  - 打开任一应用实例 health 信息
  - 触发一次 ScheduledQuery 手动 run

  ### 3.3 公告

  - 切换前：站内信 + 飞书广播 + 邮件
  - 切换中：登录页 banner + 顶部 banner
  - 切换后：banner 撤销，发"切换完成"公告 + What's New 链接

---

## 4. 数据 / 用户偏好 / 书签兼容

  ### 4.1 旧 URL 重定向

  在 `v2/routes.tsx` 顶层加 redirect 表，覆盖 legacy URL：

  ```ts
  const LEGACY_REDIRECTS: Record<string, string> = {
    '/legacy/datasources': '/datasources',
    '/legacy/queries':     '/queries/console',
    '/legacy/semantic':    '/semantic/cubes',
    '/legacy/apps':        '/apps',
    // ... 完整清单见附录 §A
  };
  ```

  - 用户书签命中 → 自动 301 到 v2 对应页面。
  - 6 个月后清理 redirect 表。

  ### 4.2 用户偏好迁移

  - localStorage 旧 key（如 `theme`, `lastTab`）→ 切换日由前端启动脚本读出：
    - 如果用户已登录 → 调用 `PUT /users/me/preferences` 写入后端
    - 然后清除 localStorage 旧 key
  - 后端无 preferences 时默认值由 [02 · backend](02-backend-workstream.md) §B-back-1 提供。

  ### 4.3 历史数据

  - 所有现有数据（datasource / dataset / cube / app instance / query history ...）**完全保留**。
  - 切换不涉及业务数据迁移，仅前端容器更换 + 后端少量 schema 加字段（已在 W2~W4 完成迁移）。

---

## 5. 回滚剧本

  策略：**git revert + 紧急部署**，目标 30 分钟内回滚完成。

  ### 5.1 触发条件

  以下**任一**触发立即回滚：

  - 烟雾测试 1 项失败且 15 分钟内无法热修
  - 错误上报 5xx 比例 > 5%（持续 5 分钟）
  - 用户登录失败率 > 10%
  - 数据库出现锁等待 / 长事务异常
  - 任何 P0 安全问题

  ### 5.2 步骤

  ```text
  1. OnCall 在 #incidents 频道宣告 ROLLBACK，记录时间戳
  2. git revert <cutover-commit-sha> --no-edit                   # 翻转部署 commit
  3. ./scripts/deploy.sh frontend --tag <previous-tag>           # 前端回旧镜像
  4. 后端拓展接口保留（兼容旧前端，已在 W2~W4 验证）
  5. nginx reload，验证旧前端可登录
  6. 确认 5 大模块可用 → 发"已回滚"公告
  7. 写 incident report（24 小时内）
  ```

  ### 5.3 回滚后

  - 立即开 RCA 会议（Tech Lead + 故障域 owner）。
  - 修复并 cherry-pick 进 v2 分支，重新做切换前置条件 checklist。
  - 下一切换窗口在 RCA action 全部 closed 之后。

---

## 6. 切换后稳定期（Day +1 ~ Day +7）

  | 天 | 主题 |
  | --- | --- |
  | **D +1** | 全员值守；OnCall 持续；监控告警阈值临时收紧 |
  | **D +2** | 收集用户反馈（飞书群 / 工单），按优先级排 P0/P1 |
  | **D +3** | P0 缺陷修复发布（如有） |
  | **D +5** | 中期回顾会：用户反馈 / 性能数据 / 错误数据 |
  | **D +7** | 出口标准：P0 = 0、P1 ≤ 3、错误率 < 0.5% |

  达不到出口 → 进入"应急修复 sprint"，否则进入正常迭代。

---

## 7. 后续清理

  | 时间 | 行动 |
  | --- | --- |
  | Day +14 | 回滚窗口关闭，宣告无回滚预案 |
  | Day +21 | 删除 `frontend/src/legacy/`；旧 PR review 关闭 |
  | Day +28 | 删除 `tmp/platform-redesign/`；归档 demo 截图 |
  | 每月 | 检查 redirect 表命中率，6 个月内删除零命中条目 |

---

## 附录 A · Legacy URL 重定向清单（待 W4 补全）

  W4 末，按 `frontend/src/legacy/` 内 `routes.tsx` 全量列出，结对 v2 路径，PR review 通过后写入 §4.1 的 map。
