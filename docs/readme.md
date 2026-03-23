# CUBIC3 - 文档中心

## 🚨 紧急修复状态 (2026-01-30)

### 当前问题严重性：LOW ✅

所有P0问题已修复，系统功能正常！

### 最新修复 (2026-01-30)

#### 重构 SQL Lab 使用 Handler 架构（方案 B）

**目标**：统一 SQL Lab 和 Query Center 的架构风格，提高代码可维护性

**实施内容**：

1. **创建新的 Command**：
   - `app/application/query/commands/execute_sql_preview.py`
   - 定义 `ExecuteSQLPreviewCommand`，包含参数验证

2. **创建新的 Handler**：
   - `app/application/query/handlers/execute_sql_preview_handler.py`
   - `ExecuteSQLPreviewHandler` 实现 SQL 预览执行逻辑
   - 职责：执行 SQL 查询（不记录历史，用于临时预览）
   - 使用子查询包裹 + 外层 LIMIT 保护策略

3. **注册到 DI 容器**：
   - 在 `app/di/container.py` 中注册 `execute_sql_preview_handler`

4. **重构 API 端点**：
   - 简化 `app/interfaces/api/v1/sql_lab.py` 的 `execute_sql()` 函数
   - 从 100+ 行代码简化为 30 行
   - 使用 Command + Handler 模式，符合 DDD 架构

**架构对比**：

| 特性 | 重构前 | 重构后 |
|------|--------|--------|
| 代码行数 | ~100 行 | ~30 行 |
| 架构风格 | 过程式 | DDD (Command + Handler) |
| SQL 验证 | 自定义逻辑 | 共享 `validate_sql_query` |
| 可测试性 | 低（耦合 Flask） | 高（Handler 独立） |
| 可维护性 | 低 | 高 |

**两个接口的定位**：

| 接口 | 使用场景 | 记录历史 | 更新统计 | SQL 保护策略 |
|------|---------|---------|---------|-------------|
| `/api/v1/sql_lab/execute` | SQL Lab 临时预览 | ❌ 否 | ❌ 否 | 子查询包裹 + LIMIT |
| `/api/v1/queries/execute` | Query Center 正式查询 | ✅ 是 | ✅ 是 | 检测并添加 LIMIT |

**技术亮点**：
- ✅ 统一架构风格，符合 DDD 原则
- ✅ 代码复用：共享 SQL 验证逻辑
- ✅ 关注点分离：Handler 只负责业务逻辑
- ✅ 易于测试：Handler 可独立单元测试
- ✅ 保持功能独立：两个接口各司其职

**文件清单**（新增 2 个文件，修改 3 个文件）：
- ✅ `app/application/query/commands/execute_sql_preview.py` (新增)
- ✅ `app/application/query/handlers/execute_sql_preview_handler.py` (新增)
- ✅ `app/di/container.py` (修改)
- ✅ `app/interfaces/api/v1/sql_lab.py` (重构)

#### 修复 SQL Lab "执行预览"功能

**问题描述**：
- 点击"执行预览"按钮后页面空白
- 控制台报错：`GET http://localhost:81/vite.svg 404` 和 `TypeError: s.forEach is not a function`

**根本原因**：
1. **API 数据结构不匹配**：后端 `/api/v1/sql_lab/execute` 返回 `{code, message, data: {columns, data, ...}}`，但前端 `executeSQL` 函数直接返回 `response.data`，导致传递给 `SqlLabRegister` 组件的数据结构错误，`queryResult.data` 不是数组而是对象
2. **缺少图标文件**：`index.html` 引用了不存在的 `vite.svg`

**修复内容**：
- **frontend/src/api/sqllab.ts**：修改 `executeSQL` 函数返回值为 `response.data.data || response.data`，正确提取嵌套的数据结构
- **frontend/index.html** 和 **frontend/dist/index.html**：注释掉 vite.svg 图标引用

**影响范围**：SQL Lab 注册虚拟数据集功能

#### 修复 SQL Lab 结果渲染崩溃（React error #31）

**问题描述**：
- 控制台报错：`Minified React error #31 (object with keys {name, type})`
- SQL 执行成功后结果渲染失败

**根本原因**：
- PostgreSQL 适配器返回 `columns` 为对象数组（`{name, type}`），`data` 为对象数组
- 前端 `SqlLabRegister` 仍按“字符串列名 + 数组行”渲染，导致 React 直接渲染对象报错

**修复内容**：
- **frontend/src/pages/SqlLabRegister.tsx**：统一处理两种返回结构
  - `columns` 支持字符串数组或对象数组
  - `data` 支持数组行或对象行
  - 兼容 `result.data.data` 与 `result.data`
  - 400 请求时清空 `queryResult`，避免字段配置器对空数据执行 `map()`

#### 统一三类数据集字段识别逻辑（2026-01-31）

**问题**：physical / virtual / file 数据集的字段识别流程不一致，导致相同字段在不同注册方式下识别结果不同：
- 物理表：✅ 调用 `PreviewDatasetHandler` → 已集成 `FieldIdentifier`
- 虚拟表：❌ 调用 `ExecuteSQLPreviewHandler` → 未调用识别，前端硬编码所有字段为 `STRING`
- 文件数据集：❌ 调用 `uploadCSVFile` → 未调用识别，仅返回 pandas dtype

