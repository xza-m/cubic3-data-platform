# Spec: 应用中心 (app-center)

## ADDED Requirements

### Requirement: 应用定义管理

系统 SHALL 支持应用定义的查询和管理，包括应用列表、应用详情、配置模板等。

#### Scenario: 获取应用列表
- **GIVEN** 系统中已注册多个应用定义
- **WHEN** 用户访问应用市场
- **THEN** 系统 SHALL 返回所有已启用的应用列表
- **AND** 每个应用 SHALL 包含名称、分类、描述、图标、统计信息

#### Scenario: 按分类筛选应用
- **GIVEN** 系统中有多个分类的应用
- **WHEN** 用户选择"BI集成"分类
- **THEN** 系统 SHALL 仅返回该分类下的应用

#### Scenario: 获取应用详情
- **GIVEN** 应用定义存在
- **WHEN** 用户查看应用详情
- **THEN** 系统 SHALL 返回应用的完整信息（包括配置说明、使用案例、配置模板）

#### Scenario: 获取应用配置表单 Schema
- **GIVEN** 应用定义包含 config_schema
- **WHEN** 用户创建应用实例
- **THEN** 系统 SHALL 返回 JSON Schema 用于生成表单
- **AND** Schema 应包含字段类型、必填项、默认值、验证规则

---

### Requirement: 应用实例生命周期管理

系统 SHALL 支持应用实例的创建、更新、删除、启用、禁用等生命周期管理。

#### Scenario: 创建应用实例
- **GIVEN** 用户提供实例名称和配置参数
- **WHEN** 用户创建应用实例
- **THEN** 系统 SHALL 验证配置参数是否符合 JSON Schema
- **AND** 系统 SHALL 创建实例记录并初始化为禁用状态
- **AND** 如果配置了定时调度，系统 SHALL 注册 APScheduler 任务

#### Scenario: 配置参数验证失败
- **GIVEN** 用户提供的配置不符合 JSON Schema
- **WHEN** 用户尝试创建实例
- **THEN** 系统 SHALL 返回 400 错误
- **AND** 错误信息 SHALL 包含具体验证失败的字段和原因

#### Scenario: 更新应用实例配置
- **GIVEN** 应用实例存在
- **WHEN** 用户更新配置参数或调度设置
- **THEN** 系统 SHALL 验证新配置
- **AND** 系统 SHALL 更新实例记录
- **AND** 如果调度配置变更，系统 SHALL 重新注册调度任务

#### Scenario: 删除应用实例
- **GIVEN** 应用实例存在
- **WHEN** 用户删除实例
- **THEN** 系统 SHALL 删除实例记录
- **AND** 系统 SHALL 取消关联的调度任务
- **AND** 历史执行记录 SHALL 保留（软删除）

#### Scenario: 启用应用实例
- **GIVEN** 应用实例处于禁用状态
- **WHEN** 用户启用实例
- **THEN** 系统 SHALL 更新实例状态为启用
- **AND** 如果配置了定时调度，系统 SHALL 开始按计划执行

#### Scenario: 禁用应用实例
- **GIVEN** 应用实例处于启用状态
- **WHEN** 用户禁用实例
- **THEN** 系统 SHALL 更新实例状态为禁用
- **AND** 系统 SHALL 暂停调度任务（不删除）
- **AND** 正在执行的任务 SHALL 继续完成

---

### Requirement: 应用执行调度

系统 SHALL 支持三种执行触发方式：定时调度、事件驱动、手动触发。

#### Scenario: 定时调度执行
- **GIVEN** 应用实例配置了 cron 表达式（如 `0 9 * * *`）
- **AND** 实例处于启用状态
- **WHEN** 到达预定时间
- **THEN** 系统 SHALL 自动创建执行记录
- **AND** 系统 SHALL 将任务推送到 RQ 队列
- **AND** RQ Worker SHALL 异步执行应用逻辑

#### Scenario: 事件驱动执行
- **GIVEN** 应用实例配置为事件触发（如监听"数据提取完成"事件）
- **AND** 实例处于启用状态
- **WHEN** 事件发生
- **THEN** 系统 SHALL 创建执行记录并推送到 RQ 队列

#### Scenario: 手动触发执行
- **GIVEN** 应用实例存在
- **WHEN** 用户点击"立即执行"按钮
- **THEN** 系统 SHALL 立即创建执行记录并推送到 RQ 队列
- **AND** 系统 SHALL 返回执行记录 ID
- **AND** 用户可通过 ID 查询执行状态

#### Scenario: 禁用实例不执行
- **GIVEN** 应用实例处于禁用状态
- **WHEN** 到达定时调度时间或事件触发
- **THEN** 系统 SHALL NOT 执行任务

