# 公共数据服务平台 - 技术文档

## 📋 项目概述

本项目是一个**自助数据导出平台**，旨在让业务用户通过 GUI 自助导出 MaxCompute 明细数据，替代原有的 Superset 导出流程和人工 SQL 工单。

### 核心特性

✅ **元数据驱动** - 基于数据库的元数据管理，支持逻辑与物理字段映射  
✅ **智能脱敏** - 敏感字段自动脱敏（手机号、身份证、姓名等）  
✅ **权限控制** - 行列级权限控制，支持细粒度授权  
✅ **SQL 防注入** - 完善的安全过滤机制，防止 SQL 注入攻击  
✅ **异步执行** - 任务异步执行，支持大数据量导出  
✅ **智能交付** - 根据文件大小自动选择飞书/OSS交付方式  
✅ **审计合规** - 完整的操作审计日志，满足合规要求

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                         前端层                                │
│  React + TypeScript + Tailwind CSS + Lucide Icons           │
│  - 字段选择器  - 筛选器面板  - DSL 预览  - 任务监控          │
└─────────────────────────────────────────────────────────────┘
                              ↓ RESTful API
┌─────────────────────────────────────────────────────────────┐
│                         应用层                                │
│  Flask Blueprint API                                         │
│  - 数据集管理  - 权限验证  - 任务提交  - 状态查询            │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                         业务逻辑层                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ SQL 生成器   │  │ 任务执行器   │  │ 权限管理器   │       │
│  │              │  │              │  │              │       │
│  │ - 字段映射   │  │ - MC 查询    │  │ - 行列级权限 │       │
│  │ - 自动脱敏   │  │ - 结果下载   │  │ - 白名单控制 │       │
│  │ - 分区注入   │  │ - 文件交付   │  │ - 过期管理   │       │
│  │ - SQL 防注入 │  │ - 状态监控   │  │              │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                         数据层                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ PostgreSQL   │  │ MaxCompute   │  │ OSS          │       │
│  │ 元数据管理   │  │ 大数据计算   │  │ 文件存储     │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                               │
│  ┌──────────────┐                                            │
│  │ 飞书开放平台 │                                            │
│  │ 消息推送     │                                            │
│  └──────────────┘                                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 📂 项目结构

```
dw_bi_webhook_gateway/
│
├── schema/
│   └── data_service_metadata.sql          # 数据库 DDL（元数据表结构）
│
├── app/
│   ├── services/
│   │   ├── sql_generator.py               # SQL 转换引擎
│   │   └── export_executor.py             # 异步任务执行器
│   │
│   └── routes/
│       └── data_export.py                 # RESTful API 路由
│
├── frontend/
│   └── QueryBuilder.tsx                   # React 查询构造器组件
│
└── docs/
    └── DATA_SERVICE_PLATFORM.md           # 本文档
```

---

## 🗄️ 模块 1: 元数据层设计

### 数据库表结构

#### 1.1 数据集注册表 (dataset_registry)
存储逻辑数据集与物理 MaxCompute 表的映射关系。

**核心字段：**
- `dataset_code`: 数据集唯一标识
- `physical_project`: MaxCompute 项目名
- `physical_table`: MaxCompute 物理表名
- `partition_keys`: 分区键配置（JSON）
- `sensitivity_level`: 敏感级别（PUBLIC/INTERNAL/CONFIDENTIAL/SECRET）

#### 1.2 字段元数据表 (field_metadata)
记录每个字段的物理名、业务名、类型、脱敏规则。

**核心字段：**
- `physical_name`: 物理字段名（如 `user_mobile`）
- `business_name`: 业务字段名（如 `用户手机号`）
- `is_sensitive`: 是否敏感字段
- `masking_rule`: 脱敏规则（MOBILE/EMAIL/ID_CARD/NAME 等）
- `masking_function`: 自定义脱敏函数

#### 1.3 用户权限表 (user_permission)
管理用户对数据集的行列级访问权限。

**核心字段：**
- `allowed_columns`: 允许访问的字段列表（NULL 表示全部）
- `row_filter_rules`: 行级过滤规则（JSON）
- `max_row_limit`: 最大导出行数
- `expired_at`: 权限过期时间