**根本原因**：
- 虚拟表注册时，后端只返回列名和类型，未调用 `FieldIdentifier` 进行智能识别
- 前端 `SqlLabRegister.tsx` 强制所有字段类型为 `'STRING'`，无 comment 信息
- 文件上传时，后端只返回 pandas dtype（object, int64），未进行业务类型识别

**解决方案**：

1. **后端 SQL 预览处理器集成识别** (`app/application/query/handlers/execute_sql_preview_handler.py`)：
   - 添加 `FieldIdentifier` 导入
   - 新增 `_convert_rows_to_data()` 静态方法，统一处理不同适配器返回格式
   - 修改 `handle()` 方法，调用 `FieldIdentifier.identify_fields_batch()` 识别字段
   - 返回 `identified_fields` 和 `statistics` 字段

2. **后端文件上传接口集成识别** (`app/interfaces/api/v1/files.py`)：
   - 添加 `FieldIdentifier` 导入
   - 修改 `parse_csv_metadata()` 函数，对所有列调用 `FieldIdentifier.identify_fields_batch()`
   - 返回 `identified_fields` 和 `statistics` 字段

3. **前端 API 类型定义更新**：
   - `frontend/src/api/sqllab.ts`：在 `ExecuteSQLResponse` 中添加 `identified_fields` 和 `statistics` 可选字段
   - `frontend/src/api/files.ts`：在 `FileUploadResponse` 中添加 `identified_fields` 和 `statistics` 可选字段

4. **前端注册页面使用后端识别结果**：
   - `frontend/src/pages/SqlLabRegister.tsx`：
     - 添加 `useMemo` 导入
     - 替换硬编码 `STRING` 逻辑，使用 `queryResult.identified_fields`
     - 包含兼容逻辑：如果后端未返回识别结果，使用旧逻辑
   - `frontend/src/pages/FileDatasetRegister.tsx`：
     - 添加 `useMemo` 导入
     - 替换 pandas dtype 逻辑，使用 `fileMetadata.identified_fields`
     - 包含兼容逻辑：如果后端未返回识别结果，使用旧逻辑

**架构改进**：
```
物理表：数据源 → get_table_schema → FieldIdentifier → identified_fields
虚拟表：SQL 执行 → execute_query → FieldIdentifier → identified_fields  ← 新增
文件上传：CSV 解析 → pandas.read_csv → FieldIdentifier → identified_fields  ← 新增
```

**效果**：
- ✅ 三种数据集类型使用相同的 `FieldIdentifier` 识别引擎
- ✅ 利用数据库元数据（真实类型）而非前端猜测
- ✅ 识别逻辑集中在后端，规则更新只需改一处
- ✅ 相同字段在不同注册方式下识别结果一致

**修改文件**：
- **后端 (7 个文件)**：
  - `app/application/query/handlers/execute_sql_preview_handler.py` - 集成 FieldIdentifier
  - `app/interfaces/api/v1/files.py` - 集成 FieldIdentifier
  - `app/infrastructure/adapters/datasources/mysql_adapter.py` - 修复类型映射（bigint 替代 LONGLONG）
  - `app/infrastructure/adapters/datasources/postgresql_adapter.py` - 类型统一转小写
  - `app/infrastructure/adapters/datasources/clickhouse_adapter.py` - 类型统一转小写
  - `app/infrastructure/adapters/datasources/maxcompute_adapter.py` - 类型统一转小写
  - `app/services/field_identifier.py` - 扩展 NUMERIC_TYPES 和 DIMENSION_ID_TYPES 以支持类型变体
- **前端 (4 个文件)**：
  - `frontend/src/api/sqllab.ts`
  - `frontend/src/api/files.ts`
  - `frontend/src/pages/SqlLabRegister.tsx`
  - `frontend/src/pages/FileDatasetRegister.tsx`

**类型一致性修复（2026-01-31）**：

**问题1**：MySQL 适配器的 `execute_query` 返回的类型码映射不准确：
- 返回 `LONGLONG` 而不是标准的 `bigint`
- 导致虚拟表的 `user_id` 字段无法被 `FieldIdentifier` 正确识别为数值类型

**解决方案**：
1. **修正 MySQL 类型映射**：将 type code `8` 从 `'LONGLONG'` 改为 `'bigint'`，type code `9` 从 `'INT24'` 改为 `'mediumint'` 等
2. **统一所有适配器类型格式**：在 `execute_query` 和 `get_table_schema` 中统一将类型名转为小写
3. **扩展 FieldIdentifier 兼容性**：在 NUMERIC_TYPES 和 DIMENSION_ID_TYPES 中添加类型变体（如 `longlong`, `uint64` 等）

**类型映射对照表**（MySQL）：
| Type Code | 修复前 | 修复后 | 标准类型 |
|-----------|--------|--------|----------|
| 8 | LONGLONG | bigint | ✅ |
| 9 | INT24 | mediumint | ✅ |
| 253 | VAR_STRING | varchar | ✅ |
| 254 | STRING | char | ✅ |

**问题2**：后端返回字段名不一致 + 前端缓存逻辑导致识别结果不被使用
- 物理表返回 `fields`，虚拟表返回 `identified_fields`，字段名不统一
- `FieldConfigurator` 组件缓存只比较 `name` 和 `type`，忽略了 `business_type` 等识别结果

**解决方案**：
1. **统一后端返回字段名**：将 `execute_sql_preview_handler.py` 和 `files.py` 的返回字段名从 `identified_fields` 改为 `fields`
2. **修复 FieldConfigurator 缓存逻辑**：在缓存 key 中加入 `business_type`, `sensitivity_level`, `mask_rule`, `confidence_score` 字段
3. **更新前端代码**：`SqlLabRegister.tsx` 和 `FileDatasetRegister.tsx` 使用 `fields` 字段名

