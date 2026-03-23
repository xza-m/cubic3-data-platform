# Capability: Data Center - 统一数据中心

## ADDED Requirements

### Requirement: Unified Data Asset Navigation
系统 SHALL 提供统一的"数据中心"入口，将数据源管理和数据集管理整合为二级子菜单。

#### Scenario: User accesses Data Center from main menu
- **GIVEN** 用户已登录系统
- **WHEN** 用户点击主导航栏的"数据中心"菜单项
- **THEN** 系统显示展开的子菜单，包含"数据源"和"数据集"两个选项

#### Scenario: User navigates to Datasources submenu
- **GIVEN** 用户在"数据中心"主菜单
- **WHEN** 用户点击"数据源"子菜单
- **THEN** 系统跳转至 `/data-center/datasources` 路由并显示数据源列表页

#### Scenario: User navigates to Datasets submenu
- **GIVEN** 用户在"数据中心"主菜单
- **WHEN** 用户点击"数据集"子菜单
- **THEN** 系统跳转至 `/data-center/datasets` 路由并显示数据集列表页

#### Scenario: Main menu highlights correctly
- **GIVEN** 用户访问任意数据中心子页面（如 `/data-center/datasets/123`）
- **WHEN** 页面加载完成
- **THEN** 主导航中的"数据中心"菜单项保持高亮状态

---

### Requirement: Nested API Path Structure
系统 SHALL 使用 `/api/v1/data-center/{resource}/*` 作为数据源和数据集 API 的统一路径前缀。

#### Scenario: List datasources via new API path
- **GIVEN** 用户具有数据源访问权限
- **WHEN** 客户端发送 `GET /api/v1/data-center/datasources` 请求
- **THEN** 系统返回 200 状态码和数据源列表（格式与旧 API 一致）

#### Scenario: Create dataset via new API path
- **GIVEN** 用户具有数据集创建权限
- **WHEN** 客户端发送 `POST /api/v1/data-center/datasets` 请求并携带有效数据
- **THEN** 系统创建数据集并返回 201 状态码

#### Scenario: Legacy API path returns 404
- **GIVEN** 系统已完成迁移
- **WHEN** 客户端发送 `GET /api/v1/datasources` 请求
- **THEN** 系统返回 404 状态码
- **AND** 错误消息提示："API 已迁移至 /api/v1/data-center/datasources，请更新您的客户端"

#### Scenario: Legacy API path with query parameters returns 404
- **GIVEN** 系统已完成迁移
- **WHEN** 客户端发送 `GET /api/v1/datasets?page=2&source_id=10` 请求
- **THEN** 系统返回 404 状态码
- **AND** 错误消息包含新路径的完整示例

---

### Requirement: Frontend Route Consistency
前端路由 SHALL 与导航结构保持一致，使用 `/data-center/*` 作为路径前缀。

#### Scenario: Direct URL access to datasources
- **GIVEN** 用户在浏览器地址栏输入 `http://localhost:81/data-center/datasources`
- **WHEN** 页面加载完成
- **THEN** 系统显示数据源列表页
- **AND** 主导航中"数据中心"菜单项高亮

#### Scenario: Legacy frontend route shows 404 with guidance
- **GIVEN** 用户在浏览器地址栏输入 `http://localhost:81/datasources`
- **WHEN** 页面加载完成
- **THEN** 系统显示 404 页面
- **AND** 页面提示："此页面已迁移，请从'数据中心 > 数据源'访问，或直接访问 /data-center/datasources"
- **AND** 提供快捷跳转按钮

#### Scenario: Nested dataset routes work correctly
- **GIVEN** 用户访问数据集详情页
- **WHEN** URL 为 `/data-center/datasets/123`
- **THEN** 系统显示 ID 为 123 的数据集详情
- **AND** 面包屑显示 "数据中心 > 数据集 > dataset_name"

---

### Requirement: Immediate Migration Without Compatibility Layer
系统 SHALL 在部署后立即移除旧 API 路径，不提供兼容层或过渡期。

#### Scenario: Legacy API path returns 404 immediately after deployment
- **GIVEN** 系统已完成新版本部署
- **WHEN** 客户端发送 `GET /api/v1/datasources` 请求
- **THEN** 系统返回 404 状态码
- **AND** 错误消息提示新路径："API 已迁移至 /api/v1/data-center/datasources"

