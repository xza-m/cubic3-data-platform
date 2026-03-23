# Change: 数据中心模块优化

## Why

数据中心作为 BI 平台的核心模块，承载着数据源连接、数据集管理、元数据配置等关键功能。随着业务发展和用户使用，当前实现中存在一些需要优化的问题和改进空间。本次优化旨在提升用户体验、增强功能完整性、改善系统性能和可维护性。

**当前背景**：
- 数据中心模块已完成基础架构重构（2026-01-21，参考 `openspec/changes/archive/2026-01-21-refactor-unify-data-center`）
- 模块包含数据源管理和数据集管理两个子功能
- 支持 PostgreSQL、MySQL、MaxCompute、ClickHouse、Hive 等多种数据源
- 实现了 DDD + CQRS 架构
- 支持物理表、SQL 虚拟表、CSV 文件三种数据集类型

**待优化的问题**：

### UI/UX 问题
1. **数据源创建表单过大**：新建数据源的 Modal 卡片占据整个屏幕，用户体验不佳
2. **输入框样式不统一**：各参数输入框样式不一致，需要统一使用现代化的输入组件
3. **重复的筛选控件**：数据源列表页筛选框和筛选按钮功能重复
4. **数据集字段配置表格过宽**：字段编辑表格占用空间过大，需要紧凑布局
5. **页面布局不统一**：物理数据集注册页面缺少返回按钮，与虚拟数据集、文件数据集页面不一致

### 功能 Bug
6. **业务类型和敏感级别不可修改**：数据集字段编辑时，业务类型和敏感级别下拉框无响应
7. **CSV 文件上传失败**：文件数据集注册时，CSV 上传功能异常（404 错误）
8. **虚拟数据集 SQL 执行失败**：SQL Lab 执行预览时报错（验证失败）

## What Changes

### 1. UI/UX 优化

**1.1 数据源创建表单优化**
- 缩小 Modal 宽度：从全屏改为固定宽度（建议 600-800px）
- 优化表单布局：紧凑化字段间距，改善视觉层次
- 统一输入框样式：使用 Ant Design 最新的 Input 组件规范

**1.2 数据源列表筛选优化**
- 移除独立的"筛选"按钮
- 集成筛选功能到搜索框（实时筛选或输入完成后自动筛选）

**1.3 数据集字段配置表格优化**
- 紧凑表格布局：减少列宽，优化间距
- 启用业务类型和敏感级别的下拉框交互
- 优化表格响应式设计

**1.4 页面布局统一**
- 为物理数据集注册页面添加返回按钮
- 统一三种数据集注册页面的头部布局
- 统一步骤条样式和交互

### 2. 功能修复

**2.1 修复字段属性编辑**
- 修复业务类型下拉框的 onChange 事件
- 修复敏感级别下拉框的 onChange 事件
- 确保字段属性可正常修改和保存

**2.2 修复 CSV 文件上传**
- 检查并修复 `/api/v1/files/upload` 端点
- 确保文件上传路由正确注册
- 优化文件解析和验证逻辑

**2.3 修复虚拟数据集 SQL 执行**
- 检查并修复 `/api/v1/sql_lab/execute` 端点
- 修复 SQL 验证逻辑
- 优化错误提示信息

**涉及模块**：
- 数据中心（Data Center）
  - 数据源管理（Datasources）
  - 数据集管理（Datasets）
  - 文件上传（File Upload）
  - SQL Lab

## Impact

**修改范围**：

**前端文件**：
- `frontend/src/pages/GlassDatasources.tsx` - 数据源列表（移除筛选按钮）
- `frontend/src/components/CreateDatasourceModal.tsx` 或相关组件 - 优化表单样式和尺寸
- `frontend/src/pages/GlassDatasetRegister.tsx` - 物理数据集注册（添加返回按钮）
- `frontend/src/pages/SqlLabRegister.tsx` - 虚拟数据集注册（统一布局）
- `frontend/src/pages/FileDatasetRegister.tsx` - 文件数据集注册（统一布局）
- `frontend/src/components/FieldConfigurator/FieldConfigurator.tsx` - 字段配置表格（修复下拉框、优化布局）

**后端文件**：
- `app/interfaces/api/v1/files.py` - 文件上传 API（修复 404）
- `app/interfaces/api/v1/sql_lab.py` - SQL Lab API（修复执行失败）
- `app/__init__.py` - 确保路由正确注册

**CSS 样式**：
- `frontend/src/styles/glassmorphism.css` - 可能需要调整样式

**潜在影响**：
- ✅ **正面影响**：显著提升用户体验，修复关键功能 Bug
- ⚠️ **需注意**：表单样式修改需确保不影响现有功能
- ⚠️ **需测试**：文件上传和 SQL 执行修复后需要充分测试

## Design Decisions

**设计原则**：
- 保持 DDD + CQRS 架构不变
- 优先考虑用户体验改进
- 确保向后兼容，不破坏现有功能
- 遵循已有的代码规范和设计模式

**技术选型**：
- 后端：Python + Flask + SQLAlchemy
- 前端：React + TypeScript + Ant Design
- 数据库：PostgreSQL

## Non-Goals

**不在本次优化范围内**：
- 不涉及数据中心的架构重构（已在上一版本完成）
- 不添加新的数据源类型（除非用户明确需求）
- 不改变核心业务逻辑

## Risks

**潜在风险**：
- （待根据具体优化内容评估）

**风险缓解**：
- 充分的测试覆盖
- 渐进式发布
- 保留回滚方案

---

## 下一步

请补充具体的优化点，包括但不限于：
- 功能改进需求
- 性能优化需求
- 用户体验优化
- Bug 修复
- 技术债务偿还

补充后，将更新本提案并创建详细的设计文档和任务清单。