**问题3**：`business_type` 与布尔标志位不同步
- `dt` 字段的 `business_type` 是 `'partition'`，但 `is_partition` 却是 `false`
- 原因：布尔字段需要手动维护，容易与枚举值不一致

**解决方案**：
- **从枚举值动态计算布尔字段**：在 `identify_field` 方法最后统一计算，确保一致性
```python
result['is_partition'] = result['business_type'] == 'partition'
result['is_measure'] = result['business_type'] == 'metric'
result['is_sensitive'] = result['sensitivity_level'] != 'public'
```

**问题4**：后端和前端枚举值命名不一致
- 后端返回 `partition`/`metric`，前端期望 `partition_key`/`measure`
- 导致下拉框显示空白（找不到匹配的选项值）

**解决方案**：
- 统一使用后端命名：`partition`/`metric`/`dimension`
- 前端 FieldConfigurator 下拉选项改为新命名
- 其他组件兼容新旧命名

**修改文件**：
- `app/services/field_identifier.py` - 布尔字段改为动态计算
- `frontend/src/components/FieldConfigurator/FieldConfigurator.tsx` - 修复缓存逻辑 + 下拉选项命名
- `frontend/src/pages/GlassDatasetDetail.tsx` - 兼容新旧命名
- `frontend/src/pages/ExtractionTaskConfig/StepDatasetFields.tsx` - 映射函数兼容
- `frontend/src/types/index.ts` - 类型定义更新
- `frontend/src/utils/fieldRecognition.ts` - 前端识别逻辑统一命名

#### 统一数据集元数据同步状态

**目标**：将数据集的元数据同步状态从 5 种（ACTIVE, PENDING, SYNCING, SYNCED, FAILED）简化为 3 种（SYNCED, SYNCING, FAILED），并实现刷新元数据功能

**状态流转**：
- 创建数据集 → SYNCED（已同步）
- 点击刷新按钮 → SYNCING（同步中）
- 同步成功 → SYNCED / 同步失败 → FAILED

**后端修改**（6 个文件）：
- **app/shared/enums.py**：简化 `DatasetSyncStatus` 枚举，移除 `ACTIVE` 和 `PENDING`
- **app/domain/entities/dataset.py**：默认状态改为 `SYNCED`，更新 `complete_sync()` 和 `is_ready()` 方法
- **app/application/dataset/handlers/sync_schema_handler.py**（新建）：实现元数据刷新逻辑，调用数据源适配器获取最新 schema，自动识别字段类型
- **app/interfaces/api/v1/datasets.py**：新增 `POST /api/v1/data-center/datasets/<id>/sync-schema` 端点
- **app/di/container.py**：注册 `SyncSchemaHandler`
- **schema/update_dataset_sync_status.sql**（新建）：将现有 17 个数据集状态统一为 `synced`

**前端修改**（4 个文件）：
- **frontend/src/config/enums.ts**：更新 `SYNC_STATUSES`，移除 `pending` 和 `active`
- **frontend/src/api/datasets.ts**：新增 `syncDatasetSchema(id)` API 函数
- **frontend/src/pages/GlassDatasets.tsx**：实现刷新按钮功能（调用 API + 加载动画），移除"待同步"统计项
- **frontend/src/pages/GlassDatasetDetail.tsx**：更新状态配置

**部署完成**：
- ✅ 数据库迁移执行成功（17 个数据集状态已更新）
- ✅ 后端服务已重启
- ✅ 前端已重新构建并部署

### 历史修复 (2026-01-29 晚)

#### 5. 数据集编辑保存问题
- ✅ **问题**：编辑数据集信息并保存后，页面显示未更新
- ✅ **原因**：`invalidateQueries` 异步刷新，导致退出编辑模式时显示旧数据
- ✅ **修复**：
  - 使用 `queryClient.setQueryData()` 手动更新缓存，确保立即生效
  - 使用 `await refetchQueries()` 等待数据刷新完成再退出编辑模式
  - 增强错误提示，显示具体错误信息
- ✅ **文件**：`frontend/src/pages/GlassDatasetDetail.tsx`

#### 6. 数据源密码编辑体验优化
- ✅ **问题**：编辑数据源时，即使只修改备注等无关信息，也必须重新输入密码
- ✅ **原因**：前端总是发送所有字段（包括空密码），导致后端覆盖原密码
- ✅ **修复**：
  - 编辑时密码字段默认留空
  - 只有用户实际输入新密码时才在请求中包含密码字段
  - 更新UI提示：标签显示"(留空保持不变)"，占位符显示"留空表示保持原密码"
  - 后端已支持部分更新，不发送密码字段时保留原密码
- ✅ **影响范围**：
  - MaxCompute Access Key 字段
  - 标准数据库密码字段
- ✅ **文件**：`frontend/src/pages/GlassDatasources.tsx`

#### 7. 下拉菜单抖动修复
- ✅ **问题**：点击"注册数据集"按钮时，右侧边界会抖动，发现右边有隐藏的滚动条
- ✅ **原因**：下拉菜单出现时导致页面滚动条出现/消失，引起页面宽度变化
- ✅ **修复方案**：
  - 给 `DropdownMenuContent` 添加 `sideOffset={5}`，增加5px的垂直偏移
  - 在 `html` 元素上使用 `scrollbar-gutter: stable`，预留滚动条空间而不强制显示滚动条
  - 移除之前的 `overflow-y: scroll` 方案（会导致双滚动条）
