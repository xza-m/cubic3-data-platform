# 表名规范化功能文档

**日期**: 2025-12-22  
**功能**: 根据数据源类型智能处理表名格式  
**状态**: ✅ 已完成  

---

## 问题背景

### 用户反馈

> "选择的是pg，数据库是exam_db，schema是public。在执行数据提取时，因为已经选定了数据集，所以在执行查询时就不需要再加relation了吧，直接基于表名查询是不是更好"

### 问题描述

在PostgreSQL数据源中执行查询时，系统生成的SQL包含了数据库前缀：

```sql
-- ❌ 错误的SQL（导致查询失败）
SELECT * FROM exam_db.dict_score_types

-- 错误信息
relation "exam_db.dict_score_types" does not exist
```

**根本原因**：
- PostgreSQL连接时已经指定了数据库名（`exam_db`）
- 在该数据库连接中，不需要（也不能）再使用数据库前缀
- PostgreSQL使用 `schema.table` 或 `table`（默认public schema）格式

---

## 解决方案

### 核心思路

**智能表名规范化**：根据数据源类型，自动调整表名格式，确保生成的SQL符合该数据库的语法规范。

```
数据集物理表名 + 数据源类型
        ↓
  _normalize_table_name()
        ↓
    规范化后的表名
        ↓
    生成正确的SQL
```

### 技术实现

#### 1. 新增表名规范化方法

**文件**: `app/services/extraction_service.py`  
**方法**: `_normalize_table_name(physical_table: str, source_type: str) -> str`

```python
@staticmethod
def _normalize_table_name(physical_table: str, source_type: str) -> str:
    """
    根据数据源类型规范化表名
    
    不同数据库的表名格式：
    - PostgreSQL: schema.table 或 table（连接时已指定数据库）
    - MySQL: database.table 或 table（连接时已指定数据库）
    - MaxCompute: project.table（必需）
    - ClickHouse: database.table（必需）
    """
    # ... 详细实现见代码
```

#### 2. 修改SQL生成逻辑

**文件**: `app/services/extraction_service.py`  
**方法**: `generate_sql()`

```python
def generate_sql(dataset, select_fields, filter_conditions, limit):
    # 解析物理表名（根据数据源类型智能处理）
    table = ExtractionService._normalize_table_name(
        dataset.physical_table, 
        dataset.source.source_type if dataset.source else None
    )
    
    # 后续SQL生成逻辑...
```

---

## 不同数据库的表名格式

### PostgreSQL

**连接配置**:
```json
{
  "host": "localhost",
  "port": 5432,
  "database": "exam_db",  // ← 在连接时指定
  "user": "postgres",
  "password": "xxx"
}
```

**表名格式**:
| 输入格式 | 输出格式 | 说明 |
|---------|---------|------|
| `exam_db.dict_score_types` | `dict_score_types` | 去掉数据库前缀 |
| `exam_db.public.dict_score_types` | `public.dict_score_types` | database.schema.table → schema.table |
| `public.dict_score_types` | `public.dict_score_types` | 已经是schema.table，保持不变 |
| `dict_score_types` | `dict_score_types` | 单表名，保持不变 |

**生成的SQL**:
```sql
-- ✅ 正确
SELECT * FROM dict_score_types
SELECT * FROM public.dict_score_types
```

### MySQL

**连接配置**:
```json
{
  "host": "localhost",
  "port": 3306,
  "database": "exam_db",  // ← 可以在连接时指定
  "user": "root",
  "password": "xxx"
}
```

**表名格式**:
| 输入格式 | 输出格式 | 说明 |
|---------|---------|------|
| `exam_db.dict_score_types` | `exam_db.dict_score_types` | 保留database.table（兼容） |
| `dict_score_types` | `dict_score_types` | 单表名，保持不变 |

**生成的SQL**:
```sql
-- ✅ 都正确（MySQL支持两种格式）
SELECT * FROM exam_db.dict_score_types
SELECT * FROM dict_score_types  -- 如果连接配置指定了数据库
```

### MaxCompute