---

### Requirement: 应用执行器抽象

系统 SHALL 提供执行器抽象，所有应用类型 SHALL 实现 `AppExecutor` 接口。

#### Scenario: 执行器工厂创建执行器
- **GIVEN** 应用定义的 code 为 `bi_dashboard_push`
- **WHEN** 系统需要执行该应用实例
- **THEN** ExecutorFactory SHALL 创建 `BiDashboardPushExecutor` 实例

#### Scenario: 执行器执行应用逻辑
- **GIVEN** 执行器实例已创建
- **AND** 应用实例配置有效
- **WHEN** 执行器调用 `execute()` 方法
- **THEN** 执行器 SHALL 执行应用特定的业务逻辑
- **AND** 执行器 SHALL 返回 `ExecutionResult`（包含状态、输出、错误信息）

#### Scenario: 执行器验证配置
- **GIVEN** 用户提供的配置参数
- **WHEN** 创建或更新实例前调用 `validate_config()`
- **THEN** 执行器 SHALL 验证配置的有效性
- **AND** 如果验证失败，SHALL 返回详细的错误信息

---

### Requirement: BI 看板推送应用

系统 SHALL 提供 BI 看板推送应用，调用 Superset 截图 API 并推送到飞书。

#### Scenario: 成功推送看板截图
- **GIVEN** 配置包含 Superset URL、看板 ID、飞书群 ID
- **AND** Superset API 可访问
- **WHEN** 执行 BI 看板推送
- **THEN** 系统 SHALL 调用 Superset 登录 API 获取 access token
- **AND** 系统 SHALL 调用 Superset 截图 API 请求生成截图
- **AND** 系统 SHALL 轮询获取截图结果（最多等待 30 秒）
- **AND** 系统 SHALL 将截图上传到 OSS
- **AND** 系统 SHALL 发送图片消息到飞书群
- **AND** 执行记录状态 SHALL 为 `success`

#### Scenario: Superset API 超时
- **GIVEN** Superset 截图 API 请求超时
- **WHEN** 执行 BI 看板推送
- **THEN** 系统 SHALL 重试最多 3 次
- **AND** 如果仍失败，执行记录状态 SHALL 为 `failed`
- **AND** error_message SHALL 包含详细的超时信息

#### Scenario: 使用消息模板
- **GIVEN** 配置包含消息模板 `📊 {{dashboard_name}}\n时间：{{date}}`
- **WHEN** 执行推送
- **THEN** 系统 SHALL 使用 Jinja2 渲染模板
- **AND** 变量 SHALL 被替换为实际值（如 `dashboard_name`、`date`）

---

### Requirement: 数据集卡片推送应用

系统 SHALL 提供数据集卡片推送应用，查询数据集元数据并生成飞书交互式卡片。

#### Scenario: 推送数据集卡片
- **GIVEN** 配置包含数据集 ID 和飞书群 ID
- **WHEN** 执行数据集卡片推送
- **THEN** 系统 SHALL 查询数据集元数据（名称、描述、字段、统计信息）
- **AND** 系统 SHALL 生成飞书交互式卡片 JSON
- **AND** 系统 SHALL 发送卡片到飞书群
- **AND** 卡片 SHALL 包含"查看详情"按钮（跳转到数据集详情页）

#### Scenario: 数据集不存在
- **GIVEN** 配置的数据集 ID 不存在
- **WHEN** 执行推送
- **THEN** 执行记录状态 SHALL 为 `failed`
- **AND** error_message SHALL 为 "数据集不存在"

---

### Requirement: 周报日报推送应用

系统 SHALL 提供周报日报推送应用，执行 SQL 查询并格式化为文本推送到飞书。

#### Scenario: 推送日报
- **GIVEN** 配置包含 SQL 查询、飞书群 ID、消息模板
- **WHEN** 执行日报推送
- **THEN** 系统 SHALL 执行 SQL 查询
- **AND** 系统 SHALL 将查询结果格式化为 Markdown 表格
- **AND** 系统 SHALL 使用 Jinja2 渲染消息模板
- **AND** 系统 SHALL 发送文本消息到飞书群

#### Scenario: SQL 查询失败
- **GIVEN** SQL 查询语法错误
- **WHEN** 执行推送
- **THEN** 执行记录状态 SHALL 为 `failed`
- **AND** error_message SHALL 包含 SQL 错误信息

#### Scenario: 查询结果为空
- **GIVEN** SQL 查询返回 0 行
- **WHEN** 执行推送
- **THEN** 系统 SHALL 发送"暂无数据"提示消息
- **AND** 执行记录状态 SHALL 为 `success`