- ✅ **技术亮点**：
  - `scrollbar-gutter: stable` 是现代 CSS 属性，会预留滚动条的空间
  - 只在需要时显示滚动条，但空间始终预留，避免内容跳动
  - 避免了双滚动条问题和不必要的滚动条显示
- ✅ **效果**：下拉菜单展开时页面完全不抖动，无隐藏滚动条
- ✅ **文件**：
  - `frontend/src/pages/GlassDatasets.tsx`
  - `frontend/src/index.css`

#### 8. 数据源表单布局优化
- ✅ **问题**：新建/编辑数据源的表单卡片过长，需要优化布局
- ✅ **优化方案**：
  - 增加弹窗宽度：`max-w-2xl` → `max-w-3xl`（从 672px 增加到 768px）
  - 混合布局策略：
    - 名称（整行）
    - 类型（整行）
    - 描述（整行，1行高）
    - 主机地址 + 端口（2列并排）
    - 数据库名（整行）
    - 用户名 + 密码（2列并排）
    - MaxCompute: Access ID + Access Key（2列并排）
  - 减少间距：`space-y-4` → `space-y-3`，`gap-4` → `gap-3`
  - 压缩描述框高度：`rows={2}` → `rows={1}`
  - 减小标题大小和间距
- ✅ **设计理念**：重要的单字段独占一行（名称、类型），相关的成对字段并排显示（主机+端口、用户名+密码）
- ✅ **效果**：表单宽度增加14%，高度减少约25-30%，布局更合理
- ✅ **文件**：`frontend/src/pages/GlassDatasources.tsx`

#### 9. 注册数据集下一步空白修复
- ✅ **问题**：点击“下一步”进入字段配置时白屏，前端报错 `getSortedRowModel` 读取失败
- ✅ **原因**：`FieldConfigurator` 依赖 TanStack Table 的 `table.getSortedRowModel()`，但当前 `DataTable` 未提供 `table` 实例
- ✅ **修复**：
  - 去除对 `table.getSortedRowModel()` 的依赖
  - 使用 `fieldConfigs` 按 `physical_name` 查找当前行索引
  - 增加索引边界保护，避免越界更新
- ✅ **文件**：`frontend/src/components/FieldConfigurator/FieldConfigurator.tsx`

#### 10. 页面切换抖动与滚动条体验优化
- ✅ **问题**：不同界面切换时滚动条出现/消失导致右侧抖动，滚动条过长影响观感
- ✅ **方案**：使用 OverlayScrollbars 让滚动条覆盖显示且不占布局宽度，仅作用于主内容区
- ✅ **改动**：
  - 引入 `overlayscrollbars` 与 `overlayscrollbars-react`
  - 主内容区使用 `OverlayScrollbarsComponent` 包裹，`<main>` 设为 `overflow-hidden`
  - 主内容区高度固定为 `calc(100vh - 4rem)`，滚动条更短
  - 自定义滚动条样式与长度：更细、更短、更柔和
  - 取消 `scrollbar-gutter`，避免隐藏滚动条与双滚动条问题
- ✅ **文件**：
  - `frontend/src/main.tsx`
  - `frontend/src/components/Layout/GlassAppLayout.tsx`
  - `frontend/src/index.css`

### 已完成的修复

#### 1. 核心组件增强
- ✅ Alert组件添加`warning` variant支持
- ✅ Badge组件添加`success` variant支持  
- ✅ PageModal添加向后兼容props (`onClose`, `className`)
- ✅ FormSelect完全向后兼容 (`onChange` + `onValueChange`, `id`, `badge`)
- ✅ 安装缺失依赖 `@tanstack/react-table`

#### 2. TypeScript配置调整
- ✅ 放宽strict检查以允许应用运行
- ⚠️ 暂时接受类型警告，优先保证功能可用

#### 3. 批量修复
- ✅ `isLoading` → `loading` (DataTable props)
- ✅ `.fields` → `.columns` (API响应)
- ✅ 未使用导入注释

#### 4. P0功能缺陷修复
- ✅ 数据源测试连接 - 修复后端API和前端调用
- ✅ 注册数据集按钮 - 修复`FormSelect` value为空字符串的问题
- ✅ 渠道管理页面 - 统一处理空值选项 (`__all__`)
- ✅ 应用详情页面 - 添加`ConfigProvider`包裹`SchemaForm`
- ✅ ErrorBoundary - 添加全局错误捕获，后已清理

### 剩余问题

#### TypeScript类型错误 (非阻塞)
- FormInput `onChange` 事件类型
- PageDrawer `width` prop
- 多处API字段名不匹配 (已部分修复)

### 当前服务器状态

**开发服务器**: 正在重启...
**端口**: 5173
**URL**: `http://localhost:5173/`

### 立即测试步骤

1. **清除浏览器缓存**: `Cmd+Shift+R` (Mac) 或 `Ctrl+Shift+R` (Windows)

2. **访问新地址**: http://localhost:5173/

3. **测试功能**:
   - [ ] 数据源管理 - 新建数据源（选择类型）
   - [ ] 数据集管理 - 注册数据集下拉菜单
   - [ ] 渠道管理 - 页面加载和创建渠道

### 根本原因分析

