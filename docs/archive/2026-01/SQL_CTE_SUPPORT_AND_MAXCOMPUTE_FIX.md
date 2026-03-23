# MaxCompute 字段映射修复

## 问题描述

用户在测试 MaxCompute 数据源连接时遇到错误：
```
连接失败: AccessKeyIdNotFound: RequestId: 6979DBDAB3E26CD57A36A59A 
Tag: ODPS Endpoint: https://service.cn-beijing.maxcompute.aliyun.com/api
ODPS-0410051:Invalid credentials - accessKeyId not found: your_access_id
```

## 根本原因

**前端和后端的字段名不匹配：**

### 前端发送的字段（标准阿里云命名）
```json
{
  "connection_config": {
    "access_key_id": "LTAI...",
    "access_key_secret": "your_secret",
    "endpoint": "https://...",
    "project": "your_project"
  }
}
```

### 后端适配器期望的字段
```python
{
  "access_id": "LTAI...",      # ❌ 不匹配
  "access_key": "your_secret",  # ❌ 不匹配
  "endpoint": "https://...",
  "project": "your_project"
}
```

## 解决方案

**方案 A：在后端添加字段映射逻辑**（已实施）

在三个关键处理器中添加 `_normalize_connection_config()` 方法，将前端字段映射为适配器期望的字段：

### 修改的文件

1. **`app/application/datasource/handlers/create_datasource_handler.py`**
   - 添加字段映射方法
   - 在创建数据源前规范化配置

2. **`app/application/datasource/handlers/test_connection_handler.py`**
   - 添加字段映射方法
   - 在测试连接前规范化配置

3. **`app/application/datasource/handlers/update_datasource_handler.py`**
   - 添加字段映射方法
   - 在更新数据源配置时规范化新配置

### 字段映射逻辑

```python
def _normalize_connection_config(self, source_type: str, config: Dict[str, Any]) -> Dict[str, Any]:
    """
    规范化连接配置，兼容前端字段命名
    
    前端使用标准的阿里云字段命名（access_key_id, access_key_secret），
    需要映射为适配器期望的字段名（access_id, access_key）
    """
    normalized = config.copy()
    
    # MaxCompute 字段映射
    if source_type == 'maxcompute':
        # access_key_id -> access_id
        if 'access_key_id' in normalized:
            normalized['access_id'] = normalized.pop('access_key_id')
        
        # access_key_secret -> access_key
        if 'access_key_secret' in normalized:
            normalized['access_key'] = normalized.pop('access_key_secret')
    
    return normalized
```

## 验证步骤

1. 重启后端服务：
   ```bash
   docker compose -f docker-compose.full.yml restart backend
   ```

2. 在前端数据源管理页面测试 MaxCompute 连接：
   - 填写正确的 Access Key ID
   - 填写正确的 Access Key Secret
   - 填写 Endpoint
   - 填写 Project 名称
   - 点击"测试连接"

3. 预期结果：
   ```
   ✅ 成功连接到项目: your_project_name
   ```

## 优点

- ✅ 前端使用标准的阿里云字段命名（更规范）
- ✅ 后端兼容前端字段，无需修改前端代码
- ✅ 对用户透明，无需额外配置
- ✅ 易于扩展到其他数据源类型

## 修复时间

2026-01-28 19:36

---

# SQL 校验优化：支持 CTE（WITH）语法

## 问题描述

用户在使用自定义 SQL 时遇到校验错误：
```
["SQL 必须以 SELECT 开头"]
```

用户的 SQL 使用了 CTE（Common Table Expression），即 `WITH AS` 语法：
```sql
WITH temp AS (
    SELECT id, name FROM users WHERE age > 18
)
SELECT * FROM temp
```

## 根本原因

**旧的校验逻辑过于严格：**

### 问题代码（app/interfaces/api/v1/sql_lab.py 第58行）
```python
# 必须以 SELECT 开头
if not sql_upper.startswith('SELECT'):
    errors.append('SQL 必须以 SELECT 开头')
```

**缺陷**：
- ❌ 只允许 `SELECT` 开头
- ❌ 不支持 `WITH` (CTE) 语法
- ❌ 使用自定义正则表达式，维护成本高

