# 数据提取页面数据集加载失败修复

## 🐛 问题描述

**现象**：在数据提取配置页面，选择数据集后显示"加载数据集详情失败"错误。

**影响**：用户无法进行数据提取配置。

## 🔍 问题分析

### 原因1：缺少HTTP响应状态检查

```javascript
// 旧代码
const response = await fetch(`/api/datasets/${datasetId}`);
const data = await response.json();  // 没有检查响应状态
```

- 即使HTTP请求失败（404、500等），也会尝试解析JSON
- 导致错误信息不明确

### 原因2：缺少业务状态码检查

```javascript
// 旧代码
selectedDataset = data.data;  // 没有检查 data.code
```

- 没有检查返回的 `code` 字段
- 即使API返回错误，也会尝试访问 `data.data`

### 原因3：字段数据格式不匹配

**API返回的数据格式**：
```json
{
    "code": 0,
    "data": {
        "partition_fields": [],
        "dimension_fields": ["name"],
        "metric_fields": ["id"]
    }
}
```

**代码期望的格式**：
```javascript
selectedDataset.fields  // ❌ 不存在！
```

- API返回的是分类字段（partition_fields、dimension_fields、metric_fields）
- 代码期望的是统一的 `fields` 数组
- **数据格式不匹配导致加载失败**

### 原因4：错误处理不够友好

```javascript
// 旧代码
catch (error) {
    showAlert('加载数据集详情失败', 'error');  // 错误信息不详细
}
```

- 没有显示具体的错误原因
- 用户无法判断是哪里出了问题

## ✅ 修复方案

### 1. 添加HTTP响应状态检查

```javascript
const response = await fetch(`/api/datasets/${datasetId}`);

if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
}
```

**改进点**：
- ✅ 检查HTTP状态码
- ✅ 提供详细的错误信息（如 `HTTP 404: Not Found`）

### 2. 添加业务状态码检查

```javascript
const data = await response.json();

// 检查返回的数据格式
if (data.code !== 0) {
    throw new Error(data.message || '加载失败');
}

if (!data.data) {
    throw new Error('数据集不存在');
}
```

**改进点**：
- ✅ 检查业务状态码 `code`
- ✅ 验证数据存在性
- ✅ 提取错误消息

### 3. 兼容多种字段数据格式

```javascript
let fields = [];

// 方式1: dataset.fields (统一字段列表)
if (selectedDataset.fields && Array.isArray(selectedDataset.fields)) {
    fields = selectedDataset.fields;
}
// 方式2: 从分区、维度、度量字段组合
else {
    const partitionFields = selectedDataset.partition_fields || [];
    const dimensionFields = selectedDataset.dimension_fields || [];
    const metricFields = selectedDataset.metric_fields || [];
    
    // 组合所有字段
    fields = [
        ...partitionFields.map(f => ({
            field_name: f,
            field_type: 'partition',
            data_type: 'string'
        })),
        ...dimensionFields.map(f => ({
            field_name: f,
            field_type: 'dimension',
            data_type: 'string'
        })),
        ...metricFields.map(f => ({
            field_name: f,
            field_type: 'measure',
            data_type: 'number'
        }))
    ];
}
```

**改进点**：
- ✅ 支持统一的 `fields` 格式
- ✅ 支持分类字段格式（partition/dimension/metric）
- ✅ 自动转换为统一格式

### 4. 降级方案：从字段API加载

```javascript
if (fields.length === 0) {
    console.warn('数据集没有字段信息，尝试从API加载...');
    try {
        const fieldsResponse = await fetch(`/api/datasets/${datasetId}/fields`);
        if (fieldsResponse.ok) {
            const fieldsData = await fieldsResponse.json();
            if (fieldsData.code === 0 && fieldsData.data) {
                fields = fieldsData.data;
            }
        }
    } catch (fieldError) {
        console.warn('从字段API加载失败:', fieldError);
    }
}
```

**改进点**：
- ✅ 提供备用加载方案
- ✅ 不阻塞主流程
- ✅ 静默失败，不影响用户体验

### 5. 改进错误提示

```javascript
catch (error) {
    console.error('加载数据集详情失败:', error);
    showAlert('加载数据集详情失败: ' + error.message, 'error');
    
    // 重置状态并显示友好的错误界面
    document.getElementById('fieldSelector').innerHTML = `
        <div style="padding: 40px; text-align: center; color: #ef4444;">
            <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
            <div style="font-weight: 600; margin-bottom: 8px;">加载失败</div>
            <div style="font-size: 14px; color: #94a3b8;">${error.message}</div>
        </div>
    `;
}
```

**改进点**：
- ✅ 显示详细的错误原因
- ✅ 友好的错误界面
- ✅ 重置状态，避免数据残留

## 📊 修复前后对比

### 修复前

| 场景 | 行为 | 错误信息 |
|------|------|----------|
| API返回404 | ❌ JSON解析失败 | "加载数据集详情失败" |
| API返回错误code | ❌ 访问undefined | "加载数据集详情失败" |
| 字段格式不匹配 | ❌ fields为undefined | "加载数据集详情失败" |

### 修复后

| 场景 | 行为 | 错误信息 |
|------|------|----------|
| API返回404 | ✅ 捕获HTTP错误 | "HTTP 404: Not Found" |
| API返回错误code | ✅ 捕获业务错误 | 具体的错误消息 |
| 字段格式不匹配 | ✅ 自动转换格式 | 正常显示字段 |

## 🎯 测试验证

### 场景1：正常加载数据集

**测试步骤**：
1. 访问数据提取配置页面
2. 选择数据集"学校测试集"

**预期结果**：
```
✅ 成功加载数据集: 学校测试集 (2个字段)
✅ 显示字段选择器：
   - 维度字段: name
   - 度量字段: id
```