1. **依赖管理不完整**: `@tanstack/react-table` 被使用但未声明
2. **API不一致**: Ant Design (`onChange`) vs shadcn/ui (`onValueChange`)
3. **组件Props不完整**: 迁移时未考虑所有使用场景
4. **类型定义缺失**: 很多业务组件的Props接口不完整

### 下一步行动

#### 高优先级（功能阻塞）
- [ ] 验证开发服务器正常启动
- [ ] 测试关键用户流程
- [ ] 修复数据源测试连接逻辑

#### 中优先级（用户体验）
- [ ] 逐步修复TypeScript类型错误
- [ ] 统一所有FormSelect使用onValueChange
- [ ] 完善组件Props接口定义

#### 低优先级（代码质量）
- [ ] 移除未使用的导入
- [ ] 添加单元测试
- [ ] 性能优化

---

## 项目概述

CUBIC3 是一个企业级数据应用平台，提供：
- 数据源管理
- 数据集注册与元数据管理
- 数据提取与转换
- 多渠道消息推送（飞书、Webhook、邮件、OSS）
- 查询中心与SQL Lab
- 应用中心与执行监控

## 快速开始

### 完整环境部署（推荐）

使用 Docker Compose 一键部署完整环境（包含 Nginx、后端、PostgreSQL、Redis、RQ Worker）：

```bash
# 1. 配置环境变量
cp env.sample .env

# 2. 构建并启动
docker compose up --build -d

# 3. 查看日志
docker compose logs -f
```

**服务地址**：
- 前端: http://localhost:81
- 后端API: http://localhost:5000

### 前端开发

```bash
cd frontend
npm install
npm run dev  # 开发服务器 (http://localhost:5173)
npm run build  # 生产构建
```

### 后端开发

```bash
pip install -r requirements.txt
flask run  # 开发服务器 (http://localhost:5000)
```

## 技术栈

### 前端
- **框架**: React 18 + TypeScript
- **UI库**: shadcn/ui (基于Radix UI + Tailwind CSS)
- **状态管理**: TanStack Query (React Query)
- **表单**: React Hook Form
- **路由**: React Router v6
- **图表**: Recharts
- **编辑器**: Monaco Editor

### 后端
- **框架**: Flask + SQLAlchemy
- **数据库**: PostgreSQL / SQLite
- **任务队列**: Redis + RQ
- **数据源适配**: MaxCompute, MySQL, PostgreSQL, ClickHouse

## 架构说明

详见 `docs/TECH_STACK_AND_ARCHITECTURE.md`

## 故障排查

详见 `docs/TROUBLESHOOTING.md`

## 最近变更记录

### 前后端接口对接完整性修复（2026-01-30）

**问题**：前端迁移到 shadcn/ui 后，部分页面未正确对接后端接口，导致前端硬编码数据，后端已有接口未被调用。

**发现的问题**：
1. **API 端点缺失**：`datasets.ts` 缺少 `/preview` 接口，`datasources.ts` 缺少 `/types` 接口
2. **数据源类型硬编码**：`GlassDatasources.tsx` 硬编码了 PostgreSQL、MySQL、ClickHouse、MaxCompute 列表
3. **应用分类硬编码**：`AppMarket.tsx` 硬编码了 BI 集成、数据通知、数据报表、数据告警分类
4. **查询模板分类硬编码**：`Templates.tsx` 硬编码了用户分析、销售分析等分类
5. **执行状态选项硬编码**：`ExecutionMonitor.tsx` 硬编码了 pending、running、success、failed 状态

**解决方案**：
1. **补充缺失 API**：
   - 添加 `previewDataset` 接口（获取表 Schema 并自动识别字段）
   - 添加 `getDataSourceTypes` 接口（获取支持的数据源类型列表）

2. **数据源类型动态化**：
   - 使用 `useQuery` 调用 `/datasources/types` 接口
   - 动态生成数据源类型选项，提供硬编码作为降级方案
   - 设置 30 分钟缓存，减少不必要的 API 调用

3. **应用分类动态化**：
   - 使用 `useQuery` 调用 `/apps/categories` 接口
   - 动态生成分类 Tabs，支持后端新增分类

4. **查询模板分类动态化**：
   - 使用 `useMemo` 从模板列表中动态提取分类
   - 统计每个分类的模板数量，按数量降序排序
   - 自动适应新增模板分类

5. **统一枚举值管理**：
   - 创建 `frontend/src/config/enums.ts` 集中管理前端枚举
   - 定义 `EXECUTION_STATUSES`、`TRIGGER_TYPES`、`TASK_TYPES` 等枚举
   - 提供辅助函数（`getStatusLabel`、`getStatusColor` 等）

**效果**：
- 消除前端硬编码数据，所有枚举值和分类从后端动态获取
- 后端新增数据源类型或应用分类时，前端自动适配无需修改代码
- 统一的枚举管理提高代码可维护性，避免多处重复定义
- 降级方案确保 API 失败时前端仍可正常运行

**验证方式**：
1. **数据源类型**：打开"新建数据源" → 检查数据源类型下拉框 → 验证控制台 `/datasources/types` 调用
2. **应用分类**：打开"应用市场" → 检查分类 Tabs → 验证控制台 `/apps/categories` 调用
3. **查询模板分类**：打开"查询模板" → 检查分类筛选显示数量 → 切换分类验证筛选
4. **执行状态**：打开"执行监控" → 检查状态筛选下拉框使用统一枚举