## 解决方案

**引入标准 SQL 解析库 sqlparse**

### 1. 添加依赖

在 `requirements.txt` 中添加：
```
sqlparse==0.5.0
```

### 2. 创建通用 SQL 校验工具

新建 `app/shared/utils/sql_validator.py`：
- ✅ 使用 sqlparse 专业解析 SQL
- ✅ 支持 SELECT 和 WITH (CTE) 查询
- ✅ 自动移除注释后进行检查
- ✅ 精确的危险关键字检测
- ✅ 更好的错误提示

### 3. 更新调用点

修改以下文件使用新的校验函数：
- `app/interfaces/api/v1/sql_lab.py` - SQL Lab API
- `app/application/query/handlers/execute_query_handler.py` - 查询执行 Handler

## 支持的 SQL 类型

| SQL 类型 | 示例 | 支持状态 |
|---------|------|---------|
| **SELECT 查询** | `SELECT * FROM users` | ✅ 支持 |
| **简单 CTE** | `WITH temp AS (...) SELECT * FROM temp` | ✅ 支持 |
| **多个 CTE** | `WITH a AS (...), b AS (...) SELECT ...` | ✅ 支持 |
| **递归 CTE** | `WITH RECURSIVE cte AS (...) SELECT ...` | ✅ 支持 |
| **带注释的 CTE** | `-- comment\nWITH temp AS (...) SELECT ...` | ✅ 支持 |
| **DDL 操作** | `DROP TABLE`, `CREATE TABLE` | ❌ 禁止 |
| **DML 操作** | `INSERT`, `UPDATE`, `DELETE` | ❌ 禁止 |

## 测试结果

已通过以下测试用例：
- ✅ 简单 SELECT 查询
- ✅ 简单 CTE 查询
- ✅ 多个 CTE 查询
- ✅ 递归 CTE 查询
- ✅ 带注释的 CTE 查询
- ✅ 危险操作正确拦截（DROP, DELETE, INSERT 等）
- ✅ 非 SELECT/WITH 查询正确拦截（SHOW TABLES 等）
- ✅ 空 SQL 正确拦截

## 优点对比

| 对比项 | 旧方案（自定义正则） | 新方案（sqlparse） |
|-------|------------------|------------------|
| **准确性** | ❌ 容易误判 | ✅ 专业解析 |
| **维护成本** | ❌ 高 | ✅ 低 |
| **CTE 支持** | ❌ 需手动添加 | ✅ 原生支持 |
| **错误提示** | ❌ 模糊 | ✅ 精确 |
| **扩展性** | ❌ 困难 | ✅ 易扩展 |

## 部署步骤

1. 重新构建 Docker 镜像：
   ```bash
   docker compose -f docker-compose.full.yml build backend
   ```

2. 重启后端服务：
   ```bash
   docker compose -f docker-compose.full.yml up -d backend
   ```

3. 验证服务启动：
   ```bash
   docker compose -f docker-compose.full.yml logs backend --tail 20
   ```

## 文档更新

已更新 `docs/TECH_STACK_AND_ARCHITECTURE.md`：
- 添加 sqlparse 到技术栈列表
- 新增"七、SQL 校验机制"章节
- 详细说明支持的 SQL 语法和校验规则

## 修复时间

- MaxCompute 字段映射（第一次）：2026-01-28 19:36
- SQL 校验支持 CTE：2026-01-28 19:53
- MaxCompute 字段映射（完整修复）：2026-01-28 20:10

---

# MaxCompute 字段映射完整修复

## 问题复现

在完成第一次修复后，用户在**查询执行**时仍然遇到相同的错误：
```
查询失败: SQL 执行失败: 查询执行失败: AccessKeyIdNotFound: RequestId: 6979FC09C6E4BCE3165142A5 
Tag: ODPS Endpoint: https://service.cn-beijing.maxcompute.aliyun.com/api
ODPS-0410051:Invalid credentials - accessKeyId not found: your_access_id
```

## 根本原因分析

