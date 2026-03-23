# 快速开始指南

## 🚀 5 分钟快速部署

本指南将帮助您快速部署和运行 `CUBIC3`（仓库名：`cubic3-data-platform`）。

---

## 步骤 1: 环境准备

### 1.1 安装依赖

```bash
cd /path/to/cubic3-data-platform

# 安装 Python 依赖
pip install -r requirements.txt

# 额外安装大数据相关 SDK
pip install pyodps oss2 openpyxl
```

### 1.2 数据库初始化

```bash
# 连接到 PostgreSQL
psql -h localhost -U postgres -d your_database

# 执行 DDL
\i schema/data_service_metadata.sql

# 验证表是否创建成功
\dt
```

---

## 步骤 2: 配置文件

### 2.1 创建配置文件

编辑 `app/config.py`，添加以下配置：

```python
# 数据库配置
SQLALCHEMY_DATABASE_URI = 'postgresql://user:password@localhost:5432/dbname'

# MaxCompute 配置
MAXCOMPUTE_CONFIG = {
    'mc_access_id': 'your_access_id',
    'mc_secret_key': 'your_secret_key',
    'mc_default_project': 'prod_dw',
    'mc_endpoint': 'http://service.odps.aliyun.com/api',
}

# OSS 配置
OSS_CONFIG = {
    'oss_access_id': 'your_oss_access_id',
    'oss_secret_key': 'your_oss_secret_key',
    'oss_endpoint': 'oss-cn-hangzhou.aliyuncs.com',
    'oss_bucket_name': 'data-exports',
}

# 临时文件目录
TEMP_DIR = '/tmp/data_exports'
```

### 2.2 注册 Blueprint

编辑 `app/__init__.py`，注册新的 API 路由：

```python
from flask import Flask
from app.routes import data_export

def create_app():
    app = Flask(__name__)
    
    # 注册数据导出 API
    data_export.init_app(app)
    
    return app
```

---

## 步骤 3: 初始化元数据

### 3.1 创建示例数据集

```sql
-- 注册数据集
INSERT INTO dataset_registry (
    dataset_code, dataset_name, physical_project, physical_table,
    table_type, partition_keys, description, data_domain, sensitivity_level
) VALUES (
    'user_order_fact',
    '用户订单明细表',
    'prod_dw',
    'dwd_trade_order_detail',
    'PARTITIONED',
    '["ds"]'::jsonb,
    '记录用户在平台的所有订单明细',
    'trade',
    'INTERNAL'
);

-- 添加字段元数据
INSERT INTO field_metadata (dataset_id, physical_name, business_name, field_type, field_category, is_sensitive, masking_rule, display_order)
SELECT 
    (SELECT id FROM dataset_registry WHERE dataset_code = 'user_order_fact'),
    physical_name,
    business_name,
    field_type,
    field_category,
    is_sensitive,
    masking_rule,
    display_order
FROM (VALUES
    ('ds', '数据日期', 'STRING', 'PARTITION_KEY', FALSE, NULL, 1),
    ('order_id', '订单ID', 'STRING', 'DIMENSION', FALSE, NULL, 2),
    ('user_name', '用户姓名', 'STRING', 'DIMENSION', TRUE, 'NAME', 3),
    ('mobile', '手机号', 'STRING', 'DIMENSION', TRUE, 'MOBILE', 4),
    ('order_amount', '订单金额', 'DECIMAL', 'MEASURE', FALSE, NULL, 5)
) AS t(physical_name, business_name, field_type, field_category, is_sensitive, masking_rule, display_order);
```

### 3.2 授予用户权限

```sql
-- 授予测试用户权限
INSERT INTO user_permission (
    user_id, user_name, dataset_id, permission_type, max_row_limit, status
)
SELECT
    'test_user_001',
    '测试用户',
    (SELECT id FROM dataset_registry WHERE dataset_code = 'user_order_fact'),
    'EXPORT',
    100000,
    'ACTIVE';
```

---

## 步骤 4: 启动服务

### 4.1 开发环境

```bash
# 方式 1: 使用 Flask 内置服务器
export FLASK_APP=wsgi.py
export FLASK_ENV=development
flask run --host=0.0.0.0 --port=5000

# 方式 2: 直接运行
python wsgi.py
```

