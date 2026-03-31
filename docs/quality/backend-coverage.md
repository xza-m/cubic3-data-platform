---
doc_type: baseline
status: current
source_of_truth: primary
owner: engineering
last_reviewed: 2026-03-25
---

# 后端覆盖率看板

本文档用于跟踪后端 coverage 提升项目的当前基线、模块波次结果和后续维护重点。
唯一总指标固定为仓库根目录 `make coverage-backend`；模块级数据以同一次运行生成的 `coverage.xml` 为准。
当前约束已机器化：`make coverage-backend` 在 pytest 完成后，会自动执行 `scripts/checks/backend_coverage_guard.py`，按 `scripts/backend_coverage_rules.json` 校验总门槛、模块均匀度和核心模块守护。

## 1. 当前快照

**刷新时间**：2026-03-25  
**口径**：`make coverage-backend`  
**结果**：`1362 passed, 2 warnings`  
**后端总覆盖率**：`98.06%`  
**当前门槛**：`pytest.ini -> --cov-fail-under=95`

### 顶层模块覆盖率

| 模块 | 当前覆盖率 | 说明 |
|---|---:|---|
| `application` | `99.25%` | semantic / extraction / app_center / conversation / agent 已进入稳定高覆盖区 |
| `di` | `97.01%` | 依赖注入装配层已处于稳定覆盖区间 |
| `domain` | `97.93%` | 语义核心、实体与领域服务已进入稳定高覆盖区 |
| `executors` | `97.14%` | 执行器边界分支和失败路径已补厚 |
| `infrastructure` | `97.53%` | adapters / cache / events / tasks / notification / llm 已形成均匀覆盖 |
| `interfaces` | `97.40%` | API 路由、信道层与文档中间件覆盖已较完整 |
| `shared` | `100.00%` | 工具层纯函数和类型兼容路径已全部补齐 |

## 2. 项目状态

- 后端 coverage 项目总目标已达成：`make coverage-backend` 最新结果为 `98.06%`
- `pytest.ini` 的 coverage 门槛已同步提升到 `95`
- 统一口径保持不变：仓库根目录 `make coverage-backend` 是唯一总指标
- 二级模块均匀度目标已达成：当前所有二级模块都 `>=95%`
- 后续不再以“冲刺 95%”为目标，而是转入“维持基线 + 守住核心模块 100% + 回收局部长尾”的维护模式

### 二级模块均匀度

| 二级模块 | 当前值 | 状态 | 说明 |
|---|---:|---|---|
| `application.agent` | `99.49%` | 已达标 | agent 服务和 prompt 组装已进入守护区 |
| `application.conversation` | `99.48%` | 已达标 | 对话创建 / 查询 / 失败路径已补齐 |
| `application.dataset` | `100.00%` | 已达标 | 数据集应用层守护完成 |
| `application.datasource` | `100.00%` | 已达标 | 数据源应用层守护完成 |
| `application.extraction` | `99.25%` | 已达标 | 任务、运行、预览链路已补齐 |
| `application.feishu` | `100.00%` | 已达标 | Feishu 应用层守护完成 |
| `application.query` | `100.00%` | 已达标 | 基础查询应用层守护完成 |
| `application.semantic` | `100.00%` | 核心守护 | 语义建模、同步、查询、发布全量守护 |
| `application.services` | `95.47%` | 已达标 | app_center 与支撑服务达到均匀度门槛 |
| `domain.agent` | `100.00%` | 已达标 | agent 领域对象守护完成 |
| `domain.app_center` | `95.15%` | 已达标 | 应用中心领域对象达标 |
| `domain.entities` | `96.27%` | 已达标 | 基础实体与查询实体整体达标 |
| `domain.events` | `97.26%` | 已达标 | 领域事件守护稳定 |
| `domain.ports` | `100.00%` | 已达标 | 端口契约层守护完成 |
| `domain.semantic` | `100.00%` | 核心守护 | compiler / join graph / 语义实体全量守护 |
| `domain.services` | `98.00%` | 已达标 | 领域服务与策略路径达标 |
| `infrastructure.adapters` | `95.10%` | 已达标 | 外部适配器层已跨过均匀度门槛 |
| `infrastructure.cache` | `99.54%` | 已达标 | cache 装饰器与客户端已补齐 |
| `infrastructure.database` | `100.00%` | 已达标 | 数据库基础设施守护完成 |
| `infrastructure.events` | `98.47%` | 已达标 | 事件分发与 handler 已补厚 |
| `infrastructure.llm` | `97.53%` | 已达标 | LLM 服务适配已达标 |
| `infrastructure.notification` | `96.30%` | 已达标 | 通知层边界分支已补齐 |
| `infrastructure.repositories` | `100.00%` | 已达标 | 仓储层守护完成 |
| `infrastructure.semantic` | `99.10%` | 已达标 | inspector / YAML 仓储已补齐 |
| `infrastructure.tasks` | `97.37%` | 已达标 | worker / queue / extraction job 已补齐 |
| `interfaces.api` | `97.28%` | 已达标 | API 路由与错误分支均匀度达标 |
| `interfaces.channels` | `98.59%` | 已达标 | 信道层与事件入口达标 |
| `shared` | `100.00%` | 已达标 | 共享层守护完成 |
| `shared.utils` | `100.00%` | 已达标 | 工具函数守护完成 |

