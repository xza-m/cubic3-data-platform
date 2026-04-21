# 语义中心统一建模源设计

> 日期：2026-04-06
> 主题：以既有 `DatasetType` 为统一建模源语义，重构 `Dataset -> Cube` 建模链路

## 1. 背景

当前语义工作台已经切换到“资源库 + 工作台”的交互模型，但后端建模入口仍停留在 `draft-from-table`：

- 仅支持从物理表生成 Cube 草稿
- 前端不得不自行判断哪些资源可建模
- `virtual Dataset` 无法作为独立资源参与 Cube 建模
- `file Dataset` 缺少与当前 SQL 运行模型一致的执行绑定

这与当前产品边界不一致。现有产品语义已经明确：

- `Dataset`、`Cube`、`Domain` 都是独立实体
- 这些实体通过各自的中间态串连，而不是强从属关系
- `Dataset` 不应被简化为“物理表别名”

同时，仓库当前已经存在稳定的 `DatasetType` 体系：

- `physical`
- `virtual`
- `file`

本设计目标是在不破坏现有分层的前提下，把 `physical / virtual dataset` 纳入统一建模源，并明确 `file dataset` 暂不进入 Cube 建模。

## 2. 设计目标

- 以现有 `DatasetType` 作为建模源类型基线
- 新增统一建模入口，替代仅面向物理表的 `draft-from-table`
- 支持 `physical table / physical dataset / virtual dataset` 三类资源进入 Cube 草稿生成
- 把资源解析逻辑收口到 `application/semantic`，避免前端和 API 层散落分支判断
- 保持当前 `CubeDraft` 输出结构不变，减少对后续工作台的影响
- 让 `virtual dataset` 生成的 Cube 在 SQL 预览中以子查询形态运行

## 3. 非目标

- 当前阶段不实现多资源联合 AI 建模
- 当前阶段不重写 `CubeModelingService` 的草稿生成算法
- 当前阶段不改变 `Cube / Domain` 生命周期模型
- 当前阶段不扩展新的数据集类型枚举
- 当前阶段不支持 `file dataset -> cube`

## 4. 方案比较

### 方案 A：复用 `DatasetType`，引入统一建模源服务

做法：

- 保持 `domain` 只认现有 `DatasetType`
- 在 `application/semantic` 新增统一建模源解析服务
- API 提供统一入口 `draft-from-source`
- 前端统一提交资源引用，不再自行推断完整建模参数

优点：

- 符合 `KISS`：复用现有实体语义
- 符合 `DRY`：避免表建模与数据集建模两套链路
- 符合 `SOLID`：资源解析放到应用层，职责清晰

缺点：

- 需要新增应用层服务与 API 契约

### 方案 B：保留表建模入口，再补数据集专用入口

做法：

- 保留表建模专用入口
- 新增 `draft-from-dataset`
- 前端按资源类型决定调用哪个接口

优点：

- 落地快

缺点：

- 明显违背 `DRY`
- 前端要维护两套调用分支
- 后续扩展 `virtual dataset` 与其他建模源时还会继续膨胀

### 推荐结论

采用 **方案 A：复用 `DatasetType`，引入统一建模源服务**。

## 5. 统一建模源模型

### 5.1 ModelingSourceRef

前端提交的资源引用，语义上只表达“用户选择了什么”。

建议契约：

```json
{
  "source_kind": "physical_table",
  "source_id": 7,
  "database": "dw",
  "schema": "public",
  "table": "orders"
}
```

```json
{
  "source_kind": "dataset",
  "dataset_id": 123
}
```

### 5.2 ModelingContext

应用层统一后的建模上下文，语义上表达“AI 建模所需的完整输入”。

建议字段：

- `source_kind`
- `dataset_type`
- `source_id`
- `display_name`
- `database`
- `schema`
- `table`
- `sql_query`
- `file_metadata`
- `fields`
- `schema_snapshot`
- `description`

### 5.3 CubeDraft

保持当前 `CubeModelingService.generate_cube_draft()` 输出不变，避免工作台和预览页被牵连。

## 6. 三类候选建模源如何映射

### 6.1 physical table

来源：

- `source_id`
- `database/schema/table`

映射：

- 直接构造 `ModelingContext`
- 通过数据源适配器读取表结构

### 6.2 physical dataset

来源：

- `Dataset.physical_table`
- `Dataset.fields / schema_snapshot`

映射：

- 解析底层物理表
- 保留数据集级字段语义和描述信息

### 6.3 virtual dataset

来源：

- `Dataset.sql_query`
- `Dataset.fields / schema_snapshot`
- `Dataset.description`

映射：

- 以 SQL 与字段定义构造 `ModelingContext`
- 后续草稿生成不再依赖 `database/table` 必填

### 6.4 file dataset

来源：

- `Dataset.file_metadata`
- `Dataset.fields`
- `Dataset.schema_snapshot`
- `Dataset.sample_rows / sample_columns`

当前结论：

- 暂不纳入本轮 Cube 建模源
- 原因不是字段拿不到，而是当前运行时与 SQL 预览链路无法自然承接文件内存态数据
- 后续如需支持，应先把 `file dataset` 物化为可查询对象，再进入 Cube 建模

## 7. 分层落点

### 7.1 interfaces/api/v1/semantic.py

新增：

- `POST /api/v1/semantic/cubes/draft-from-source`

职责：

- 校验 `ModelingSourceRef`
- 调用应用层服务
- 返回统一 `CubeDraft`

不承担：

- 解析数据集类型细节
- 拼装字段与 SQL 上下文

### 7.2 application/semantic

新增：

- `cube_modeling_source_service.py`

职责：

- 解析 `ModelingSourceRef`
- 根据 `DatasetType` 生成 `ModelingContext`
- 调用 `CubeModelingService` 生成草稿

依赖：

- `IDatasetRepository`
- `IDatasourceRepository`
- `CubeModelingService`
- 现有字段/元数据服务

### 7.3 domain

保持：

- 继续使用现有 `DatasetType`
- 不新增语义中心专属 source type 枚举

## 8. API 契约

### 请求体

```json
{
  "source_kind": "dataset",
  "dataset_id": 123,
  "name": "orders_cube",
  "title": "订单分析",
  "description": "订单相关语义模型"
}
```

或：

```json
{
  "source_kind": "physical_table",
  "source_id": 7,
  "database": "dw",
  "schema": "public",
  "table": "orders"
}
```

### 响应体

沿用当前 `CubeDraftPayload`。

## 9. 前端改造原则

- `DevTools`、`RelationCanvas`、`CubeStudio` 等所有草稿创建入口统一改为 `createCubeDraftFromSource`
- 前端不再硬编码禁用 `virtual dataset`
- 前端对 `file dataset` 明确展示“暂不支持”，不再发送错误请求
- 前端只负责传递资源引用，不自行补齐后端必须字段
- 创建失败在工作台中只保留页面内错误，不重复弹 toast

## 10. 影响评估

### KISS

- 复用已有 `DatasetType`，不引入额外实体层

### YAGNI

- 只做统一建模源，不顺手扩多资源联合建模

### SOLID

- 前端负责选择资源
- API 负责收敛契约
- 应用层负责源解析与上下文组装

### DRY

- 一套建模入口覆盖物理表、physical dataset 和 virtual dataset

## 11. 实施顺序

1. 新增 `draft-from-source` 接口测试
2. 新增 `CubeModelingSourceService`
3. API 路由切换到统一入口，并移除旧 `draft-from-table`
4. 前端 semantic API 切换到新接口
5. 工作台与旧页面统一提交 `ModelingSourceRef`
6. 补前后端回归测试与文档
