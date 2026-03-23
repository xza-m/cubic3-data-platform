# 元数据同步与数据集注册完整指南

## 📋 概述

本文档详细说明如何使用元数据同步功能，实现从 MaxCompute 自动采集表结构并智能识别字段属性。

---

## 🏗️ 架构设计

### 核心流程

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ 发现    │ -> │ 采集    │ -> │ 识别    │ -> │ 存储    │
│ Discover│    │ Collect │    │ Identify│    │ Store   │
└─────────┘    └─────────┘    └─────────┘    └─────────┘
     ↓              ↓              ↓              ↓
  输入表名      PyODPS获取     智能识别      写入数据库
                Schema         字段属性
```

---

## 🗄️ 数据库架构

### 已创建的表

| 表名 | 说明 | 文件 |
|------|------|------|
| `metadata_sync_config` | 同步任务配置 | metadata_sync_extension.sql |
| `metadata_sync_log` | 同步执行记录 | metadata_sync_extension.sql |
| `field_identification_rules` | 字段识别规则 | metadata_sync_extension.sql |
| `dataset_approval` | 数据集审批流程 | metadata_sync_extension.sql |

### 扩展的字段

**dataset_registry 表**:
- `sync_status`: 同步状态
- `last_sync_at`: 最后同步时间
- `auto_discovered`: 是否自动发现

**field_metadata 表**:
- `auto_identified`: 是否自动识别
- `confidence_score`: 识别置信度
- `identification_rules`: 命中的规则

---

## 🧠 智能识别算法

### 1. 分区字段识别 (100% 准确)

**方法**: 直接从 MaxCompute API 获取

```python
# PyODPS 代码示例
table_obj = odps.get_table('your_table')
partitions = table_obj.table_schema.partitions
# partitions 中的字段即为分区字段
```

**结果**:
- `field_category` = `PARTITION_KEY`
- `confidence_score` = `1.0`

### 2. 敏感字段识别

**策略 A**: 名称正则匹配

```
模式: mobile|phone|tel -> 识别为手机号
模式: id_card|id_no -> 识别为身份证
模式: email|mail_addr -> 识别为邮箱
...
```

**策略 B**: 注释关键词匹配

```
关键词: "手机号" -> MOBILE
关键词: "身份证" -> ID_CARD
关键词: "邮箱" -> EMAIL
...
```

**置信度计算**:
- 仅名称匹配: 0.8
- 仅注释匹配: 0.9
- 两者都匹配: 0.95

### 3. 度量字段识别

**规则 A**: 类型检查（必须是数值类型）
```
BIGINT, INT, DOUBLE, DECIMAL, FLOAT -> 可能是度量
STRING, DATETIME -> 不是度量
```

**规则 B**: 名称后缀匹配
```
_amt, _amount, _fee -> 金额类
_cnt, _count, _num -> 数量类
_rate, _ratio, _pct -> 比例类
```

**规则 C**: 注释关键词
```
"金额", "价格" -> 金额类
"数量", "次数" -> 数量类
"比例", "占比" -> 比例类
```

**置信度计算**:
- 仅数值类型: 0.5
- 类型 + 名称匹配: 0.8
- 类型 + 名称 + 注释: 0.9

---

## 🚀 使用指南

### 步骤 1: 部署数据库

```bash
# 执行 DDL
psql -h localhost -U postgres -d your_database \
  -f schema/metadata_sync_extension.sql
```

### 步骤 2: 配置 MaxCompute 连接

在 `app/config.py` 添加：

```python
MC_ACCESS_ID = os.environ.get('MC_ACCESS_ID')
MC_SECRET_KEY = os.environ.get('MC_SECRET_KEY')
MC_ENDPOINT = 'http://service.odps.aliyun.com/api'
```

### 步骤 3: 注册 API 路由

在 `app/__init__.py` 添加：

```python
from .routes import metadata_sync

def create_app():
    app = Flask(__name__)
    # ... 其他配置 ...
    
    # 注册元数据同步 API
    metadata_sync.init_app(app)
    
    return app
```

### 步骤 4: 触发同步

#### 方法 A: API 调用

```bash
curl -X POST http://localhost:5000/api/v1/metadata/sync/trigger \
  -H "Content-Type: application/json" \
  -H "X-User-ID: admin" \
  -d '{
    "project": "prod_dw",
    "table": "dwd_trade_order_detail"
  }'
```

**响应示例**:
```json
{
  "batch_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "SUCCESS",
  "dataset_id": 101,
  "statistics": {
    "total_fields": 25,
    "partition_fields": 1,
    "measure_fields": 8,
    "sensitive_fields": 3
  },
  "message": "Successfully synced 25 fields",
  "duration_ms": 5234
}
```

#### 方法 B: Python 代码调用

```python
from app.services.metadata_sync import (
    MaxComputeMetadataCollector,
    FieldIdentificationEngine,
    MetadataSyncService
)

# 初始化
collector = MaxComputeMetadataCollector(
    access_id='your_ak',
    secret_key='your_sk',
    endpoint='http://service.odps.aliyun.com/api'
)

