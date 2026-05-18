# v2 端到端测试覆盖缺口

> **来源**: Round 3 清理时对 `frontend/tests/e2e-node/` 的场景映射（2026-04-22）。  
> **背景**: v1 时代的 10 个 Playwright spec 因 selector/URL 全面失效，整目录已归档清理。
> v1 功能在 v2 下完全可用，但"首屏/列表级 smoke"类的 e2e 覆盖尚未迁移。本文件记录
> 这些缺口，供后续 sprint 按价值挑选补齐。
>
> **状态更新（2026-04-22，gap 补齐轮）**: 下文 §缺口清单 中的 7 项已全部在
> `frontend/tests/e2e-v2/p23~p29` 中补齐；e2e-node 目录与 `frontend/playwright.config.ts`
> 已随后删除。本文件保留作为历史/映射档案。

## 活跃覆盖（保留）

| 能力 | v2 承接 |
|---|---|
| Modeling Copilot 闭环 | `frontend/tests/e2e-v2/p34-modeling-agent-smoke.spec.ts`（`make smoke-semantic` 第三段调用）|
| Modeling Copilot 真实后端补证 | `frontend/tests/e2e-v2/p34-modeling-agent-live.spec.ts`（`npm run e2e:modeling-agent-smoke:live`，发布前 opt-in）|
| Domain 创建 | `frontend/tests/e2e/domain_creation_smoke.py` |
| Domain 发布 | `frontend/tests/e2e/domain_publish_smoke.py` + `frontend/tests/e2e-v2/p07-domain-publish.spec.ts` |
| Ontology 操作 | `p04-ontology-object-validation`、`p05-ontology-metric-dryrun`、`p06-ontology-relations`、`p19-ontology-object-search` |
| 数据源/数据集 | `p02-datasource-test-connection`、`p03-dataset-fields-profile`、`p15-datasource-test-detail`、`p16-datasource-schema-browser` |
| 查询中心 | `p09-query-history-filter` |
| 配置中心 | `p12-channel-test-send`、`p13-subscription-history` |
| 抽取任务 | `p10-extraction-task-schedule`、`p17-extraction-run-rerun`、`p18-extraction-run-jump-task` |
| 应用市场 | `p01-app-instances`、`p20-marketplace-facet`、`p22-instance-health` |

## 缺口清单（已全部补齐）

按业务价值排序，每项均以单个 e2e-v2 spec 实现。

### 高价值（已补齐）

1. **Dashboard / Shell smoke**（原 `platform-shell.spec.ts`）  
   ✅ `frontend/tests/e2e-v2/p23-dashboard-shell-smoke.spec.ts`  
   覆盖：`/dashboard` KPI（数据源/数据集/语义模型/今日查询） + 最近查询 + 平台健康度；
   根路径 `/` 按偏好重定向到 `/dashboard`。

2. **Cube 管理首屏 smoke**（原 `cube-browse.spec.ts`）  
   ✅ `frontend/tests/e2e-v2/p24-cube-browse-smoke.spec.ts`  
   覆盖：`/semantic/cubes` 列表 + fixture 项（fct_lesson / 课程事实）+ 搜索框 + 新建 CTA。

3. **Domain 目录首屏 smoke**（原 `domain-catalog.spec.ts`）  
   ✅ `frontend/tests/e2e-v2/p25-domain-catalog-smoke.spec.ts`  
   覆盖：`/semantic/domains` 列表 + fixture 项（教学域）可见。

### 中价值（已补齐）

4. **Ontology 工作台结构 smoke**（原 `ontology-browse.spec.ts`）  
   ✅ `frontend/tests/e2e-v2/p26-ontology-workbench-smoke.spec.ts`  
   覆盖：`/semantic/ontology` 工作台打开 + fixture 对象（学生/课程）+ 新建对象 CTA。

5. **Data inventory 首屏 smoke**（原 `platform-data-inventory.spec.ts`）  
   ✅ `frontend/tests/e2e-v2/p27-data-inventory-smoke.spec.ts`  
   覆盖：`/data-center/datasources` + `/data-center/datasets` 分别打开，fixture 项可见。

6. **Query analysis 结构 smoke**（原 `platform-query-analysis.spec.ts`）  
   ✅ `frontend/tests/e2e-v2/p28-query-analysis-smoke.spec.ts`  
   覆盖：`/queries` QueryConsole 侧栏数据源 + 执行按钮可见。

### 低价值（已补齐）

7. **Legacy URL 重定向 smoke**（原 `devtools-browse.spec.ts` + 扩展）  
   ✅ `frontend/tests/e2e-v2/p29-legacy-redirect-smoke.spec.ts`  
   覆盖 5 条 `routes.tsx::LEGACY_REDIRECTS`：
   - `/semantic/tools` → `/semantic/workbench`
   - `/semantic/devtools` → `/semantic/workbench`
   - `/semantic/playground` → `/semantic/cubes`
   - `/semantic/canvas` → `/semantic/domains`
   - `/queries/editor` → `/queries`

## 实施建议

- 使用 `frontend/tests/e2e-v2/fixtures/` + `helpers.ts` 现有封装
- 对 mock 密集型（原 platform-*.spec.ts 就是全 mock 风格）建议改为对真实后端 fixture 打点，
  或复用 `p0x` 系列的 API routing 模式
- 单元 + 集成测试已经覆盖组件级逻辑，e2e smoke 重点是"页面能 render + 关键按钮存在"

## 历史参考

归档前原 spec 可在 git 历史查阅：
```bash
git log --all --full-history -- frontend/tests/e2e-node/
```