### 场景2：数据集不存在

**测试步骤**：
1. 访问 `/extraction/config?dataset=99999`
2. 页面自动选择不存在的数据集

**预期结果**：
```
❌ 加载失败
HTTP 404: Not Found
```

### 场景3：API返回错误

**模拟**：API返回 `{"code": 1, "message": "数据集已被删除"}`

**预期结果**：
```
❌ 加载失败
数据集已被删除
```

## 💻 完整代码对比

### 修复前
```javascript
async function onDatasetChange(e) {
    const datasetId = e.target.value;
    if (!datasetId) {
        selectedDataset = null;
        return;
    }
    
    showLoading('加载字段信息...');
    
    try {
        const response = await fetch(`/api/datasets/${datasetId}`);
        const data = await response.json();
        selectedDataset = data.data;
        
        document.getElementById('datasetDesc').textContent = selectedDataset.description || '暂无说明';
        renderFieldSelector(selectedDataset.fields);  // ❌ fields 不存在
        
    } catch (error) {
        console.error('加载数据集详情失败:', error);
        showAlert('加载数据集详情失败', 'error');  // ❌ 错误信息不详细
    } finally {
        hideLoading();
    }
}
```

### 修复后
```javascript
async function onDatasetChange(e) {
    const datasetId = e.target.value;
    if (!datasetId) {
        selectedDataset = null;
        document.getElementById('fieldSelector').innerHTML = '<div>...</div>';
        return;
    }
    
    showLoading('加载字段信息...');
    
    try {
        // ✅ 检查HTTP响应状态
        const response = await fetch(`/api/datasets/${datasetId}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // ✅ 检查业务状态码
        if (data.code !== 0) {
            throw new Error(data.message || '加载失败');
        }
        
        if (!data.data) {
            throw new Error('数据集不存在');
        }
        
        selectedDataset = data.data;
        
        // ✅ 安全地更新DOM
        const descElement = document.getElementById('datasetDesc');
        if (descElement) {
            descElement.textContent = selectedDataset.description || '暂无说明';
        }
        
        // ✅ 兼容多种字段格式
        let fields = [];
        if (selectedDataset.fields && Array.isArray(selectedDataset.fields)) {
            fields = selectedDataset.fields;
        } else {
            // 从分类字段组合
            const partitionFields = selectedDataset.partition_fields || [];
            const dimensionFields = selectedDataset.dimension_fields || [];
            const metricFields = selectedDataset.metric_fields || [];
            
            fields = [
                ...partitionFields.map(f => ({
                    field_name: f,
                    field_type: 'partition',
                    data_type: 'string'
                })),
                ...dimensionFields.map(f => ({
                    field_name: f,
                    field_type: 'dimension',
                    data_type: 'string'
                })),
                ...metricFields.map(f => ({
                    field_name: f,
                    field_type: 'measure',
                    data_type: 'number'
                }))
            ];
        }
        
        // ✅ 降级方案：从字段API加载
        if (fields.length === 0) {
            console.warn('数据集没有字段信息，尝试从API加载...');
            try {
                const fieldsResponse = await fetch(`/api/datasets/${datasetId}/fields`);
                if (fieldsResponse.ok) {
                    const fieldsData = await fieldsResponse.json();
                    if (fieldsData.code === 0 && fieldsData.data) {
                        fields = fieldsData.data;
                    }
                }
            } catch (fieldError) {
                console.warn('从字段API加载失败:', fieldError);
            }
        }
        
        renderFieldSelector(fields);
        
        console.info('成功加载数据集:', selectedDataset.dataset_name, `(${fields.length}个字段)`);
        
    } catch (error) {
        console.error('加载数据集详情失败:', error);
        // ✅ 显示详细的错误信息
        showAlert('加载数据集详情失败: ' + error.message, 'error');
        
        // ✅ 友好的错误界面
        selectedDataset = null;
        document.getElementById('fieldSelector').innerHTML = `
            <div style="padding: 40px; text-align: center; color: #ef4444;">
                <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
                <div style="font-weight: 600; margin-bottom: 8px;">加载失败</div>
                <div style="font-size: 14px; color: #94a3b8;">${error.message}</div>
            </div>
        `;
    } finally {
        hideLoading();
    }
}
```

## 📝 API响应示例

### 成功响应
```json
{
    "code": 0,
    "data": {
        "id": 2,
        "dataset_name": "学校测试集",
        "dataset_code": "ds_test_pgpostgresql_schools_izk99o",
        "description": "",
        "partition_fields": [],
        "dimension_fields": ["name"],
        "metric_fields": ["id"],
        "physical_table": "exam_db_v2.schools"
    },
    "message": "success"
}
```

### 处理结果
```javascript
// 自动转换为统一格式
fields = [
    {
        field_name: "name",
        field_type: "dimension",
        data_type: "string"
    },
    {
        field_name: "id",
        field_type: "measure",
        data_type: "number"
    }
]
```

## ✅ 验证结果

- ✅ HTTP响应状态检查已添加
- ✅ 业务状态码检查已添加
- ✅ 支持多种字段数据格式
- ✅ 提供降级加载方案
- ✅ 错误提示更详细
- ✅ 错误界面更友好
- ✅ 控制台日志更完善

## 🎉 总结

本次修复主要解决了数据集详情加载的健壮性问题：

1. **完善错误检查** - HTTP状态、业务状态、数据存在性
2. **兼容数据格式** - 支持统一格式和分类格式
3. **提供降级方案** - 多种加载途径
4. **改进用户体验** - 详细错误信息、友好错误界面

**修改文件**：`app/templates/extraction_config.html`  
**修改函数**：`onDatasetChange()`  
**修改时间**：2025-12-22  
**状态**：✅ 已完成并验证

