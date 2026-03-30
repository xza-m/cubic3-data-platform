---
doc_type: adr
status: current
source_of_truth: secondary
owner: engineering
last_reviewed: 2026-03-24
---

# ADR-001 平台主线采用 React SPA + Flask API + 分层后端 + RQ 异步任务

## 状态

当前有效

## 背景

项目已经从早期的混合式页面和历史实现逐步收敛为独立前端工作台 + 后端 API 平台。
当前系统同时需要处理：

- 多业务域的工作台界面
- 数据中心和查询中心的同步请求
- 智能问数、飞书等外部集成
- 数据提取和应用执行等异步任务
- 语义层的文件型资产管理

如果继续采用“服务端页面 + 零散脚本 + 手工依赖拼装”的方式，模块边界和交付成本都会持续恶化。

## 决策

平台主线采用以下组合：

- 前端：`React SPA`
- 后端：`Flask REST API`
- 后端分层：`application / domain / infrastructure / interfaces`
- 持久化：`PostgreSQL + Redis + 文件型语义资产`
- 异步执行：`RQ + Redis`
- 依赖装配：`dependency-injector`

语义层保持“数据库事实 + YAML 资产仓储”的混合模式，而不是一次性引入更重的编译平台或工作流引擎。

## 理由

- React SPA 更适合当前多工作台、多任务流的界面复杂度
- Flask 仍能以较低复杂度承载当前 API 和集成适配需求
- 分层后端比单体脚本式组织更容易约束职责边界
- RQ 足以覆盖当前异步任务和交付场景，运维复杂度低于更重的任务编排系统
- 语义层文件仓储有利于当前 Cube / Domain / View / Recipe 的可读性与可迁移性

## 结果与约束

正面结果：

- 前后端职责边界清晰
- 异步任务、外部集成和语义资产有稳定落点
- 各业务域可以按相对独立的模块演进

约束：

- 任何新能力都应优先接入现有分层与 DI 容器，而不是绕开主线
- 不再新增以 Jinja 为主的页面流
- 新的重型异步框架、语义编译平台或二次导航壳层，只有在当前架构明显失效时才考虑引入

## 相关文档

- [../system-overview.md](../system-overview.md)
- [../backend.md](../backend.md)
- [../frontend.md](../frontend.md)
- [../../TECH_STACK_AND_ARCHITECTURE.md](../../TECH_STACK_AND_ARCHITECTURE.md)