**连接配置**:
```json
{
  "access_id": "xxx",
  "access_key": "xxx",
  "project": "dw_prod",  // ← 默认项目
  "endpoint": "xxx"
}
```

**表名格式**:
| 输入格式 | 输出格式 | 说明 |
|---------|---------|------|
| `dw_prod.dws_order_info_di` | `dw_prod.dws_order_info_di` | 保持project.table格式（必需） |

**生成的SQL**:
```sql
-- ✅ 正确（MaxCompute必须使用project.table）
SELECT * FROM dw_prod.dws_order_info_di
```

### ClickHouse

**连接配置**:
```json
{
  "host": "localhost",
  "port": 9000,
  "database": "analytics",  // ← 默认数据库
  "user": "default",
  "password": "xxx"
}
```

**表名格式**:
| 输入格式 | 输出格式 | 说明 |
|---------|---------|------|
| `analytics.events` | `analytics.events` | 保持database.table格式 |

**生成的SQL**:
```sql
-- ✅ 正确
SELECT * FROM analytics.events
```

---

## 测试验证

### 测试脚本

**文件**: `test_table_normalize.py`

运行测试：
```bash
docker exec dw_bi_webhook_gateway-web-1 python test_table_normalize.py
```

### 测试结果

```
================================================================================
表名规范化测试
================================================================================

测试 1: ✅ PASS
  说明: PostgreSQL: database.table -> table
  数据源: postgresql
  输入: exam_db.dict_score_types
  期望: dict_score_types
  实际: dict_score_types

测试 2: ✅ PASS
  说明: PostgreSQL: database.schema.table -> schema.table
  数据源: postgresql
  输入: exam_db.public.dict_score_types
  期望: public.dict_score_types
  实际: public.dict_score_types

测试 3: ✅ PASS
  说明: PostgreSQL: schema.table -> schema.table (保持不变)
  数据源: postgresql
  输入: public.dict_score_types
  期望: public.dict_score_types
  实际: public.dict_score_types

测试 4: ✅ PASS
  说明: PostgreSQL: table -> table (保持不变)
  数据源: postgresql
  输入: dict_score_types
  期望: dict_score_types
  实际: dict_score_types

... (其他数据源测试全部通过)

================================================================================
测试结果: 8 通过, 0 失败
================================================================================
```

---

## 使用说明

### 对用户的影响

**之前**（❌ 错误）:
1. 在PostgreSQL数据源上注册数据集时，如果输入 `exam_db.dict_score_types`
2. 执行查询时生成SQL：`SELECT * FROM exam_db.dict_score_types`
3. 查询失败：`relation "exam_db.dict_score_types" does not exist`

**现在**（✅ 正确）:
1. 在PostgreSQL数据源上注册数据集时，可以输入任何格式：
   - `exam_db.dict_score_types`
   - `exam_db.public.dict_score_types`
   - `public.dict_score_types`
   - `dict_score_types`
2. 执行查询时，系统自动规范化为：`dict_score_types` 或 `public.dict_score_types`
3. 查询成功：✅

### 注册数据集的最佳实践

**PostgreSQL数据源**:
```
推荐格式1: dict_score_types
推荐格式2: public.dict_score_types
避免格式: exam_db.dict_score_types (虽然系统会自动修正，但不推荐)
```

**MySQL数据源**:
```
推荐格式1: dict_score_types (如果连接配置指定了数据库)
推荐格式2: exam_db.dict_score_types
```

**MaxCompute数据源**:
```
必需格式: dw_prod.dws_order_info_di
```

**ClickHouse数据源**:
```
推荐格式: analytics.events
```

---

## 相关文件清单

| 文件 | 修改类型 | 说明 |
|------|----------|------|
| `app/services/extraction_service.py` | ✏️ 修改 | 新增 `_normalize_table_name` 方法 |
| `test_table_normalize.py` | ✨ 新增 | 表名规范化测试脚本 |
| `docs/TABLE_NAME_NORMALIZATION.md` | ✨ 新增 | 功能文档 |

### 修改详情