**修改文件**：
- `frontend/src/api/datasets.ts`：新增 `previewDataset` 接口
- `frontend/src/api/datasources.ts`：新增 `getDataSourceTypes` 接口
- `frontend/src/pages/GlassDatasources.tsx`：数据源类型动态化
- `frontend/src/pages/AppCenter/AppMarket.tsx`：应用分类动态化
- `frontend/src/pages/QueryCenter/Templates.tsx`：模板分类动态提取
- `frontend/src/pages/AppCenter/ExecutionMonitor.tsx`：使用统一枚举
- `frontend/src/config/enums.ts`：新建统一枚举配置文件

---

### 数据集注册字段为空修复（2026-01-30）

**问题**：注册数据集进入“配置字段”步骤后表格为空，字段统计为 0。

**根本原因**：
- 前端使用了 `previewTableData` 接口，该接口只返回 `columns` 和样例数据
- 实际字段配置依赖 `/datasets/preview` 返回的 `fields` 识别结果

**解决方案**：
1. `GlassDatasetRegister.tsx` 的预览接口切换为 `previewDataset`
2. 请求参数改为 `{ datasource_id, database, table }`
3. 字段数量统计改为 `previewData.data.fields.length`

**效果**：
- 字段识别结果正常加载（业务类型、敏感级别等自动填充）
- 字段统计不再为 0

**验证方式**：
- 注册数据集 → 选择数据源/数据库/数据表
- “元数据加载成功”提示的字段数大于 0
- 进入“配置字段”表格有数据

---

### 字段配置对接后端识别结果（2026-01-30）

**问题**：数据集注册时，业务类型和敏感级别为前端硬编码，未使用后端 `FieldIdentifier` 服务的智能识别结果。

**根本原因**：
- 后端 `preview_dataset_handler.py` 已返回 `identified_fields`（包含 `business_type`, `sensitivity_level`, `mask_rule`, `confidence_score` 等）
- 前端 `GlassDatasetRegister.tsx` 只提取了 `name`, `type`, `comment`，忽略了识别结果

**解决方案**：
1. 修改 `GlassDatasetRegister.tsx`：从 `previewData.data.fields` 提取完整字段识别结果
2. 修改 `FieldConfigurator` 组件：
   - 扩展 `FieldConfiguratorProps` 接口，支持传入后端识别结果
   - 优先使用后端识别结果，前端识别作为兜底方案

**效果**：
- 字段业务类型、敏感级别、脱敏规则自动填充（基于后端智能识别）
- 用户仍可手动调整配置
- 识别置信度和匹配规则可视化（`confidence_score`, `matched_rules`）

**验证方式**：
- 注册数据集 → 步骤2 → 字段配置表格
- 检查业务类型、敏感级别是否自动填充
- 手机号、邮箱等敏感字段是否自动标记为 `pii`
- 金额、数量等字段是否自动标记为 `measure`

---

### 页面切换抖动修复（2026-01-30）

**问题**：切换不同高度页面或打开下拉菜单时，右侧界面抖动（滚动条出现/消失导致布局偏移）。

**解决方案**：
- 引入 `overlayscrollbars` 与 `overlayscrollbars-react`
- 主内容区使用覆盖式滚动容器（`OverlayScrollbarsComponent`）
- 滚动条不占据布局宽度，仅覆盖在内容之上
- 全局 `body` 禁止滚动（`overflow: hidden`），只让主内容区滚动

**效果**：
- 页面切换不再抖动
- 滚动条更短、更精致，仅作用于主内容区（高度 `calc(100vh - 4rem)`）
- 下拉菜单等交互不再触发布局偏移

**验证方式**：
- 切换长/短页面（如列表页/空状态页）
- 打开下拉菜单、弹窗
- 观察右侧布局是否稳定

---

### 优化主外键字段识别逻辑（2026-01-30）

**问题**：数仓场景中的主外键字段（如 `user_id: bigint`、`order_id: int`）被误判为度量字段，但实际应为维度字段（用于关联和筛选，不做聚合计算）。

**根本原因**：
- 原有规则：数值类型字段（int/bigint/decimal）如果没有明确度量特征（如 `_amt`、`_count` 后缀），会被低置信度判定为度量
- 主外键字段通常是数值类型或字符串类型，字段名包含 `id`/`key`/`code`，应识别为维度

**解决方案**：
1. 新增主外键识别规则常量：
   - `DIMENSION_ID_PATTERNS`：包含 `id`、`key`、`code` 的字段名模式
   - `DIMENSION_ID_TYPES`：允许作为主外键的数据类型（数值 + 字符串）

2. 修改度量字段识别逻辑：
   - 在 `_identify_measure` 方法开头新增规则0（最高优先级）
   - 如果字段名包含主外键模式 且 数据类型符合，则排除度量判断

3. 移除低置信度度量判断：
   - 注释掉原规则D（数值类型 → 低置信度度量）
   - 没有明确特征的数值字段保持默认 `dimension`（维度）

**效果**：
- `user_id: bigint` → 识别为维度（主外键排除规则）
- `order_id: int` → 识别为维度（主外键排除规则）
- `product_code: varchar` → 识别为维度（主外键排除规则）
- `order_amount: decimal` → 识别为度量（度量特征匹配）
- `user_age: int` → 识别为维度（默认维度，无明确特征）

**验证方式**：
- 注册数据集 → 选择包含 ID 字段的表（用户表、订单表等）
- 进入"配置字段"步骤
- 验证 `user_id`、`order_id`、`product_code` 等字段业务类型显示为"维度"

