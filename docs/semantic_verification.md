---
doc_type: baseline
status: current
source_of_truth: primary
owner: frontend
last_reviewed: 2026-04-03
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
3. `make test-regression-semantic`
4. `make smoke-semantic`

## Phase 2 浏览器回归重点

`make test-regression-semantic` 当前除了单元测试外，还固定覆盖以下浏览器回归重点：

- `domain-catalog.spec.ts`：校验目录治理摘要、`domain-list-search` 过滤、`domain-create-trigger` 跳转，以及选中领域后 `domain-summary-panel` 的更新。
- `cube-browse.spec.ts`：校验 `Cube 管理 -> 详情抽屉 -> 工作台对象态` 这条资产浏览链路，不再依赖旧的编辑画布入口。
- `semantic.visual.spec.ts`：固定截图 `Cube 管理`、`语义工作台`、`DomainList`、`DomainCanvas` 与 `ViewDetail` 的当前主界面。
- `domain-publish.spec.ts`：继续以 `publish-domain-button` 为入口校验领域发布流程不被回归破坏。

这些回归用于保证 Phase 2 的对象治理摘要和跨页导航已经进入固定门槛，而不是只停留在局部组件测试绿色。

底层 `make smoke-semantic` 会继续执行：

1. `npm run e2e:domain-smoke`
2. `npm run e2e:domain-publish-smoke`
3. `npm run e2e:cube-draft-smoke`

`make semantic-layout` 是 `make test-regression-semantic` 的别名，用于语义中心布局与交互回归。

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
- 打开 `语义工作台`
- 从物理表结构中选择表
- 生成 Cube 草稿
- 保存为 Draft Cube，并跳到 `/semantic/workbench?cube=<name>&tab=modeling`

## 说明
- 浏览器烟测使用 `playwright-cli`
- 烟测失败时会在 `frontend/tests/artifacts/` 下输出截图
- `make verify-semantic` 是语义中心的交付入口；默认仓库交付入口仍是 `make verify`
- `tsc`、单测、视觉回归和页面回归已经归入 `make typecheck` 与 `make test-regression-semantic`，不再混入 smoke
- 当前固定验证流程只覆盖语义中心主路径，不替代完整回归测试体系