**app/services/extraction_service.py**:
- `generate_sql` 方法（第22-47行）：调用 `_normalize_table_name` 处理表名
- `_normalize_table_name` 方法（第73-160行）：新增方法，智能规范化表名

---

## 架构设计原则

### 1. 分离关注点

```
数据集注册 (Dataset Registration)
    ↓
   存储物理表名（可能包含各种格式）
    ↓
查询执行 (Query Execution)
    ↓
   规范化表名（根据数据源类型调整）
    ↓
   生成SQL（使用规范化后的表名）
```

**好处**:
- 数据集注册时，用户可以输入灵活的格式
- 查询执行时，系统自动处理为正确格式
- 对用户友好，对数据库正确

### 2. 数据源连接配置的作用

**连接配置已经包含的信息**:
- PostgreSQL: `database` 参数
- MySQL: `database` 参数
- MaxCompute: `project` 参数（但查询时仍需显式指定）
- ClickHouse: `database` 参数

**SQL生成的原则**:
- **OLTP数据库（PostgreSQL、MySQL）**: 连接时已指定数据库，查询时通常不需要数据库前缀
- **OLAP数据库（MaxCompute、ClickHouse）**: 即使连接时指定了项目/数据库，查询时仍建议显式指定

### 3. 向后兼容

对于已有的数据集：
- 如果物理表名格式不正确，系统会自动修正
- 不需要手动更新已注册的数据集
- 透明升级，无感知

---

## 经验总结

### 技术要点

1. **了解不同数据库的连接和查询规范**
   - PostgreSQL: 连接到数据库后，使用 schema.table 或 table
   - MySQL: 两种格式都支持（database.table 或 table）
   - MaxCompute: 必须使用 project.table
   - ClickHouse: 必须使用 database.table

2. **智能处理，而不是强制用户遵循规范**
   - 用户可能不熟悉每种数据库的规范
   - 系统应该容错并自动修正

3. **测试驱动开发**
   - 编写测试用例覆盖各种场景
   - 确保规范化逻辑正确

### 设计原则

**用户友好 (User-Friendly)**:
```
用户输入: exam_db.dict_score_types (可能不规范)
        ↓
系统处理: dict_score_types (自动规范化)
        ↓
查询成功: ✅
```

而不是:
```
用户输入: exam_db.dict_score_types
        ↓
系统报错: 格式不正确，请输入 dict_score_types
        ↓
用户修改: (手动修正)
```

**数据库正确 (Database-Correct)**:
```
为每种数据库生成符合其语法规范的SQL
```

---

## 后续优化建议

### 1. 数据集注册时的智能提示

在数据集注册界面，根据数据源类型显示正确的表名格式示例：

```javascript
// 示例
if (sourceType === 'postgresql') {
    placeholder = '例如: dict_score_types 或 public.dict_score_types'
} else if (sourceType === 'maxcompute') {
    placeholder = '例如: dw_prod.dws_order_info_di'
}
```

### 2. 表名验证

在注册数据集时，验证表名格式是否合理：

```python
def validate_table_name(table_name: str, source_type: str) -> bool:
    """验证表名格式是否符合数据源规范"""
    # 实现验证逻辑
```

### 3. 元数据同步时自动修正

在执行"元数据同步"时，自动将物理表名更新为规范格式：

```python
# 同步时自动修正表名
normalized_table = _normalize_table_name(dataset.physical_table, source_type)
if normalized_table != dataset.physical_table:
    dataset.physical_table = normalized_table
    db.session.commit()
    logger.info(f"表名已自动规范化: {original} -> {normalized_table}")
```

### 4. 支持更多数据源

扩展 `_normalize_table_name` 方法，支持更多数据源类型：
- Hive
- Presto
- Trino
- Impala
- Oracle
- SQL Server

---

**功能完成时间**: 2025-12-22 15:40  
**影响范围**: 数据提取 - SQL生成逻辑  
**风险等级**: 🟢 低（智能处理，向后兼容）  
**测试状态**: ✅ 已验证所有测试用例通过  
**用户体验**: 🟢 显著提升（PostgreSQL查询成功，用户无需关心表名格式）

