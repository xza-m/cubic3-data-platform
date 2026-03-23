# 数据集注册界面故障排查指南

## 问题：数据集注册界面为空

如果您看到数据集注册界面为空，请按照以下步骤排查：

### 1. 确认已点击"数据导出"模块

数据集注册功能位于"数据导出"模块下，请确保：
1. 打开浏览器访问应用首页（例如：`http://localhost:5000`）
2. 在左侧导航栏中点击 **"📥 数据导出"** 按钮
3. 然后点击顶部的 **"📋 数据集注册"** 标签页

### 2. 检查浏览器控制台错误

打开浏览器的开发者工具（通常按 F12），查看控制台（Console）是否有 JavaScript 错误：

```
正常情况下不应该有红色错误信息
如果有错误，请将错误信息截图反馈
```

### 3. 验证 API 可访问性

在终端中运行以下命令，验证后端 API 是否正常：

```bash
# 测试元数据同步预览接口
curl -s 'http://localhost:5000/api/v1/metadata/sync/preview?project=test_project&table=test_table' \
  -H 'X-User-ID: test_user' | python -m json.tool | head -50

# 预期结果：应该返回 JSON 格式的 Mock 数据，包含字段信息
```

### 4. 检查应用日志

查看 Docker 容器日志，确认应用是否正常启动：

```bash
docker compose logs --tail 50 backend
```

预期看到：
- `Starting gunicorn`
- `Scheduler initialized with configured tasks`
- 没有 Python 错误堆栈

### 5. 重启应用

如果以上步骤都正常，尝试重启应用：

```bash
cd /path/to/cubic3-data-platform
docker compose down
docker compose up -d --build
```

等待 5-10 秒后，刷新浏览器页面。

### 6. 验证界面元素

打开浏览器的开发者工具，在 Elements（元素）标签页中，查找以下元素：

- `<div id="module-export">` - 数据导出模块
- `<div id="export-tab-register">` - 数据集注册标签页
- `<div id="registerStep1">` - 注册步骤1的表单

如果这些元素存在但不可见，检查它们的 `display` 样式：
- `module-export` 应该有 `active` 类（如果已点击数据导出）
- `export-tab-register` 应该有 `active` 类（如果已点击数据集注册）
- `registerStep1` 不应该有 `display: none`

### 7. 手动触发显示

在浏览器控制台中运行以下 JavaScript 代码，手动切换到数据集注册界面：

```javascript
// 切换到数据导出模块
switchMainModule('export');

// 切换到数据集注册标签页
switchSubTab('export', 'register');
```

如果上述命令报错 `function not defined`，说明 JavaScript 没有正确加载。

### 8. 清除浏览器缓存

有时浏览器缓存的旧版本可能导致问题：
1. 按 Ctrl+Shift+Delete（或 Cmd+Shift+Delete on Mac）
2. 选择"缓存的图片和文件"
3. 清除缓存
4. 刷新页面（Ctrl+F5 或 Cmd+Shift+R 强制刷新）

## 预期的正常界面

当数据集注册界面正常显示时，您应该看到：

### 标题区域
- **📋 数据集注册**
- 描述：从 MaxCompute 同步表元数据并自动识别字段属性

### 步骤指示器
- 1️⃣ 输入表名（高亮激活）
- 2️⃣ 预览识别
- 3️⃣ 确认注册

### 表单区域
- **💡 智能识别说明** 卡片（青色背景）
  - ✅ 分区字段：通过 MaxCompute API 识别（100%准确）
  - ✅ 敏感字段：基于名称和注释识别（约90%准确）
  - ✅ 度量字段：基于类型和名称模式识别（约85%准确）
  
- **MaxCompute 项目名 *** 输入框
  - 占位符：例如：prod_dw
  
- **表名 *** 输入框
  - 占位符：例如：dwd_trade_order_detail
  
- **覆盖已存在的数据集** 复选框

- 两个按钮：
  - 🔌 测试连接
  - 👁️ 预览识别结果

## 快速测试流程

1. 访问 `http://localhost:5000`
2. 点击左侧 "📥 数据导出"
3. 点击顶部 "📋 数据集注册"
4. 输入：
   - 项目名：`test_project`
   - 表名：`test_table`
5. 点击 "👁️ 预览识别结果"
6. 应该能看到 Mock 数据的识别结果

## 仍然有问题？

如果按照以上步骤仍然无法解决问题，请提供以下信息：

1. 浏览器版本和类型（Chrome / Firefox / Safari）
2. 浏览器控制台的完整错误信息（截图）
3. Docker 容器日志（`docker logs` 命令的输出）
4. 浏览器开发者工具中 Network 标签页的 API 请求状态

---

**提示**：如果您是首次使用该功能，当前版本使用 **Mock 数据** 进行演示。真实的 MaxCompute 连接需要配置相应的环境变量和 SDK。

## 问题：虚拟数据集查询失败 - MaxCompute SQL 解析错误

### 症状

查询虚拟数据集时出现 MaxCompute 解析错误：

```
查询失败: SQL 执行失败: 查询执行失败: ParseError: RequestId: xxx 
ODPS-0130161:[38,17] Parse exception - invalid token '>'
ODPS-0130161:[23,4] Parse exception - invalid token ','
...
```

### 原因

虚拟数据集在生成查询 SQL 时，需要将 `sql_query` 封装为子查询，但原代码直接使用 `physical_table`（对于虚拟数据集为空），导致生成的 SQL 语法错误。

**错误的 SQL 结构：**
```sql
SELECT field1, field2
FROM   -- physical_table 为空！
WHERE ...
LIMIT 10
```

### 解决方案

已在 `app/domain/services/sql_generator.py` 中修复 `_build_from_clause` 方法：

1. **识别数据集类型**：检查 `dataset.dataset_type` 是否为 `VIRTUAL`
2. **子查询封装**：将虚拟数据集的 `sql_query` 封装为带别名的子查询
3. **自动清理 SQL**：去除尾部分号，避免子查询语法错误

**修复后的 SQL 结构：**
```sql
SELECT field1, field2
FROM (
  -- 虚拟数据集的 sql_query
  SELECT * FROM project.table WHERE ...
) AS virtual_dataset
WHERE ...
LIMIT 10
```

### SQL 清理逻辑

处理虚拟数据集 SQL 时会自动：
1. 使用 `.strip()` 去除首尾空白字符
2. 检查是否以 `;` 结尾
3. 如果有分号，移除分号并再次清理右侧空白
4. 最终得到干净的 SQL 用于子查询封装

### 验证修复

修复后，虚拟数据集查询应正常执行。如果仍有问题，请检查：

1. **虚拟数据集 SQL 是否有效**：`sql_query` 必须是完整的 SELECT 语句
2. **字段映射是否正确**：外层 SELECT 的字段名应存在于虚拟数据集的字段定义中
3. **数据源连接是否正常**：确保 MaxCompute 连接配置正确

### 相关代码变更

- **文件**：`app/domain/services/sql_generator.py`
- **方法**：`SQLGeneratorService._build_from_clause()`
- **影响范围**：所有使用虚拟数据集的查询场景（数据预览、提取任务等）
