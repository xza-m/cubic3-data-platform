---
doc_type: architecture-index
status: maintained
source_of_truth: secondary
owner: engineering
last_reviewed: 2026-03-24
---

# 架构设计目录

本目录保存“当前架构为什么这样设计”的正文说明。
它不替代 [技术栈与架构说明](../TECH_STACK_AND_ARCHITECTURE.md) 的现状基线，也不替代 `docs/prd/` 与专题设计文档中的变更说明。

## 适用范围

- 想理解系统边界、模块职责和运行拓扑
- 想知道前后端为什么这样拆分
- 想查看当前仍有效的架构决策记录

不适合：

- 查启动命令、端口、代理和排障细节
- 直接判断某个历史方案是否仍有效
- 把某次规划稿、专题设计稿或原型稿当作已落地事实

## 推荐阅读顺序

1. [system-overview.md](system-overview.md)：系统全景、能力域、运行路径
2. [backend.md](backend.md)：后端分层、依赖注入、异步任务与语义存储
3. [frontend.md](frontend.md)：前端路由域、页面模型、数据访问与验证策略
4. [decisions/README.md](decisions/README.md)：当前仍有效的架构决策记录

## 当前文件

- [system-overview.md](system-overview.md)
  - 当前系统全景、主能力域、同步/异步/语义三条主路径
- [backend.md](backend.md)
  - Flask App Factory、依赖注入容器、后端分层与运行角色
- [frontend.md](frontend.md)
  - React SPA 路由结构、页面域、共享壳层与校验策略
- [decisions/README.md](decisions/README.md)
  - ADR 索引与维护规则

## 与其他文档的分工

- 当前现状、脚本、端口：看 [../TECH_STACK_AND_ARCHITECTURE.md](../TECH_STACK_AND_ARCHITECTURE.md)、[../QUICK_START.md](../QUICK_START.md)、[../STARTUP_GUIDE.md](../STARTUP_GUIDE.md)
- 产品目标和方案边界：看 [../prd/README.md](../prd/README.md)
- 设计草案和原型：看 [../reference-design/README.md](../reference-design/README.md)
- 历史重构和迁移背景：看 [../archive/README.md](../archive/README.md)
- 规划中变更：看 `docs/prd/README.md`、相关 ADR 与对应专题设计文档

## 维护规则

- 架构边界、运行拓扑、核心模块职责变化后，优先更新本目录和 `TECH_STACK_AND_ARCHITECTURE.md`
- ADR 只记录仍有效的当前决策；失效决策转入历史归档或在 ADR 中明确被替代
- 目录内文档以“当前态”为主，不追加一次性实施流水账