identifier = FieldIdentificationEngine()

sync_service = MetadataSyncService(
    collector=collector,
    identifier=identifier
)

# 执行同步
result = sync_service.sync_table(
    project='prod_dw',
    table='dwd_trade_order_detail',
    created_by='admin'
)

print(result)
```

---

## 📊 识别结果示例

### 输入表: `prod_dw.dwd_trade_order_detail`

| 物理字段名 | 注释 | 类型 | 识别结果 |
|-----------|------|------|---------|
| ds | 数据日期 | STRING | 分区键 ✅ |
| order_id | 订单ID | STRING | 维度 |
| user_mobile | 手机号 | STRING | 敏感 🔒 (MOBILE) |
| id_card | 身份证号 | STRING | 敏感 🔒 (ID_CARD) |
| order_amount | 订单金额 | DECIMAL | 度量 📊 |
| order_cnt | 订单数量 | BIGINT | 度量 📊 |
| city | 城市 | STRING | 维度 |

### 识别置信度

```
ds          -> 分区键 (置信度: 1.00)
user_mobile -> 敏感   (置信度: 0.95, 规则: 名称+注释)
order_amount-> 度量   (置信度: 0.90, 规则: 类型+名称+注释)
```

---

## 🔧 人工修正流程

### 1. 预览识别结果

```bash
curl "http://localhost:5000/api/v1/metadata/sync/preview?project=prod_dw&table=xxx" \
  -H "X-User-ID: admin"
```

### 2. 修正字段属性

```bash
curl -X POST http://localhost:5000/api/v1/metadata/datasets/101/fields/5/override \
  -H "Content-Type: application/json" \
  -H "X-User-ID: admin" \
  -d '{
    "business_name": "订单实付金额",
    "field_category": "MEASURE",
    "masking_rule": null
  }'
```

### 3. 完成注册

```bash
curl -X POST http://localhost:5000/api/v1/metadata/datasets/101/finalize \
  -H "X-User-ID: admin"
```

---

## 🎯 API 接口列表

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/metadata/sync/trigger` | 触发元数据同步 |
| GET | `/api/v1/metadata/sync/preview` | 预览表元数据（不保存） |
| POST | `/api/v1/metadata/datasets/{id}/fields/{field_id}/override` | 人工修正字段属性 |
| POST | `/api/v1/metadata/datasets/{id}/finalize` | 完成数据集注册 |
| GET | `/api/v1/metadata/sync/history` | 获取同步历史记录 |

---

## 📈 最佳实践

### 1. 增量同步策略

```python
# 定期检查表结构变更
# 对比现有字段和新采集的字段
# 只更新新增或变更的字段
```

### 2. 识别规则优化

在 `field_identification_rules` 表中添加自定义规则：

```sql
INSERT INTO field_identification_rules (
    rule_name, rule_type, match_strategy, 
    pattern, target_attribute, target_value, priority
) VALUES (
    '业务自定义-会员等级',
    'DIMENSION',
    'NAME_REGEX',
    'member_level|vip_level',
    'field_category',
    'DIMENSION',
    50
);
```

### 3. 采样验证

```python
# 抽取 10 条数据验证字段内容
sample_data = odps.execute_sql(
    f"SELECT {field_name} FROM {table} LIMIT 10"
).values

# 检查是否符合手机号格式
import re
mobile_pattern = r'^1[3-9]\d{9}$'
is_mobile = all(re.match(mobile_pattern, str(v)) for v in sample_data)
```

---

## 🐛 故障排查

### 问题 1: 无法连接 MaxCompute

**错误**: `ODPS authentication failed`

**解决方案**:
1. 检查 AccessKey ID 和 Secret 是否正确
2. 检查 Endpoint 是否正确
3. 确认账号有表的读取权限

### 问题 2: 识别结果不准确

**原因**: 规则不够完善

**解决方案**:
1. 添加自定义识别规则到数据库
2. 查看 `matched_rules` 字段了解命中的规则
3. 调整规则优先级

### 问题 3: 同步性能慢

**优化建议**:
1. 使用异步任务队列（Celery）
2. 批量同步多个表
3. 缓存已识别的字段

---

## 📚 相关文件

| 文件 | 说明 |
|------|------|
| `schema/metadata_sync_extension.sql` | 数据库扩展 DDL |
| `app/services/metadata_sync.py` | 核心同步服务 |
| `app/routes/metadata_sync.py` | API 路由 |
| `docs/METADATA_SYNC_GUIDE.md` | 本文档 |

---

## 🎉 总结

元数据同步功能已完整实现：

✅ **数据库架构** - 完整的表结构和扩展字段  
✅ **智能识别引擎** - 分区/敏感/度量字段自动识别  
✅ **元数据采集器** - PyODPS 集成  
✅ **API 接口** - 完整的 RESTful API  
✅ **人工修正流程** - 支持二次调整  

现在可以开始使用这个功能来自动注册数据集了！🚀

