# 数据集管理编辑功能

## 📋 功能说明

在数据集管理页面中，数据集卡片现在支持完整的CRUD操作（创建、读取、更新、删除）。

## ✨ 新增功能

### 1. 点击卡片编辑

**交互方式**：
- ✅ 点击数据集卡片的任意位置即可打开编辑模态框
- ✅ 卡片悬停时显示蓝色边框提示可点击
- ✅ 按钮区域阻止事件冒泡，不会触发卡片点击

**视觉反馈**：
```css
.dataset-card {
    cursor: pointer;
}

.dataset-card:hover {
    border-color: #2563eb;
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.1);
}
```

### 2. 编辑按钮

**位置**：卡片底部操作栏

**功能**：
- ✅ 打开编辑模态框
- ✅ 可编辑数据集名称、描述、负责人
- ✅ 数据集编码不可修改（只读）

**按钮样式**：
```html
<button class="btn-sm btn-edit" onclick="editDataset(${ds.id})">
    <svg>...</svg>
    编辑
</button>
```

### 3. 删除按钮

**位置**：卡片底部操作栏

**功能**：
- ✅ 删除数据集（需二次确认）
- ✅ 删除不可恢复
- ✅ 删除成功后自动刷新列表

**按钮样式**：
```html
<button class="btn-sm btn-delete" onclick="deleteDataset(${ds.id})">
    <svg>...</svg>
    删除
</button>
```

### 4. 编辑模态框

**功能**：
- ✅ 模态框居中显示
- ✅ 支持ESC键关闭（可扩展）
- ✅ 点击背景关闭（可扩展）
- ✅ 表单验证

**可编辑字段**：
- 数据集名称（必填）
- 描述（可选）
- 负责人（可选）

**不可编辑字段**：
- 数据集编码（只读，灰色背景）

## 🎯 操作流程

### 编辑数据集

```
1. 点击数据集卡片或点击"编辑"按钮
   ↓
2. 打开编辑模态框，加载数据集信息
   ↓
3. 修改名称、描述或负责人
   ↓
4. 点击"保存"按钮
   ↓
5. 调用API更新数据集
   ↓
6. 显示成功提示，关闭模态框
   ↓
7. 自动刷新数据集列表
```

### 删除数据集

```
1. 点击数据集卡片的"删除"按钮
   ↓
2. 弹出确认对话框："确定要删除数据集"{名称}"吗？此操作不可恢复！"
   ↓
3. 用户确认后调用API删除数据集
   ↓
4. 显示成功提示
   ↓
5. 自动刷新数据集列表
```

## 💻 技术实现

### 编辑功能JavaScript

```javascript
async function editDataset(datasetId) {
    event.stopPropagation();  // 阻止事件冒泡
    
    try {
        // 加载数据集信息
        const response = await fetch(`/api/datasets/${datasetId}`);
        const result = await response.json();
        
        if (result.code === 0) {
            const dataset = result.data;
            
            // 填充表单
            document.getElementById('editDatasetId').value = dataset.id;
            document.getElementById('editDatasetCode').value = dataset.dataset_code;
            document.getElementById('editDatasetName').value = dataset.dataset_name;
            document.getElementById('editDatasetDesc').value = dataset.description || '';
            document.getElementById('editDatasetOwner').value = dataset.owner || '';
            
            // 显示模态框
            document.getElementById('editModal').classList.add('show');
        }
    } catch (error) {
        showAlert('加载数据集失败: ' + error.message, 'error');
    }
}
```

### 保存功能JavaScript

```javascript
async function saveDataset() {
    const datasetId = document.getElementById('editDatasetId').value;
    const name = document.getElementById('editDatasetName').value.trim();
    const description = document.getElementById('editDatasetDesc').value.trim();
    const owner = document.getElementById('editDatasetOwner').value.trim();
    
    if (!name) {
        showAlert('请输入数据集名称', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/datasets/${datasetId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                dataset_name: name,
                description: description,
                owner: owner
            })
        });
        
        const result = await response.json();
        
        if (result.code === 0) {
            showAlert('保存成功！', 'success');
            closeEditModal();
            loadDatasets();
        } else {
            showAlert('保存失败: ' + result.message, 'error');
        }
    } catch (error) {
        showAlert('保存失败: ' + error.message, 'error');
    }
}
```

### 删除功能JavaScript

```javascript
async function deleteDataset(datasetId) {
    event.stopPropagation();  // 阻止事件冒泡
    
    const dataset = datasets.find(ds => ds.id === datasetId);
    if (!confirm(`确定要删除数据集"${dataset.dataset_name}"吗？此操作不可恢复！`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/datasets/${datasetId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.code === 0) {
            showAlert('删除成功！', 'success');
            loadDatasets();
        } else {
            showAlert('删除失败: ' + result.message, 'error');
        }
    } catch (error) {
        showAlert('删除失败: ' + error.message, 'error');
    }
}
```