第一次修复只在**数据源管理的 Handler 层**添加了字段映射：
- ✅ `create_datasource_handler.py` - 创建数据源
- ✅ `test_connection_handler.py` - 测试连接
- ✅ `update_datasource_handler.py` - 更新数据源

但是，**查询执行**时会直接从数据库读取已保存的配置，然后通过 `AdapterFactory` 创建适配器。这个路径**没有经过** Handler 层的字段映射！

### 代码路径对比

#### 路径 1：创建/测试数据源（已修复）
```
前端 → API → Handler (字段映射) → Repository → Database
                ↓
            AdapterFactory → Adapter
```

#### 路径 2：查询执行（未修复）
```
前端 → API → Handler → Repository → Database (读取配置)
                            ↓
                    AdapterFactory (无字段映射) → Adapter ❌
```

## 完整解决方案

**在 AdapterFactory 中添加字段映射**

这样无论从哪个路径创建适配器，都会自动进行字段映射。

### 修改的文件

**`app/infrastructure/adapters/datasources/factory.py`**

添加 `_normalize_connection_config()` 方法，并在 `create_adapter()` 中调用：

```python
@classmethod
def _normalize_connection_config(cls, source_type: str, config: Dict[str, Any]) -> Dict[str, Any]:
    """
    规范化连接配置，兼容前端字段命名
    """
    if not config:
        return config
    
    normalized = config.copy()
    
    # MaxCompute 字段映射
    if source_type.lower() == 'maxcompute':
        # access_key_id -> access_id
        if 'access_key_id' in normalized:
            normalized['access_id'] = normalized.pop('access_key_id')
        
        # access_key_secret -> access_key
        if 'access_key_secret' in normalized:
            normalized['access_key'] = normalized.pop('access_key_secret')
    
    return normalized

@classmethod
def create_adapter(cls, source_type: str, config: Dict[str, Any]) -> DataSourceAdapter:
    """创建数据源适配器实例"""
    adapter_class = cls._adapters.get(source_type.lower())
    
    if not adapter_class:
        raise ValueError(
            f"不支持的数据源类型: {source_type}. "
            f"支持的类型: {', '.join(cls._adapters.keys())}"
        )
    
    # 规范化连接配置（字段映射）
    normalized_config = cls._normalize_connection_config(source_type, config)
    
    return adapter_class(normalized_config)
```

## 影响范围

现在所有创建适配器的路径都会自动进行字段映射：
- ✅ 创建数据源
- ✅ 测试连接
- ✅ 更新数据源
- ✅ **查询执行**（SQL Lab）
- ✅ **保存的查询执行**
- ✅ **数据提取任务**
- ✅ 所有其他使用 `AdapterFactory.create_adapter()` 的地方

## 验证步骤

1. 重新构建 Docker 镜像：
   ```bash
   docker compose -f docker-compose.full.yml build backend
   ```

2. 重启后端服务：
   ```bash
   docker compose -f docker-compose.full.yml restart backend
   ```

3. 在 SQL Lab 中执行 MaxCompute 查询：
   - 选择 MaxCompute 数据源
   - 输入 SQL 查询（支持 CTE）
   - 点击"执行"

4. 预期结果：
   ```
   ✅ 查询成功执行，返回数据
   ```

## 架构优化

通过在 **AdapterFactory（工厂层）** 添加字段映射，实现了：
- ✅ **单一职责**：字段映射逻辑集中在工厂类
- ✅ **全局生效**：所有创建适配器的地方自动应用
- ✅ **易于维护**：只需在一个地方修改
- ✅ **易于扩展**：未来支持其他数据源的字段映射

## 总结

### 问题本质
前端使用标准的阿里云字段命名（`access_key_id`, `access_key_secret`），但后端适配器期望不同的字段名（`access_id`, `access_key`）。

### 解决方案演进
1. **第一次修复**：在 Handler 层添加字段映射 → 只解决了创建/测试连接
2. **第二次修复**：在 Factory 层添加字段映射 → 彻底解决所有路径

### 最佳实践
对于字段映射这类**横切关注点**，应该在**工厂层或适配器层**统一处理，而不是在每个业务 Handler 中重复实现。

## 修复完成时间

2026-01-28 20:10