---

### Requirement: 异常数据监控应用

系统 SHALL 提供异常数据监控应用，执行 SQL 查询并根据阈值判断是否告警。

#### Scenario: 触发异常告警
- **GIVEN** 配置包含 SQL 查询和阈值规则（如 `count > 100`）
- **WHEN** 执行监控
- **AND** SQL 查询结果满足阈值条件
- **THEN** 系统 SHALL 生成飞书告警卡片
- **AND** 卡片 SHALL 包含异常数据详情和时间
- **AND** 系统 SHALL 发送告警到飞书群

#### Scenario: 未触发告警
- **GIVEN** SQL 查询结果不满足阈值条件
- **WHEN** 执行监控
- **THEN** 系统 SHALL NOT 发送消息
- **AND** 执行记录状态 SHALL 为 `success`
- **AND** output SHALL 记录"未触发告警"

#### Scenario: 支持多种阈值规则
- **GIVEN** 阈值规则支持 `>`、`<`、`>=`、`<=`、`==`、`!=` 运算符
- **WHEN** 执行监控
- **THEN** 系统 SHALL 根据运算符判断是否告警

---

### Requirement: 查询结果推送应用

系统 SHALL 提供查询结果推送应用，执行 SQL 查询并格式化结果推送到飞书。

#### Scenario: 推送查询结果
- **GIVEN** 配置包含 SQL 查询和飞书群 ID
- **WHEN** 执行推送
- **THEN** 系统 SHALL 执行 SQL 查询
- **AND** 系统 SHALL 格式化结果为文本或表格
- **AND** 系统 SHALL 发送到飞书群

#### Scenario: 结果行数超过限制
- **GIVEN** SQL 查询返回 1000 行
- **AND** 配置的最大行数为 100
- **WHEN** 执行推送
- **THEN** 系统 SHALL 仅推送前 100 行
- **AND** 消息 SHALL 包含"结果已截断"提示

---

### Requirement: 数据提取通知应用

系统 SHALL 提供数据提取通知应用，监听数据提取完成事件并推送通知。

#### Scenario: 数据提取完成通知
- **GIVEN** 配置包含飞书群 ID
- **WHEN** 数据提取任务完成
- **THEN** 系统 SHALL 监听到"数据提取完成"事件
- **AND** 系统 SHALL 获取提取任务的详情（任务名、提取行数、耗时）
- **AND** 系统 SHALL 生成飞书通知卡片
- **AND** 系统 SHALL 发送到飞书群

#### Scenario: 数据提取失败通知
- **GIVEN** 数据提取任务失败
- **WHEN** 监听到"数据提取失败"事件
- **THEN** 系统 SHALL 发送失败通知
- **AND** 通知 SHALL 包含失败原因

---

### Requirement: 执行记录查询与监控

系统 SHALL 提供执行记录的查询、筛选、统计功能，支持实时监控。

#### Scenario: 查询执行记录列表
- **GIVEN** 系统中有多条执行记录
- **WHEN** 用户访问执行监控页面
- **THEN** 系统 SHALL 返回执行记录列表（分页）
- **AND** 每条记录 SHALL 包含执行时间、应用名称、实例名称、状态、耗时

#### Scenario: 按状态筛选执行记录
- **GIVEN** 用户选择"失败"状态
- **WHEN** 查询执行记录
- **THEN** 系统 SHALL 仅返回 status 为 `failed` 的记录

#### Scenario: 按时间范围筛选执行记录
- **GIVEN** 用户选择"最近 24 小时"
- **WHEN** 查询执行记录
- **THEN** 系统 SHALL 返回 started_at 在最近 24 小时内的记录

#### Scenario: 查看执行详情
- **GIVEN** 执行记录存在
- **WHEN** 用户点击记录查看详情
- **THEN** 系统 SHALL 返回完整的执行详情
- **AND** 详情 SHALL 包含输入参数、输出结果、错误信息、执行日志

#### Scenario: 获取执行统计信息
- **WHEN** 用户访问执行监控仪表盘
- **THEN** 系统 SHALL 返回统计信息
- **AND** 统计 SHALL 包含总执行次数、成功率、平均耗时、失败次数

#### Scenario: 实时刷新执行状态
- **GIVEN** 用户在执行监控页面
- **WHEN** 有新的执行记录产生
- **THEN** 前端 SHALL 通过轮询（每 5 秒）自动刷新
- **AND** 新记录 SHALL 自动出现在列表顶部

---

### Requirement: 配置表单生成

系统 SHALL 根据应用定义的 JSON Schema 自动生成配置表单。