#### Scenario: New API path accessible immediately after deployment
- **GIVEN** 系统已完成新版本部署
- **WHEN** 客户端发送 `GET /api/v1/data-center/datasources` 请求
- **THEN** 系统返回 200 状态码和数据源列表

#### Scenario: Error message includes migration guide link
- **GIVEN** 客户端访问旧路径
- **WHEN** 收到 404 响应
- **THEN** 错误消息包含文档链接（如 `docs/readme.md#api-migration`）

---

### Requirement: Menu Collapse and Expand
"数据中心"主菜单 SHALL 支持展开和收起子菜单的交互。

#### Scenario: Main menu expands on click
- **GIVEN** "数据中心"主菜单处于收起状态
- **WHEN** 用户点击"数据中心"菜单项
- **THEN** 子菜单展开，显示"数据源"和"数据集"选项
- **AND** 菜单图标从 `▶` 变为 `▼`

#### Scenario: Main menu collapses on second click
- **GIVEN** "数据中心"主菜单已展开
- **WHEN** 用户再次点击"数据中心"菜单项
- **THEN** 子菜单收起，隐藏所有子菜单项
- **AND** 菜单图标从 `▼` 变为 `▶`

#### Scenario: Main menu auto-expands when accessing child route
- **GIVEN** 用户通过 URL 直接访问 `/data-center/datasets`
- **WHEN** 页面加载完成
- **THEN** "数据中心"主菜单自动展开
- **AND** "数据集"子菜单项显示为选中状态

---

### Requirement: Permission-Based Submenu Visibility
子菜单项 SHALL 根据用户权限动态显示或隐藏。

#### Scenario: User with datasource permission sees submenu
- **GIVEN** 用户具有 `datasource:view` 权限
- **WHEN** 用户访问系统
- **THEN** "数据中心"主菜单可见
- **AND** "数据源"子菜单可见

#### Scenario: User without dataset permission hides submenu
- **GIVEN** 用户不具有 `dataset:view` 权限
- **WHEN** 用户展开"数据中心"主菜单
- **THEN** "数据集"子菜单不可见或显示为禁用状态

#### Scenario: User without any data center permission hides main menu
- **GIVEN** 用户既无 `datasource:view` 也无 `dataset:view` 权限
- **WHEN** 系统渲染导航栏
- **THEN** "数据中心"主菜单完全隐藏

---

### Requirement: Dashboard Quick Access Update
控制台首页的快捷卡片 SHALL 更新链接目标至新的数据中心路由。

#### Scenario: Dashboard datasource card links to new route
- **GIVEN** 用户在控制台首页
- **WHEN** 用户点击"数据源管理"快捷卡片
- **THEN** 系统跳转至 `/data-center/datasources`

#### Scenario: Dashboard dataset card links to new route
- **GIVEN** 用户在控制台首页
- **WHEN** 用户点击"数据集管理"快捷卡片
- **THEN** 系统跳转至 `/data-center/datasets`

---

### Requirement: API Documentation Update
API 文档 SHALL 反映新的路径结构，并标注旧路径为已弃用。

#### Scenario: API docs display new paths prominently
- **GIVEN** 开发者访问 API 文档页面
- **WHEN** 查看数据源相关 API
- **THEN** 文档显示 `/api/v1/data-center/datasources` 作为主要路径
- **AND** 旧路径 `/api/v1/datasources` 标注为 `[DEPRECATED]`

#### Scenario: API docs include migration guide
- **GIVEN** 开发者访问 API 文档
- **WHEN** 查看"迁移指南"章节
- **THEN** 文档包含完整的路径映射表和代码示例
- **AND** 提供旧路径的重定向逻辑说明

---

## MODIFIED Requirements

（无，当前变更为新增功能，不涉及修改现有需求）

---

## REMOVED Requirements

### Requirement: Independent Top-Level Datasource Menu
**Reason**: 整合到"数据中心"主菜单下，不再作为独立顶级菜单

**Migration**: 
- 用户应从"数据中心 > 数据源"访问
- 直接访问旧路由将自动重定向

---

### Requirement: Independent Top-Level Dataset Menu
**Reason**: 整合到"数据中心"主菜单下，不再作为独立顶级菜单

**Migration**: 
- 用户应从"数据中心 > 数据集"访问
- 直接访问旧路由将自动重定向