### 事件冒泡处理

**问题**：卡片本身有点击事件，按钮也有点击事件，如何避免冲突？

**解决方案**：使用 `event.stopPropagation()` 阻止事件冒泡

```javascript
// 卡片点击 - 打开编辑模态框
<div class="dataset-card" onclick="editDataset(${ds.id})">

// 按钮区域 - 阻止冒泡
<div class="dataset-actions" onclick="event.stopPropagation()">

// 按钮点击 - 也阻止冒泡
async function editDataset(datasetId) {
    event.stopPropagation();
    // ...
}
```

## 🎨 UI设计

### 模态框样式

```css
.modal {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);  /* 半透明背景 */
    z-index: 1000;
    align-items: center;
    justify-content: center;
}

.modal.show {
    display: flex;  /* 显示时使用flex布局居中 */
}

.modal-content {
    background: white;
    border-radius: 12px;
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    overflow-y: auto;
}
```

### 按钮样式

| 按钮 | 颜色 | 用途 |
|------|------|------|
| 配置提取 | 蓝色 (#2563eb) | 主要操作 |
| 同步Schema | 灰色 (#f3f4f6) | 次要操作 |
| 编辑 | 灰色 (#f3f4f6) | 次要操作 |
| 删除 | 红色 (#fee2e2) | 危险操作 |

## 📊 数据集卡片完整结构

```html
<div class="dataset-card" onclick="editDataset(${ds.id})">
    <!-- 标题 -->
    <div class="dataset-title">${ds.dataset_name}</div>
    
    <!-- 编码 -->
    <div class="dataset-code">${ds.dataset_code}</div>
    
    <!-- 描述 -->
    <div class="dataset-desc">${ds.description || '暂无描述'}</div>
    
    <!-- 元数据统计 -->
    <div class="dataset-meta">
        <span>📊 ${ds.partition_fields.length} 个分区</span>
        <span>📈 ${ds.metric_fields.length} 个指标</span>
    </div>
    
    <!-- 操作按钮 -->
    <div class="dataset-actions" onclick="event.stopPropagation()">
        <button onclick="goToExtract(${ds.id})">配置提取</button>
        <button onclick="syncSchema(${ds.id})">同步Schema</button>
        <button onclick="editDataset(${ds.id})">编辑</button>
        <button onclick="deleteDataset(${ds.id})">删除</button>
    </div>
</div>
```

## 🔒 权限控制（预留）

当前所有用户都可以编辑和删除任何数据集。后续可以添加权限控制：

### 权限规则（待实现）

```javascript
// 检查是否有编辑权限
function canEditDataset(dataset) {
    const currentUser = getCurrentUser();
    
    // 规则1: 数据集负责人可以编辑
    if (dataset.owner === currentUser) {
        return true;
    }
    
    // 规则2: 管理员可以编辑所有数据集
    if (isAdmin(currentUser)) {
        return true;
    }
    
    return false;
}

// 根据权限显示/隐藏按钮
function renderDatasetCard(dataset) {
    const canEdit = canEditDataset(dataset);
    
    return `
        <div class="dataset-card">
            ...
            <div class="dataset-actions">
                ${canEdit ? `
                    <button onclick="editDataset(${dataset.id})">编辑</button>
                    <button onclick="deleteDataset(${dataset.id})">删除</button>
                ` : ''}
            </div>
        </div>
    `;
}
```

## ✅ 功能清单

- [x] 卡片点击编辑
- [x] 编辑按钮
- [x] 删除按钮
- [x] 编辑模态框
- [x] 表单验证
- [x] 保存功能
- [x] 删除确认
- [x] 成功提示
- [x] 自动刷新列表
- [x] 事件冒泡处理
- [ ] 权限控制（待实现）
- [ ] ESC键关闭模态框（可扩展）
- [ ] 点击背景关闭模态框（可扩展）

## 🚀 后续优化建议

### 1. 批量操作

```javascript
// 支持批量删除
function bulkDeleteDatasets(datasetIds) {
    // 实现批量删除逻辑
}
```

### 2. 搜索和筛选

```javascript
// 支持按名称、编码、负责人搜索
function searchDatasets(keyword) {
    // 实现搜索逻辑
}
```

### 3. 排序

```javascript
// 支持按创建时间、名称等排序
function sortDatasets(field, order) {
    // 实现排序逻辑
}
```

### 4. 分页

```javascript
// 当数据集很多时，使用分页加载
function loadDatasetsPage(page, pageSize) {
    // 实现分页逻辑
}
```

---

**修改文件**：`app/templates/datasets_list.html`  
**修改时间**：2025-12-22  
**修改人**：AI Assistant  
**状态**：✅ 已完成并验证

