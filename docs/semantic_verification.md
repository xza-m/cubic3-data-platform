---
doc_type: baseline
status: current
source_of_truth: primary
owner: frontend
last_reviewed: 2026-04-25
---

# 语义中心固定验证流程

## 目标
语义中心改动不再只依赖 `tsc` 或 `pytest` 单侧通过，而是固定执行“共享四层 + 语义专项”：

1. 层 1：静态检查
2. 层 2：类型与接口检查
3. 层 3：自动化回归
4. 层 4：浏览器关键路径烟测

## 服务就绪要求
执行浏览器烟测前，确保以下服务可用：

- 前端开发服务：`http://127.0.0.1:3000`
- 后端 API 与代理已刷新到最新代码

推荐顺序：

```bash
docker compose restart backend nginx
cd /path/to/cubic3-data-platform/frontend
npm run dev -- --host 127.0.0.1
```

## 固定验证入口

```bash
cd /path/to/cubic3-data-platform
make verify-semantic
```

其中语义 smoke 的底层命令等价于：

```bash
cd /path/to/cubic3-data-platform
make smoke-semantic
```

`make verify-semantic` 会顺序执行：

1. `make verify-backend`
2. `make verify-frontend`
3. `make smoke-semantic`

## v2 浏览器回归重点

Round 4 D+21 后，legacy `make test-regression-semantic` 与 `make semantic-layout` 目标已经移除。当前 v2 浏览器覆盖分为两类：

- 默认前端 smoke：`make smoke-frontend`，底层为 `npm run e2e:smoke`，覆盖 v2 cutover 的低副作用关键路径。
- 语义专项 smoke：`make smoke-semantic`，覆盖领域创建、领域发布与 Cube 草稿三条真实链路。

补充的 mock 型 v2 E2E 用例位于 `frontend/tests/e2e-v2/`，包括：

- `p24-cube-browse-smoke.spec.ts`：Cube 管理首屏。
- `p25-domain-catalog-smoke.spec.ts`：Domain 目录首屏。
- `p26-ontology-workbench-smoke.spec.ts`：`/semantic/ontology` 工作台结构。
- `p29-legacy-redirect-smoke.spec.ts`：语义旧入口重定向。

底层 `make smoke-semantic` 会继续执行：

1. `npm run e2e:domain-smoke`
2. `npm run e2e:domain-publish-smoke`
3. `npm run e2e:cube-draft-smoke`

## 状态契约

`make smoke-semantic` 不是默认仓库 smoke，而是语义专项、有状态 smoke：

- 会创建或更新草稿、测试数据和语义资产
- 依赖前端开发服务、最新后端代码和可写语义目录
- 不承诺 hermetic，也不保证对工作区和数据零副作用
- 只应在语义关键路径改动时作为交付门禁运行

如果你需要可回收结果，优先在独立测试环境、临时数据空间或可清理本地环境中执行。

## 三条浏览器烟测

### 1. `domain-smoke`
- 创建领域草稿
- 跳转领域画布
- 校验 `draft` 状态

### 2. `domain-publish-smoke`
- 创建领域草稿
- 从 `Cube 库` 拖入至少一个 Cube
- 发布领域 YAML
- 校验状态变为 `active`

### 3. `cube-draft-smoke`
- 打开业务语义 / Cube 草稿链路
- 从物理表结构中选择表
- 生成 Cube 草稿
- 保存为 Draft Cube，并按当前 v2 路由进入对应语义开发上下文

注意：`frontend/tests/e2e/cube_draft_smoke.py` 当前仍以 `/semantic/workbench?cube=...` 作为草稿后续上下文；该路径在 v2 中是诊断工作台。后续应把该 smoke 对齐到 Cube 创建/编辑真实页面，或明确把它降级为诊断链路验证。

## 说明
- 浏览器烟测使用 `playwright-cli`
- 烟测失败时会在 `frontend/tests/artifacts/` 下输出截图
- `make verify-semantic` 是语义中心的交付入口；默认仓库交付入口仍是 `make verify`
- `tsc` 与单测已经归入 `make verify-frontend`；浏览器级验证由 `make smoke-frontend` 与 `make smoke-semantic` 承接
- 当前固定验证流程只覆盖语义中心主路径，不替代完整回归测试体系