#### 1.4 导出任务表 (export_task)
记录用户提交的导出任务及执行状态。

**核心字段：**
- `task_id`: 任务唯一标识（UUID）
- `status`: 任务状态（PENDING/RUNNING/SUCCESS/FAILED）
- `mc_instance_id`: MaxCompute Instance ID
- `delivery_method`: 交付方式（FEISHU/OSS）
- `delivery_url`: 交付链接

### 部署 DDL

```bash
psql -h <host> -U <user> -d <database> -f schema/data_service_metadata.sql
```

---

## ⚙️ 模块 2: SQL 转换引擎

### 核心类：SqlGenerator

**功能：** 将前端 Query DSL 转换为安全的、带脱敏和权限控制的 MaxCompute SQL。

### Query DSL 示例

```json
{
  "dataset_id": 101,
  "selected_columns": ["用户姓名", "手机号", "订单金额"],
  "filters": [
    {"field": "ds", "op": "BETWEEN", "value": ["20231201", "20231207"]},
    {"field": "city", "op": "IN", "value": ["Beijing", "Shanghai"]}
  ],
  "order_by": [
    {"field": "订单金额", "direction": "DESC"}
  ],
  "limit": 1000
}
```

### 生成的 SQL 示例

```sql
-- Generated SQL for trace_id: trace-12345-abcde
-- User: user_001
-- Generated at: 2023-12-19T10:30:00

SELECT
  CONCAT(SUBSTR(user_name, 1, 1), '**') AS user_name,
  REGEXP_REPLACE(mobile, '(\d{3})\d{4}(\d{4})', '$1****$2') AS mobile,
  order_amount
FROM prod_dw.dwd_trade_order_detail
WHERE ds BETWEEN '20231201' AND '20231207' 
  AND city IN ('Beijing', 'Shanghai')
  AND (city IN ('Beijing', 'Shanghai'))  -- Row-level permission
ORDER BY order_amount DESC
LIMIT 1000;
```

### 安全机制

1. **字段白名单验证** - 所有字段必须在元数据中存在
2. **操作符白名单** - 仅支持预定义的安全操作符
3. **值转义** - 自动转义单引号，拒绝危险关键字
4. **强制分区注入** - 缺少分区过滤时自动注入默认值
5. **自动限制行数** - 强制添加 LIMIT，防止全表扫描

### 使用示例

```python
from app.services.sql_generator import SqlGenerator, load_metadata_from_db

# 加载元数据
dataset_meta, field_metas, user_permission = load_metadata_from_db(
    dataset_id=101,
    user_id='user_001'
)

# 创建 SQL 生成器
sql_gen = SqlGenerator(dataset_meta, field_metas, user_permission)

# 生成 SQL
sql = sql_gen.generate_sql(query_dsl, user_context)
print(sql)
```

---

## 🚀 模块 3: 前端查询构造器

### 技术栈
- **React 18** + TypeScript
- **Tailwind CSS** - 样式框架
- **Lucide Icons** - 图标库

### 主要组件

#### QueryBuilder
主组件，包含三列布局：

1. **左侧：字段选择器**
   - 按类别分组（分区键/维度/度量）
   - 支持搜索过滤
   - 复选框多选

2. **中间：筛选器面板**
   - 动态添加/删除筛选条件
   - 支持多种操作符（等于/包含/区间等）
   - 最大行数限制

3. **右侧：DSL 预览 & 任务状态**
   - 实时展示生成的 Query DSL
   - 任务执行状态监控
   - 下载链接展示

### 使用方式

```tsx
import QueryBuilder from './frontend/QueryBuilder';

function App() {
  return <QueryBuilder />;
}
```

### 样式效果

- 🌙 暗色主题（Slate 色系）
- ✨ 现代渐变背景
- 🎨 Teal/Cyan 主色调
- 📱 响应式布局
- 🔄 流畅的动画过渡

---

## ⏱️ 模块 4: 异步任务执行

### 核心类：ExportTaskExecutor