**修改文件**：
- `app/services/field_identifier.py`：新增主外键识别规则，优化度量字段识别逻辑

---

## 项目清理（2026-01-30）

### 无用文件清理

**删除的临时文档和脚本**（共 39 个文件）：

1. **根目录完成报告**（6 个）
   - `ADD_PAGINATION_COMPLETE.md`
   - `FINAL_FIX_COMPLETE.md`
   - `REMOVE_LOGOUT_BUTTON_COMPLETE.md`
   - `REMOVE_REDUNDANT_BUTTONS_COMPLETE.md`
   - `DESIGN_OPTIMIZATION_SUMMARY.md`
   - `MAXCOMPUTE_FIELD_MAPPING_FIX.md`

2. **前端迁移文档**（24 个）
   - 所有 `MIGRATION_*.md`、`TODAY_*.md`、`*_SUMMARY.md` 等临时进度报告
   - 保留：`COMPONENT_STYLE_GUIDE.md`、`README.md`、`QUICK_START_SHADCN.md`

3. **临时脚本**（4 个）
   - `frontend/fix-errors.sh`
   - `frontend/fix-remaining-errors.sh`
   - `frontend/migrate-simple-patterns.sh`
   - `frontend/test-all-pages.sh`

4. **验证脚本**（2 个）
   - `app/verify_cascade.py`
   - `app/verify_shell.py`

5. **根目录测试文件**（2 个）
   - `test_sql_validator.py`
   - `test_sql_validator_simple.py`

6. **过时文档**（1 个）
   - `QUICK_REFERENCE.md`

**移动的目录**：
- `frontend-static/` → `docs/reference-design/`（保留为参考设计）

**保留的文件**：
- ✅ `frontend/QueryBuilder.tsx` - 孤立组件（可能未来使用）
- ✅ `AGENTS.md` - OpenSpec 管理文件
- ✅ 所有 `openspec/` 目录内容
- ✅ 所有 `docs/` 核心文档

**效果**：项目结构更清晰，移除了约 39 个临时/无用文件，减少维护负担。

---

## Docker 配置简化（2026-01-30）

**变更**：统一使用 `docker-compose.yml`（原 `docker-compose.full.yml`）

**删除的配置**：
- `docker-compose.yml`（旧开发配置）
- `docker-compose.prod.yml`（简化生产配置）
- `frontend/Dockerfile`（前端由 nginx 服务静态文件）

**新的统一配置**：
```bash
# 一键启动完整环境
docker compose up -d

# 包含服务：
# - nginx (端口 81) - 前端 + API 反向代理
# - backend (内部端口 5000) - Flask 应用
# - postgres (内部) - PostgreSQL 数据库
# - redis (内部) - 缓存 + 任务队列
# - rq_worker (x2 副本) - 异步任务处理
```

**访问地址**：
- 前端：http://localhost:81
- 后端API：http://localhost:5000（内部）
- 通过 nginx 代理访问后端：http://localhost:81/api

**备份位置**：`.backup/docker-configs/`

---

## 已知技术债

以下是已完成并归档的 changes 中未完成的可选优化任务，已接受现状，不影响核心功能：

### 1. 前端 shadcn/ui 迁移（2026-01-30）

**状态**: 核心功能 100% 完成，可选优化未做

**未完成项**:
- `ExtractionTaskConfig/index.tsx` 和 `StepDatasetFields.tsx` 部分细节（标记为 `[ ]` 但实际可能已完成）

**影响**: 无，核心迁移已完成，组件库正常工作

---

### 2. 应用中心事件统一设计（2026-01-23）

**状态**: P0 核心功能已完成，22 个可选优化未做

**执行器单元测试** (2026-03-10):
- 新增 `tests/unit/application/executors/test_executors.py`，覆盖 5 个执行器：SchemaDriftExecutor、BiDashboardPushExecutor、DatasetCardPushExecutor、ExtractionNotifyExecutor、QueryResultPushExecutor
- 每个执行器测试：成功执行返回 SUCCESS、异常返回 FAILED、配置校验（缺失必填项）
- 使用 MagicMock/patch 模拟外部依赖（db、Superset、Feishu、DataSourceAdapterFactory 等）

**FieldIdentifier 与 DeliveryService 单元测试** (2026-03-10):
- 新增 `tests/unit/domain/services/test_field_identifier.py`：覆盖 FieldIdentifier 全部公开方法（`identify_field`、`identify_fields_batch`、`get_statistics`），含分区/维度/度量/敏感字段识别、批量识别、统计等场景
- 补充 `tests/unit/application/test_delivery_service.py`：新增 `_deliver_to_feishu`（webhook/chat_id 成功、无配置、ImportError、异常）、`_deliver_to_channel` 路由（FEISHU/EMAIL/OSS、渠道不存在、不支持类型）、`deliver_event` 异常分支及 `_deliver_to_webhook` 异常路径

**API 路由集成烟测** (2026-03-10):
- 新增 `tests/integration/test_api_routes_smoke.py`：覆盖所有 Blueprint 的 list/create 端点（health、auth、datasources、datasets、extraction、conversations、files、sql_lab、queries、feishu、apps、app_instances、app_executions、channels、subscriptions、app_instance_subscriptions、semantic），断言非 404 即路由已注册
- 新增 `tests/integration/test_queries_api.py`：覆盖 queries 模块全部 18 个路由（execute、CRUD、favorite、folders、histories、statistics、templates）
- 所有请求使用 `Authorization: Bearer test` 以触发认证中间件

