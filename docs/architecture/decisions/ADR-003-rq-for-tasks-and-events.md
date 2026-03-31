---
doc_type: adr
status: current
source_of_truth: secondary
owner: engineering
last_reviewed: 2026-03-24
---

# ADR-003 异步任务与领域事件统一基于 RQ + Redis 执行

## 状态

当前有效

## 背景

平台当前既有显式异步任务，也有领域事件驱动的后处理逻辑，例如：

- 数据提取执行
- SQL 异步查询
- 应用执行与交付
- 事件处理器异步消费

当前代码中，`TaskQueue` 基于 RQ 和 Redis 提供入队能力，`EventBus` 也复用同一套队列设施发布事件，Worker 通过 `create_app(role="worker")` 启动并在应用上下文中执行任务。

## 决策

当前阶段统一采用 `RQ + Redis` 作为异步执行底座：

- 显式业务任务通过 `TaskQueue` 入队
- 领域事件通过 `EventBus -> dispatcher.dispatch_event` 入队和分发
- Worker 作为独立进程运行，监听默认队列并在 Flask app context 中执行
- 业务状态、执行记录和恢复信息继续保存在数据库实体中

平台不引入第二套默认异步框架，也不把领域事件和业务任务拆成两套完全不同的执行系统。

## 理由

- 当前任务模型和事件处理复杂度仍适合轻量队列方案
- 统一底座可以减少运维、监控和调试心智负担
- RQ Worker 与 Flask app context 的结合足以承载当前依赖注入和数据库访问需求
- 数据库记录与队列执行分开，便于状态查询、失败排查和重启恢复

## 结果与约束

正面结果：

- 任务执行与事件消费共享同一套基础设施
- Worker 进程模型清晰，部署方式简单
- 提取任务等运行记录可以通过数据库回查和恢复

约束：

- 当前主队列仍以 `default` 为主，未建立复杂的优先级和多队列隔离策略
- 事件处理器必须可导入、可序列化为路径，并适合异步执行
- 新的长耗时任务或高优先级任务如果要单独拆队列，应作为显式架构演进处理
- 需要跨任务的复杂编排时，不能默认依赖现有 RQ 模型能够覆盖全部场景

## 相关文档

- [../backend.md](../backend.md)
- [../../semantic_verification.md](../../semantic_verification.md)
- [../../TECH_STACK_AND_ARCHITECTURE.md](../../TECH_STACK_AND_ARCHITECTURE.md)
