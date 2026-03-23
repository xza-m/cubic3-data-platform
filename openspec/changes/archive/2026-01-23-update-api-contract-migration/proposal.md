# Change: 统一前后端契约并完成新架构迁移

## Why
当前存在新旧架构并行与接口契约不一致（字段缺失、枚举不一致、响应结构不统一），导致前后端联调成本高、线上可用性风险高。需要在不破坏 DDD/CQRS/Hexagonal 设计的前提下完成契约统一与迁移收敛。

## Goals
- 统一 API 响应结构、分页结构与字段命名规范
- 数据集（Dataset）对象全链路一致（列表/详情/创建/更新/统计/字段）
- 前端仅依赖 /api/v1 新架构端点，移除旧架构依赖
- 输出一套可验证的契约规范，便于后续演进

## Non-Goals
- 不新增业务功能（仅做迁移与对齐）
- 不引入新的 UI 设计风格
- 不改变数据库物理结构（除非为修复契约所必需）

## Options
### 方案 A（推荐）：服务端契约统一 + 前端对齐
- 服务端输出统一 `ApiResponse`，字段齐全
- 前端全部改为 `/api/v1` 并移除旧路径
- 清理或冻结旧 `/api/*` 端点

### 方案 B：前端适配兼容层
- 服务端保持现状
- 前端做映射与兼容
- 代价：逻辑分散、维护成本高、与“完全迁移”目标不符

## What Changes
- **BREAKING**: 旧 `/api/*` 端点直接下线，服务端返回 410
- 统一 `ApiResponse` 结构与错误返回规范
- 数据集对象字段与字段子对象补齐，枚举一致化
- 统计接口字段命名统一
- 统一字段识别业务类型枚举（partition_key / measure / dimension）

## Impact
- Affected specs: api-contract, dataset-contract
- Affected code:
  - 后端：`app/interfaces/api/v1/*`、`app/routes/*`、`app/domain/entities/dataset.py`、`app/application/dataset/*`
  - 前端：`frontend/src/api/*`、`frontend/src/pages/*`、`frontend/src/utils/*`、`frontend/src/types/*`

## Risks
- 旧端点被外部系统依赖（需确认是否存在外部调用；此变更不提供过渡期）
- 枚举值变更可能影响历史数据兼容
- 前端缓存数据结构更新引发隐藏错误

## Mitigations
- 在实施前完成外部依赖确认
- 提供契约校验与回归清单
- 在 tasks 中加入联调验证步骤