### 4.2 生产环境

```bash
# 使用 Gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 --timeout 300 wsgi:app

# 或使用 Docker
docker-compose up -d
```

---

## 步骤 5: 测试 API

### 5.1 健康检查

```bash
curl http://localhost:5000/api/v1/health
```

**预期响应：**
```json
{
  "status": "healthy",
  "timestamp": "2023-12-19T10:30:00",
  "services": {
    "database": "ok",
    "maxcompute": "ok",
    "oss": "ok"
  }
}
```

### 5.2 获取数据集列表

```bash
curl http://localhost:5000/api/v1/datasets \
  -H "X-User-ID: test_user_001"
```

**预期响应：**
```json
{
  "datasets": [
    {
      "dataset_id": 1,
      "dataset_code": "user_order_fact",
      "dataset_name": "用户订单明细表",
      "permission_type": "EXPORT"
    }
  ]
}
```

### 5.3 提交导出任务

```bash
curl -X POST http://localhost:5000/api/v1/export/submit \
  -H "Content-Type: application/json" \
  -H "X-User-ID: test_user_001" \
  -d '{
    "dataset_id": 1,
    "selected_columns": ["订单ID", "订单金额"],
    "filters": [
      {"field": "ds", "op": "EQ", "value": "20231219"}
    ],
    "limit": 1000
  }'
```

**预期响应：**
```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "PENDING",
  "message": "任务已提交，正在执行中"
}
```

### 5.4 查询任务状态

```bash
curl http://localhost:5000/api/v1/export/status/550e8400-e29b-41d4-a716-446655440000 \
  -H "X-User-ID: test_user_001"
```

---

## 步骤 6: 前端部署（可选）

### 6.1 创建 React 应用

```bash
# 创建新的 React 项目
npx create-react-app data-export-frontend --template typescript

cd data-export-frontend

# 安装依赖
npm install lucide-react
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### 6.2 配置 Tailwind CSS

编辑 `tailwind.config.js`：

```javascript
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

### 6.3 复制查询构造器组件

```bash
# 复制组件文件
cp ../frontend/QueryBuilder.tsx src/components/

# 在 App.tsx 中使用
# import QueryBuilder from './components/QueryBuilder';
```

### 6.4 启动前端

```bash
npm start
```

访问 http://localhost:3000

---

## 🎯 验证清单

完成以上步骤后，请验证以下功能：

- [ ] 数据库表创建成功
- [ ] API 健康检查正常
- [ ] 可以获取数据集列表
- [ ] 可以提交导出任务
- [ ] 可以查询任务状态
- [ ] 前端界面可以正常访问（如已部署）

---

## 🐛 常见问题

### Q1: 数据库连接失败

**错误信息：**
```
psycopg2.OperationalError: could not connect to server
```

**解决方案：**
1. 检查 PostgreSQL 是否已启动
2. 确认数据库配置正确（主机、端口、用户名、密码）
3. 检查防火墙设置

### Q2: MaxCompute SDK 导入失败

**错误信息：**
```
ModuleNotFoundError: No module named 'odps'
```

**解决方案：**
```bash
pip install pyodps
```

### Q3: 任务一直处于 PENDING 状态

**可能原因：**
- MaxCompute 配置错误
- 任务队列未启动
- 网络连接问题

**解决方案：**
1. 检查 MaxCompute 配置
2. 查看应用日志：`tail -f logs/app.log`
3. 手动测试 MaxCompute 连接

### Q4: 文件交付失败

**可能原因：**
- OSS 配置错误
- 飞书 Token 过期
- 文件大小超限

**解决方案：**
1. 检查 OSS/飞书配置
2. 验证文件权限
3. 查看详细错误日志

---

## 📚 下一步

- 📖 阅读 [完整技术文档](DATA_SERVICE_PLATFORM.md)
- 🔐 配置[生产环境安全策略](SECURITY.md)
- 📊 设置[监控告警](MONITORING.md)
- 🧪 运行[自动化测试](TESTING.md)

---

## 💬 获取帮助

遇到问题？

1. 查看 [FAQ 文档](FAQ.md)
2. 搜索 [Issue Tracker](https://github.com/xxx/issues)
3. 联系技术支持团队

---

**祝您使用愉快！🎉**