**职责：**
1. 提交 MaxCompute SQL 查询
2. 监控任务执行状态
3. 下载结果文件
4. 根据文件大小选择交付方式
5. 更新任务状态到数据库

### 执行流程

```
1. 提交 SQL 到 MaxCompute
   ↓
2. 轮询等待任务完成（最多 10 分钟）
   ↓
3. 下载结果到本地临时文件（CSV/Excel）
   ↓
4. 判断文件大小：
   - < 20MB  → 上传到飞书群聊
   - >= 20MB → 上传到 OSS，生成 24h 预签名链接
   ↓
5. 发送交付通知
   ↓
6. 清理临时文件
```

### 交付策略

#### 小文件（< 20MB）- 飞书直传
```python
# 上传文件到飞书
file_key = feishu_client.upload_file(file_path)

# 发送文件消息到群聊
feishu_client.send_file_message(
    chat_id='oc_xxx',
    file_key=file_key,
    file_name='订单明细_20231219.csv'
)
```

#### 大文件（>= 20MB）- OSS 链接
```python
# 上传到 OSS
oss_client.put_object(oss_key, file_content)

# 生成 24 小时预签名 URL
presigned_url = oss_client.sign_url('GET', oss_key, 86400)

# 发送卡片消息（包含下载按钮）
feishu_client.send_card_message(
    chat_id='oc_xxx',
    title='数据导出完成',
    download_url=presigned_url,
    expired_at='2023-12-20 10:30:00'
)
```

### 使用示例

```python
from app.services.export_executor import ExportTaskExecutor

# 初始化执行器
executor = ExportTaskExecutor(config={
    'mc_access_id': 'xxx',
    'mc_secret_key': 'xxx',
    'oss_bucket_name': 'data-exports',
    # ...
})

# 执行任务
result = executor.execute_task(
    task_id='uuid',
    query_dsl=query_dsl,
    generated_sql=sql,
    user_context={'user_id': 'user_001'}
)

print(result['status'])  # SUCCESS / FAILED
print(result['delivery_url'])  # 下载链接
```

---

## 🌐 模块 5: RESTful API

### 接口列表

#### 数据集管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/datasets` | 获取用户可访问的数据集列表 |
| GET | `/api/v1/datasets/{id}` | 获取数据集详情（含字段元数据） |

#### 查询模板

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/templates` | 获取查询模板列表 |
| GET | `/api/v1/templates/{id}` | 获取模板详情（含 DSL） |

#### 数据导出

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/export/submit` | 提交导出任务 |
| GET | `/api/v1/export/status/{task_id}` | 查询任务状态 |
| GET | `/api/v1/export/history` | 获取导出历史 |

#### 权限管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/permissions/user/{user_id}` | 获取用户权限列表 |
| POST | `/api/v1/permissions/grant` | 授予权限（管理员） |

### 认证机制

使用 Header 传递用户信息：

```http
GET /api/v1/datasets
X-User-ID: user_001
X-User-Name: 张三
X-Trace-ID: trace-12345-abcde
```

### API 调用示例

#### 提交导出任务

```bash
curl -X POST http://localhost:5000/api/v1/export/submit \
  -H "Content-Type: application/json" \
  -H "X-User-ID: user_001" \
  -d '{
    "dataset_id": 101,
    "selected_columns": ["订单ID", "订单金额"],
    "filters": [
      {"field": "ds", "op": "EQ", "value": "20231219"}
    ],
    "limit": 1000
  }'
```

**响应：**
```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "PENDING",
  "message": "任务已提交，正在执行中"
}
```

#### 查询任务状态

```bash
curl http://localhost:5000/api/v1/export/status/550e8400-e29b-41d4-a716-446655440000 \
  -H "X-User-ID: user_001"
```

**响应：**
```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "SUCCESS",
  "output_row_count": 12345,
  "delivery_method": "OSS",
  "delivery_url": "https://xxx.oss.com/download",
  "delivery_expired_at": "2023-12-20T10:30:00"
}
```

---

## 🔐 安全设计

### 1. SQL 注入防护

