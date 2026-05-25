---
doc_type: validation
status: current
source_of_truth: secondary
owner: engineering
last_reviewed: 2026-05-25
---

# 2026-05-25 上线前 E2E 验证记录

本文记录 `codex/data-asset-foundation-mvp` 分支在 2026-05-25 的上线前验证、发现问题、修复项和剩余风险。

## 验证环境

| 项目 | 值 |
|---|---|
| 分支 | `codex/data-asset-foundation-mvp` |
| 基线提交 | `c1b1fb8 test: refresh e2e baselines` |
| 本地入口 | `http://localhost:81` |
| 运行栈 | Docker Compose：nginx、backend、postgres、redis、rq_worker |
| 说明 | 本轮验证前将历史未整理改动临时 stash，避免混入本次交付。 |

## 自动化验证结果

| 命令 | 结果 | 说明 |
|---|---|---|
| `make semantic-prod-readiness-report` | blocked | 严格上线补证输入缺失，详见“未证明项”。 |
| `make verify-semantic-prod` | passed | 迁移拓扑、SQL registry、nginx 生产镜像构建、语义专项验证均通过；live smoke 和 fixture cleanup 因环境变量缺失按设计跳过。 |
| `cd frontend && npm run test:e2e:v2` | passed | 修复后结果为 `84 passed, 1 skipped`；跳过项为 P34 live 真实后端用例。 |
| `cd frontend && npx playwright test --config tests/e2e-v2/playwright.config.ts smoke/routes-smoke.spec.ts` | passed | `8 passed`，包含新增 R07/R08 配置中心创建路由回归。 |
| `docker compose build nginx && docker compose up -d nginx` | passed | 生产前端重新构建并替换本地 nginx 容器。 |
| `curl -i http://localhost:81/api/v1/health` | passed | 返回 HTTP 200，`data.status=ok`。 |
| `make verify` | passed | 2026-05-25 追加仓库级四层门禁：lint / typecheck / unit / integration / smoke 均通过。首次执行中前端单测出现资源抖动型超时，立即复跑 `npm run test:unit` 通过，随后完整 `make verify` 复跑通过。 |

## 真实浏览器巡检

通过 Codex in-app browser 对 `localhost:81` 做主要页面巡检，覆盖导航中的核心入口、创建页和语义中心页面。

| 阶段 | 覆盖 | 结果 |
|---|---|---|
| 修复前 | 48 条主要路由 | 46 条通过；`/config/channels/new`、`/config/subscriptions/new` 被动态 `:id` 捕获，显示“非法 ID”。 |
| 修复后 | 48 条主要路由 | 48 条通过；无新增 console error/warning。 |
| 数据资产底座 DOM 复验 | `/semantic/assets` | 页面内重复 tab 导航已不存在，二级导航保留在侧栏；页面标题为“资产雷达”。 |
| 配置中心创建页 DOM 复验 | `/config/channels/new`、`/config/subscriptions/new` | 均渲染创建表单，不再出现“非法的渠道 ID / 非法的订阅 ID”。 |

## 本轮修复

- 挂载已存在但未注册的 `ChannelCreate`、`SubscriptionCreate` 静态路由。
- 将 `/config/channels/new`、`/config/subscriptions/new` 放在动态 `:id` 路由之前，避免被详情页吞掉。
- 在 `routes-smoke.spec.ts` 增加 R07/R08，防止同类“静态 new 被 :id 捕获”回归。

## 未证明项

严格上线门禁 `make verify-semantic-prod-strict` 仍缺少以下外部输入，当前环境不能给出“严格上线通过”的结论：

- `SEMANTIC_BASELINE_DATABASE_URL`
- `SEMANTIC_PROD_LIVE=1`
- `SEMANTIC_FIXTURE_NAMESPACE`
- `SEMANTIC_FIXTURE_DATABASE_URL` 或 `SEMANTIC_BASELINE_DATABASE_URL`
- `SEMANTIC_POSTGRES_DATABASE_URL` 或 `SEMANTIC_BASELINE_DATABASE_URL`

这些项属于真实预生产数据库 fingerprint、live smoke、fixture cleanup 和真实 PostgreSQL 并发补证，不应由本地 mock 或空值替代。

## 工程原则复盘

- KISS：本轮修复只改路由装配，不重写配置中心页面。
- DRY：复用已有创建页与现有 smoke helper，不新增第二套路由检测框架。
- SOLID：路由表继续保持“静态路由先于动态路由”的单一装配职责。
- YAGNI：未为严格上线门禁伪造环境变量，保留真实环境补证边界。