## 3. 当前维护重点

当前整体门槛和二级模块均匀度都已经达成，后续优先级改为“守住均匀度 + 保持核心模块 100%”：

- 新增或修改后端代码时，不得让任何二级模块跌破 `95%`
- 当前核心守护模块包括：
  - `application.semantic`
  - `domain.semantic`
  - `application.dataset`
  - `application.datasource`
  - `application.query`
  - `infrastructure.repositories`
  - `shared`
  - `shared.utils`
- 个别边缘模块若继续出现真实缺陷或回归，应优先补回归测试，不做形式化刷数

### 已形成守护基线的重点区域

- 数据源、数据集、基础查询相关实体 / 应用 / 仓储 / API 继续保持 `100%` 守护
- `application.semantic` 与 `domain.semantic` 当前都已达到 `100%`，后续只接受真实缺陷驱动的补充
- `interfaces/api/v1/queries.py` 与 `interfaces/api/v1/semantic.py` 继续保持 `100%` 守护
- `shared` / `shared.utils` 当前已达 `100%`，后续只接受回归测试与真实缺陷驱动的补充

### 已在本项目中发现并修复的真实问题

- `ListTasksHandler` 现在会正确把 `created_by` 纳入查询列与过滤条件
- `rq_worker.py` 已移除对旧版 `rq.Connection` 顶层导出的兼容性依赖
- `escape_sql_value()` 现在会优先处理布尔值，正确返回 `TRUE / FALSE`
- 多个执行器不再把 `DataSource` 实体直接传给 `AdapterFactory`
- `extract_table_names()` 现在能正确解析普通 `FROM / JOIN` 语句中的表名
- 语义编译器不再把已限定列名错误地再次加上主 cube 前缀
- 语义视图非法 join path 现在会统一回落为 `CompilationError`，不再泄漏底层 `JoinGraph` 异常

## 4. 门槛策略

- 已在总覆盖率稳定达到 `>=85%` 后，把 `pytest.ini` 的 coverage 门槛抬到 `80`
- 已在总覆盖率稳定达到 `>=90%` 后，把 `pytest.ini` 的 coverage 门槛抬到 `85`
- 已在总覆盖率稳定达到 `>=93%` 后，把 `pytest.ini` 的 coverage 门槛抬到 `90`
- 已在总覆盖率稳定达到 `>=95%` 后，把门槛最终抬到 `95`

### 当前机器守护规则

- 总覆盖率：`>=95%`
- 二级模块统一门槛：全部 `>=95%`
- 核心模块守护：
  - `application.semantic`
  - `domain.semantic`
  - `application.dataset`
  - `application.datasource`
  - `application.query`
  - `infrastructure.repositories`
  - `shared`
  - `shared.utils`
- 当前以上核心模块都要求保持 `100%`

## 5. 更新规则

- 每完成一个模块波次，都必须更新本页的“当前快照”“二级模块均匀度”“当前维护重点”
- 快照中的总覆盖率、测试数量和模块数据必须来自最近一次 `make coverage-backend`
- 如果某个低覆盖模块暂时无法继续推进，必须在本页写明：
  - 文件或模块
  - 原因
  - 风险
  - 预计回收波次