#### Scenario: 渲染 JSON Schema 表单
- **GIVEN** 应用定义包含 config_schema（JSON Schema）
- **WHEN** 用户创建应用实例
- **THEN** 前端 SHALL 使用 react-jsonschema-form 渲染表单
- **AND** 表单 SHALL 包含所有字段、类型、默认值、验证规则

#### Scenario: 切换到代码模式
- **GIVEN** 用户在表单模式
- **WHEN** 用户点击"切换到代码模式"
- **THEN** 前端 SHALL 显示 Monaco Editor
- **AND** Editor SHALL 显示当前配置的 JSON 格式
- **AND** 用户可直接编辑 JSON

#### Scenario: 表单验证失败
- **GIVEN** 用户填写表单但未满足验证规则
- **WHEN** 用户尝试保存
- **THEN** 前端 SHALL 显示验证错误提示
- **AND** 错误提示 SHALL 定位到具体字段

---

### Requirement: 轻量级架构约束

应用中心 SHALL 保持轻量级架构，不引入重型依赖。

#### Scenario: 不使用浏览器自动化
- **GIVEN** 任何应用执行器实现
- **THEN** 执行器 SHALL NOT 依赖 Selenium、Puppeteer、Playwright 等浏览器自动化工具
- **AND** 所有截图等功能 SHALL 依赖专业平台的 API（如 Superset 截图 API）

#### Scenario: 依赖专业平台 API
- **GIVEN** BI 看板推送应用
- **THEN** 系统 SHALL 调用 Superset 内置截图 API
- **AND** 系统 SHALL NOT 自行实现截图功能

#### Scenario: 轻量级执行器
- **GIVEN** 任何应用执行器
- **THEN** 执行器单个实例内存占用 SHALL 小于 10MB
- **AND** 执行器 SHALL 支持 10-20 个并发实例

---

### Requirement: 异步任务队列

系统 SHALL 使用 RQ (Redis Queue) 实现异步任务执行。

#### Scenario: 任务推送到队列
- **GIVEN** 应用实例需要执行
- **WHEN** 触发执行（定时/事件/手动）
- **THEN** 系统 SHALL 创建执行记录
- **AND** 系统 SHALL 将任务推送到 RQ 队列
- **AND** API SHALL 立即返回（不阻塞）

#### Scenario: Worker 消费任务
- **GIVEN** RQ Worker 正在运行
- **AND** 队列中有待执行任务
- **WHEN** Worker 消费任务
- **THEN** Worker SHALL 调用 ExecutorFactory 创建执行器
- **AND** Worker SHALL 执行应用逻辑
- **AND** Worker SHALL 更新执行记录状态

#### Scenario: 任务执行失败重试
- **GIVEN** 任务执行失败（如网络超时）
- **WHEN** 任务配置了重试策略
- **THEN** RQ SHALL 自动重试（最多 3 次）
- **AND** 每次重试 SHALL 记录到执行日志

---

### Requirement: API 权限控制

系统 SHALL 基于用户身份控制应用实例的访问权限。

#### Scenario: 用户仅查看自己的实例
- **GIVEN** 当前用户为 `user_a`
- **WHEN** 查询应用实例列表
- **THEN** 系统 SHALL 仅返回 owner 为 `user_a` 的实例

#### Scenario: 用户无法修改他人实例
- **GIVEN** 实例 owner 为 `user_b`
- **AND** 当前用户为 `user_a`
- **WHEN** `user_a` 尝试更新或删除该实例
- **THEN** 系统 SHALL 返回 403 错误

#### Scenario: 管理员查看所有实例
- **GIVEN** 当前用户为管理员
- **WHEN** 查询应用实例列表
- **THEN** 系统 SHALL 返回所有实例（不受 owner 限制）

---

### Requirement: 前端路由与导航

系统 SHALL 提供应用中心的前端路由和导航菜单。

#### Scenario: 添加应用中心导航菜单
- **GIVEN** 用户登录系统
- **WHEN** 查看主导航
- **THEN** 主导航 SHALL 包含"应用中心"菜单项
- **AND** 菜单项图标 SHALL 为 `AppstoreOutlined`

#### Scenario: 路由配置
- **GIVEN** 前端路由配置
- **THEN** 系统 SHALL 支持以下路由
  - `/apps` - 应用市场
  - `/apps/:code/instances` - 应用实例管理
  - `/apps/executions` - 执行监控仪表盘

#### Scenario: 页面间导航
- **GIVEN** 用户在应用市场页面
- **WHEN** 用户点击应用卡片
- **THEN** 系统 SHALL 跳转到该应用的实例管理页面（`/apps/:code/instances`）
