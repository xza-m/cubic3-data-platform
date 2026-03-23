## MODIFIED Requirements

### Requirement: 文档结构 - 拆分为多个独立文档
系统 SHALL 将 `docs/readme.md` (3595 行) 拆分为 5 个独立文档，每个文档聚焦单一主题。

#### Scenario: 文档拆分结构
- **WHEN** 查看 `docs/` 目录
- **THEN** 包含以下文档：
  - `README.md` - 项目概览 (<200 行)
  - `ARCHITECTURE.md` - 架构设计
  - `API.md` - API 文档（链接到 `/docs`）
  - `DEPLOYMENT.md` - 部署指南
  - `DEVELOPMENT.md` - 开发指南
- **AND** 旧文档归档到 `docs/archive/readme-old.md`

#### Scenario: 项目概览文档
- **WHEN** 查看 `docs/README.md`
- **THEN** 包含以下内容：
  - 项目简介（1-2 段）
  - 核心功能列表
  - 技术栈概览
  - 快速开始（3 种启动方式）
  - 文档导航（链接到其他文档）
- **AND** 总行数不超过 200 行

#### Scenario: 架构设计文档
- **WHEN** 查看 `docs/ARCHITECTURE.md`
- **THEN** 包含以下内容：
  - Hexagonal + DDD + CQRS 架构说明
  - 分层架构图
  - 核心模式（依赖注入、适配器、仓储、CQRS、领域事件）
  - 数据源适配器设计
  - 前后端架构

#### Scenario: API 文档
- **WHEN** 查看 `docs/API.md`
- **THEN** 包含以下内容：
  - API 概览
  - 认证方式（JWT Bearer Token）
  - 链接到 Swagger UI (`/docs`)
  - 链接到 ReDoc (`/redoc`)
  - 链接到 OpenAPI 规范 (`/openapi.json`)
  - API 版本说明（v1）

#### Scenario: 部署指南文档
- **WHEN** 查看 `docs/DEPLOYMENT.md`
- **THEN** 包含以下内容：
  - Docker Compose 部署（3 种配置）
  - 生产环境部署（云服务器 + Nginx）
  - Kubernetes 部署（可选）
  - 环境变量配置说明
  - 数据库迁移步骤
  - 监控与日志配置

#### Scenario: 开发指南文档
- **WHEN** 查看 `docs/DEVELOPMENT.md`
- **THEN** 包含以下内容：
  - 环境搭建（Python + Node.js）
  - 本地开发启动
  - 代码规范（PEP 8 + TypeScript）
  - 测试运行（pytest）
  - 提交规范（Conventional Commits）
  - 贡献指南

### Requirement: 历史变更记录归档
系统 SHALL 移除文档中的历史变更记录，保留链接到 `openspec/changes/archive/` 目录。

#### Scenario: 变更记录归档
- **WHEN** 查看新文档
- **THEN** 不包含详细的历史变更记录
- **AND** 包含一句话说明："详细变更历史请查看 `openspec/changes/archive/`"
- **AND** 旧文档中的变更记录保留在 `docs/archive/readme-old.md`

### Requirement: TODO/FIXME 清理
系统 SHALL 清理代码中的 43 处 TODO/FIXME 注释，分类处理：修复、删除或转为 GitHub Issue。

#### Scenario: TODO 分类处理
- **WHEN** 扫描代码中的 TODO 注释
- **THEN** 分为三类：
  1. 立即修复（影响功能或安全）
  2. 转为 Issue（需要单独规划）
  3. 删除（已过时或不再需要）
- **AND** 清理后代码中不再包含 TODO/FIXME 注释

## ADDED Requirements

### Requirement: 文档同步机制
系统 SHALL 建立文档与代码同步机制，确保文档始终反映当前架构和功能。

#### Scenario: API 文档自动同步
- **WHEN** 修改 API 端点
- **THEN** OpenAPI 规范自动更新
- **AND** Swagger UI 自动反映最新变更
- **AND** 不需要手工更新 `docs/API.md`

#### Scenario: 架构文档更新
- **WHEN** 进行架构变更
- **THEN** 更新 `docs/ARCHITECTURE.md`
- **AND** 在 PR 中明确说明文档变更
- **AND** Code Review 检查文档是否同步