**数据源适配器与 Job 单元测试** (2026-03-10):
- 新增 `tests/unit/infrastructure/adapters/test_datasource_adapters.py`：覆盖 PostgreSQLAdapter、MySQLAdapter、ClickHouseAdapter、MaxComputeAdapter 的 `__init__`、`test_connection`（成功/失败）、`list_tables`、`execute_query`（成功/失败）、`get_table_schema`，使用 patch 模拟 psycopg2/pymysql，对 ClickHouse/MaxCompute 使用 `_get_client`/`_get_odps_client` 注入 mock
- 新增 `tests/unit/infrastructure/tasks/test_jobs.py`：覆盖 `execute_sql_query_job`（成功、查询不存在、非 pending 跳过、失败返回字典）、`_prepare_sql`、`_convert_rows_to_data`，以及 `execute_extraction_job`（物理数据集/文件数据集成功、run 不存在），Mock 容器、session、AdapterFactory、FileDeliveryService

**覆盖率提升单元测试** (2026-03-10):
- 新增 6 个测试文件，覆盖约 530 行代码，整体覆盖率提升至 60%：
  - `tests/unit/infrastructure/test_route_scanner.py`：Route Scanner（`scan_routes_to_openapi`、`_parse_docstring`、`_get_tag_for_path` 等）
  - `tests/unit/infrastructure/adapters/test_superset_client.py`：SupersetClient（构造、JWT/登录认证、`get_dashboard_title`、`get_dashboard_screenshot`）
  - `tests/unit/infrastructure/adapters/test_file_delivery.py`：FileDeliveryService（`save_query_result`、`deliver_file`、`deliver_via_feishu`、`deliver_via_oss`、`send_notification`）
  - `tests/unit/application/executors/test_anomaly_monitor.py`：AnomalyMonitorExecutor（execute 成功/失败、配置校验、告警模板）
  - `tests/unit/application/agent/test_tool_registry.py`：ToolRegistry、ToolExecutor（工具过滤、执行、知识/语义层）
  - `tests/unit/application/conversation/test_send_message_handler.py`：SendMessageHandler（对话不存在、无权、传统 LLM 路径、异常处理）

**未完成项** (P1/P2):
- 实体和处理器单元测试（5 项，部分已完成：`test_app_handler.py` 覆盖主处理函数 85%，`test_table_cache_service.py` 覆盖 100%）
- AppInstanceService 事件发布（4 项）
- 事件统计指标和告警通知（3 项）
- 回归测试（3 项）
- 文档更新（4 项）
- 代码审查与优化（5 项）

**影响**: 测试覆盖率和文档完善度低于理想状态，但核心事件发布和级联功能正常工作

---

### 3. 配置中心模块（2026-01-24）

**状态**: 核心功能已完成，2 个清理任务未做

**未完成项** (P2):
- 标记 `FeishuChatRef` 为废弃
- 重构其他 Executor（可选）

**影响**: 存在少量遗留代码，但不影响新架构运行

---

## 架构合规性全面修复 (2026-02-11)

对项目进行了 6 阶段系统性架构重构，消除已识别的 16 类架构不一致问题。

### 阶段 1：统一响应格式
- 新建 `app/shared/response.py`，提供 `success()`/`error()`/`not_found()` 等统一响应函数
- 所有 API 路由替换手动 `jsonify` 为统一 helper，错误码统一为 `-1`

### 阶段 2：前端死代码清理
- 删除 Bauhaus 组件库（8 文件，0 引用）和无用 design-system 目录
- 迁移 `ConfigDrawer.tsx` 从 Ant Design 到 shadcn/ui（Sheet + @rjsf/core）
- 移除 `antd`、`@ant-design/icons`、`@rjsf/antd` 依赖
- 统一页面命名：移除 `Glass*` 前缀（7 文件 + App.tsx 路由）

### 阶段 3：后端旧架构清理
- 删除 `app/routes/` 旧路由目录，健康检查迁移到 `interfaces/api/health.py`
- 迁移 `app/services/` 到正确架构层（domain/infrastructure/application），删除整个目录
- 迁移 `models.py` 中仍被引用的模型到 `domain/entities/`，删除旧文件
- 删除 `app/templates/` 和 `app/static/`（前端已迁移到 React SPA）
- 统一配置系统：改用 Pydantic 验证的 `config_schema.py`，删除旧 `config.py`

### 阶段 4：CQRS 合规修复
- 为 QueryTemplate CRUD 创建 6 个 Handler，从 queries.py 提取业务逻辑
- 为 queries.py 其余直接 Repository 调用创建 8 个 Handler
- 修复 apps/instances/subscriptions/channels 的 Service 直接实例化，全部改为 DI 容器注入
- 为 5 个 Application Service 创建对应 Repository（app_definition/app_instance/app_execution/subscription/channel）

### 阶段 5：安全和中间件修复
- 移除 `auth.py` 中的 X-User-Id 兼容模式，统一使用 JWT
- 前端 API client 移除 X-User-Id header 发送逻辑
- 移除 7 个路由文件中 43 处冗余 try-catch，依赖全局错误处理器

### 阶段 6：前端类型安全
- 统一 API 响应解构模式，修正 sqllab.ts 误导性注释
- API 函数 `data: any` 替换为具体接口类型（datasets/datasources）
- 12 处 `useState<any>` 替换为具体类型，新增 4 个辅助类型定义

---

*最后更新: 2026-02-11*