- ✅ 字段名白名单验证
- ✅ 操作符白名单
- ✅ 值自动转义（单引号替换为双单引号）
- ✅ 拒绝危险关键字（DROP/DELETE/UPDATE 等）

### 2. 权限控制

- ✅ 列级权限：`allowed_columns` 字段白名单
- ✅ 行级权限：自动注入 `row_filter_rules`
- ✅ 行数限制：`max_row_limit` 强制上限

### 3. 敏感字段脱敏

| 脱敏规则 | 示例输入 | 示例输出 |
|----------|----------|----------|
| MOBILE | 13812345678 | 138****5678 |
| EMAIL | john.doe@example.com | joh***@example.com |
| ID_CARD | 110101199001011234 | 110101********1234 |
| NAME | 张三 | 张** |

### 4. 审计日志

所有敏感操作（查询、导出、授权）均记录审计日志：

```sql
INSERT INTO audit_log (user_id, action, resource_type, resource_id, details)
VALUES ('user_001', 'EXPORT', 'DATASET', '101', '{"columns": [...]}');
```

---

## 📦 部署指南

### 1. 环境准备

```bash
# Python 依赖
pip install flask psycopg2-binary pyodps oss2

# PostgreSQL 数据库
psql -f schema/data_service_metadata.sql

# 前端依赖（如需部署前端）
npm install react react-dom lucide-react
```

### 2. 配置文件

创建 `config.py`：

```python
# MaxCompute 配置
MC_ACCESS_ID = 'your_access_id'
MC_SECRET_KEY = 'your_secret_key'
MC_DEFAULT_PROJECT = 'prod_dw'
MC_ENDPOINT = 'http://service.odps.aliyun.com/api'

# OSS 配置
OSS_ACCESS_ID = 'your_oss_access_id'
OSS_SECRET_KEY = 'your_oss_secret_key'
OSS_ENDPOINT = 'oss-cn-hangzhou.aliyuncs.com'
OSS_BUCKET_NAME = 'data-exports'

# 飞书配置（复用现有配置）
FEISHU_APP_ID = 'cli_xxx'
FEISHU_APP_SECRET = 'xxx'
```

### 3. 启动服务

```bash
# 开发环境
flask run --host=0.0.0.0 --port=5000

# 生产环境（使用 gunicorn）
gunicorn -w 4 -b 0.0.0.0:5000 wsgi:app
```

---

## 🧪 测试

### 单元测试

```bash
# 测试 SQL 生成器
python -m pytest tests/test_sql_generator.py

# 测试任务执行器
python -m pytest tests/test_export_executor.py
```

### 集成测试

```bash
# 端到端测试
python -m pytest tests/test_api_integration.py
```

---

## 📈 监控与运维

### 关键指标

1. **任务成功率** - `SUCCESS / TOTAL`
2. **平均执行时长** - `AVG(duration_ms)`
3. **失败原因分布** - `GROUP BY error_message`
4. **用户活跃度** - `COUNT(DISTINCT user_id)`

### 日志查询

```sql
-- 查询失败任务
SELECT task_id, user_id, error_message, submitted_at
FROM export_task
WHERE status = 'FAILED'
  AND submitted_at >= CURRENT_DATE
ORDER BY submitted_at DESC;

-- 查询慢查询（超过 5 分钟）
SELECT task_id, duration_ms, output_row_count
FROM export_task
WHERE duration_ms > 300000
ORDER BY duration_ms DESC;
```

---

## 🚧 未来优化方向

1. **任务队列** - 使用 Celery/RQ 替代线程池
2. **结果缓存** - 相同查询缓存结果，加速响应
3. **增量导出** - 支持基于时间戳的增量导出
4. **数据血缘** - 记录数据访问链路，构建血缘图
5. **智能推荐** - 基于历史查询推荐常用字段组合
6. **多租户隔离** - 支持多组织/部门隔离

---

## 📞 联系方式

- **技术负责人**: Senior Data Architect
- **项目仓库**: [GitHub/GitLab 链接]
- **问题反馈**: [Issue Tracker]

---

## 📄 许可证

本项目采用 MIT 许可证。

---

**祝您使用愉快！🎉**

