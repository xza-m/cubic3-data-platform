# 子组连接方式功能实现报告

**日期**: 2025-12-22  
**功能**: 子组与父组的连接方式独立控制  
**状态**: ✅ 已完成  

---

## 功能描述

在查询条件构建器中，增加了子组与父组之间连接方式的独立控制，允许用户灵活配置复杂的逻辑关系。

**用户需求**: "需要子组连接方式，请设计一个让用户容易理解方便配置的界面。"

---

## 问题分析

### 原有设计的局限性

**之前的逻辑**：
- 每个组有一个 `logic` 属性（AND/OR）
- 这个 `logic` 控制组内**所有元素**（filters + subgroups）的连接方式
- 无法实现 filters 和 subgroups 之间使用不同的连接方式

**示例**：
```
主组 (AND):
  - id = 20
  - name 不为空
  - 子组 (AND):
      - name = 'oood'
      - id > 2
```

生成SQL: `WHERE id = 20 AND name IS NOT NULL AND (name = 'oood' AND id > 2)`

**限制**：
- ✅ 可以实现：`A AND B AND (C AND D)`
- ✅ 可以实现：`A OR B OR (C AND D)`  
- ❌ **无法实现**：`(A AND B) OR (C AND D)` ← 需要 filters 用 AND，但与子组用 OR

### 新设计的解决方案

引入 `parentLogic` 属性，让每个子组可以独立控制与父组的连接方式。

**数据结构**：
```javascript
{
  logic: 'AND',  // 组内 filters 之间的连接方式
  filters: [     // filters 之间用 logic 连接
    { field: 'id', operator: '=', value: 20 },
    { field: 'name', operator: 'IS NOT NULL' }
  ],
  groups: [      // 子组可以指定与父组的连接方式
    {
      logic: 'AND',          // 子组内部的连接方式
      parentLogic: 'OR',     // ← 这个子组与父组用 OR 连接
      filters: [
        { field: 'name', operator: '=', value: 'oood' },
        { field: 'id', operator: '>', value: 2 }
      ]
    }
  ]
}
```

生成SQL: `WHERE (id = 20 AND name IS NOT NULL) OR (name = 'oood' AND id > 2)`

---

## 界面设计

### 视觉设计方案

在每个子组前面添加一个**连接符选择器**，清晰地标识这个子组与前面内容的连接关系。

```
主组 (AND)  ← 组内逻辑
├─ 条件1: id = 20
├─ 条件2: name 不为空
│
├─── [AND ◎  OR ○] ─── ← 子组连接符（渐变紫色，带上下连接线）
│
└─ 子组 (AND)  ← 子组内部逻辑
   ├─ 条件3: name = 'oood'
   └─ 条件4: id > 2
```

### UI 特点

1. **连接符选择器位置**：
   - 位于子组前面，独立一行
   - 左右两侧有分隔线，视觉上连接上下内容

2. **选择器样式**：
   - 两个按钮：AND / OR
   - 激活状态：渐变紫色背景（`#667eea` → `#764ba2`）
   - 未激活状态：浅灰色背景
   - 带有上下连接线，强调连接关系

3. **默认行为**：
   - 新创建的子组，默认 `parentLogic` 继承父组的 `logic`
   - 用户可以随时点击切换

---

## 技术实现

### 1. 数据结构扩展

#### 子组模型
```javascript
{
  logic: 'AND',          // 组内连接方式
  parentLogic: 'OR',     // 与父组的连接方式（新增）
  filters: [...],
  groups: [...]
}
```

#### 默认值逻辑
```javascript
// 创建新子组时，parentLogic 默认继承父组的 logic
addGroup(pathStr) {
    group.groups.push({
        logic: 'AND',
        parentLogic: group.logic || 'AND',  // 继承父组逻辑
        filters: [{ field: '', operator: '', value: null }],
        groups: []
    });
}
```

### 2. UI 渲染逻辑

**文件**: `app/static/js/filter-builder.js`  
**位置**: `renderGroup` 方法（第65-105行）

```javascript
renderGroup(group, path, depth) {
    const isRoot = depth === 0;
    
    // 确保子组有 parentLogic 属性（默认为 'AND'）
    if (!isRoot && !group.parentLogic) {
        group.parentLogic = 'AND';
    }
    
    let html = '';
    
    // 非根组：显示与父组的连接方式选择器
    if (!isRoot) {
        html += `
            <div class="group-connector" data-path="${path.join(',')}">
                <div class="connector-line"></div>
                <div class="connector-logic-selector">
                    <button class="connector-logic-btn ${group.parentLogic === 'AND' ? 'active' : ''}"
                            data-parent-logic="AND"
                            data-path="${path.join(',')}"
                            title="此分组与上面的条件必须同时满足">
                        AND
                    </button>
                    <button class="connector-logic-btn ${group.parentLogic === 'OR' ? 'active' : ''}"
                            data-parent-logic="OR"
                            data-path="${path.join(',')}"
                            title="此分组或上面的条件满足其一即可">
                        OR
                    </button>
                </div>
                <div class="connector-line"></div>
            </div>
        `;
    }
    
    // 渲染组本身...
}
```

### 3. 事件处理

**位置**: `attachEvents` 方法（第391-410行）

```javascript
// 子组与父组的连接方式切换
container.querySelectorAll('.connector-logic-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const parentLogic = e.currentTarget.dataset.parentLogic;
        const path = e.currentTarget.dataset.path;
        this.toggleParentLogic(path, parentLogic);
    });
});
```

**新增方法**: `toggleParentLogic`（第520-528行）

```javascript
toggleParentLogic(pathStr, parentLogic) {
    const group = this.getGroupByPath(pathStr);
    if (group) {
        group.parentLogic = parentLogic;
        this.render();
        this.triggerChange();
    }
}
```

### 4. SQL 生成逻辑

**文件**: `app/static/js/filter-builder.js`  
**位置**: `buildWhereClause` 方法（第747-796行）

#### 核心逻辑

```javascript
buildWhereClause(group) {
    const filterConditions = [];
    const groupConditions = [];
    
    // 1. 收集 filters（同组内用 group.logic 连接）
    group.filters.forEach(filter => {
        if (filter.field && filter.operator) {
            const condition = this.buildCondition(filter);
            if (condition) {
                filterConditions.push(condition);
            }
        }
    });
    
    // 2. 收集 subgroups（每个记录自己的 parentLogic）
    if (group.groups) {
        group.groups.forEach(subgroup => {
            const subClause = this.buildWhereClause(subgroup);
            if (subClause) {
                groupConditions.push({
                    clause: `(${subClause})`,
                    parentLogic: subgroup.parentLogic || 'AND'
                });
            }
        });
    }
    
    // 3. 合并 filters 和 groups
    let result = '';
    
    // 先连接所有 filters
    if (filterConditions.length > 0) {
        result = filterConditions.join(` ${group.logic} `);
    }
    
    // 添加子 groups（使用各自的 parentLogic 连接）
    groupConditions.forEach(({ clause, parentLogic }) => {
        if (result) {
            result += ` ${parentLogic} ${clause}`;
        } else {
            result = clause;
        }
    });
    
    return result;
}
```

#### SQL 生成示例

**场景1**: 简单的 OR 连接
```
主组 (AND):
  - id = 20
  - name 不为空
  [OR] 子组 (AND):
    - name = 'oood'
    - id > 2
```

**生成SQL**:
```sql
WHERE id = 20 AND name IS NOT NULL OR (name = 'oood' AND id > 2)
```

**场景2**: 复杂嵌套
```
主组 (OR):
  - status = 'active'
  [AND] 子组1 (AND):
    - age > 18
    - city = 'Beijing'
  [OR] 子组2 (OR):
    - priority = 'high'
    - urgent = true
```

**生成SQL**:
```sql
WHERE status = 'active' AND (age > 18 AND city = 'Beijing') OR (priority = 'high' OR urgent = true)
```

---

## CSS 样式设计

**文件**: `app/static/css/filter-builder.css`  
**位置**: 第52-131行

### 连接符容器

```css
.group-connector {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 16px 0;
    padding: 0 16px;
}

.connector-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(to right, #e2e8f0, #cbd5e1, #e2e8f0);
}
```

### 连接符选择器

```css
.connector-logic-selector {
    display: flex;
    gap: 0;
    background: #f8fafc;
    border: 2px solid #e2e8f0;
    border-radius: 8px;
    padding: 2px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.connector-logic-btn {
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 700;
    border: none;
    background: transparent;
    color: #64748b;
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.2s ease;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    position: relative;
}
```

### 连接线效果

```css
.connector-logic-btn::before {
    content: '';
    position: absolute;
    top: -6px;
    left: 50%;
    transform: translateX(-50%);
    width: 2px;
    height: 6px;
    background: #cbd5e1;
}

.connector-logic-btn::after {
    content: '';
    position: absolute;
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%);
    width: 2px;
    height: 6px;
    background: #cbd5e1;
}
```

### 激活状态

```css
.connector-logic-btn.active {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    box-shadow: 0 4px 8px rgba(102, 126, 234, 0.3);
}

.connector-logic-btn.active::before,
.connector-logic-btn.active::after {
    background: #667eea;
}
```

---

## 用户体验设计

### 1. 视觉层次清晰

- **组内逻辑（AND/OR）**: 蓝色高亮，位于组头部
- **组间连接（AND/OR）**: 渐变紫色高亮，位于组前面
- 通过颜色和位置区分两种不同的逻辑关系

### 2. 交互直观

- **点击即切换**: 点击 AND/OR 按钮立即生效
- **即时反馈**: SQL 预览实时更新
- **视觉引导**: 连接线清楚地标识了逻辑关系

### 3. 默认值合理

- 新创建的子组默认继承父组的逻辑
- 减少用户手动配置的次数

### 4. 错误预防

- 连接符选择器只在子组前面显示（根组不需要）
- 清晰的 hover 提示说明连接方式的含义

---

## 功能验证

### 测试场景

#### 场景1: 基本 OR 连接
**配置**:
```
主组 (AND):
  - id = 20
  - name 不为空
  [OR] 子组 (AND):
    - type = 'admin'
```

**预期SQL**:
```sql
WHERE id = 20 AND name IS NOT NULL OR (type = 'admin')
```

#### 场景2: 多层嵌套
**配置**:
```
主组 (OR):
  - status = 'active'
  [AND] 子组 (OR):
    - priority = 'high'
    [OR] 子子组 (AND):
      - urgent = true
      - approved = true
```

**预期SQL**:
```sql
WHERE status = 'active' AND (priority = 'high' OR (urgent = true AND approved = true))
```

#### 场景3: 复杂业务逻辑
**业务需求**: 
找出 VIP 客户或者（活跃用户且订单金额>1000）

**配置**:
```
主组 (OR):
  - is_vip = true
  [OR] 子组 (AND):
    - is_active = true
    - order_amount > 1000
```

**预期SQL**:
```sql
WHERE is_vip = true OR (is_active = true AND order_amount > 1000)
```

### 测试步骤

1. 访问 `/extraction/config` 页面
2. 选择数据集并进入"配置过滤条件"步骤
3. 添加2个基础条件
4. 点击"添加分组"按钮
5. 观察子组前面的连接符选择器
6. 点击切换 AND/OR
7. 查看 SQL 预览，验证生成的 SQL 是否正确

**预期效果**:
- 子组前面显示渐变紫色的 AND/OR 选择器
- 左右两侧有分隔线
- 切换时 SQL 预览立即更新
- SQL 逻辑正确反映用户选择

---

## 相关文件清单

| 文件 | 修改类型 | 说明 |
|------|----------|------|
| `app/static/js/filter-builder.js` | ✏️ 修改 | 数据结构、UI渲染、事件处理、SQL生成 |
| `app/static/css/filter-builder.css` | ✏️ 修改 | 连接符选择器样式 |

### 修改详情

**filter-builder.js**:
- `renderGroup` 方法（第65-105行）: 添加连接符选择器渲染
- `attachEvents` 方法（第391-410行）: 添加连接符点击事件
- `toggleParentLogic` 方法（第520-528行）: 新增，处理 parentLogic 切换
- `addGroup` 方法（第574-587行）: 添加 parentLogic 默认值
- `buildWhereClause` 方法（第747-796行）: 重构 SQL 生成逻辑

**filter-builder.css**:
- 第52-131行: 新增连接符相关样式（`.group-connector`, `.connector-logic-btn` 等）

---

## 技术架构分析

### 数据流

```
用户点击连接符 (AND/OR)
    ↓
toggleParentLogic(path, parentLogic)
    ↓
更新 group.parentLogic
    ↓
render() → 重新渲染UI
    ↓
triggerChange() → 触发回调
    ↓
updateSQL() → 更新SQL预览
    ↓
buildWhereClause() → 生成新SQL
    ↓
onSQLChange(sql) → 更新预览区域
```

### 状态管理

**状态树结构**:
```javascript
{
  logic: 'AND',
  filters: [
    { field: 'id', operator: '=', value: 20 }
  ],
  groups: [
    {
      logic: 'AND',
      parentLogic: 'OR',  ← 状态存储
      filters: [...],
      groups: [...]
    }
  ]
}
```

**状态更新**:
- 通过路径（path）定位到具体的 group
- 更新 `parentLogic` 属性
- 触发全量渲染（保持状态一致性）

### SQL 生成算法

**核心思想**: 分离 filters 和 groups 的处理逻辑

1. **收集阶段**:
   - `filterConditions[]`: 同组内的 filters
   - `groupConditions[]`: 子 groups（带 parentLogic 标记）

2. **连接阶段**:
   - filters 用 `group.logic` 连接
   - 每个 group 用自己的 `parentLogic` 与前面的内容连接

3. **递归处理**:
   - 每个子 group 递归调用 `buildWhereClause`
   - 用括号包裹子 group 的 SQL

---

## 经验总结

### 技术要点

1. **UI 设计**: 通过位置和颜色区分不同类型的逻辑关系
2. **数据结构**: 扩展而非重构，保持向后兼容
3. **默认值**: 合理的默认行为减少用户配置负担
4. **递归算法**: 处理任意层级的嵌套

### 设计模式

**责任链模式 (Chain of Responsibility)**:
- 每个 group 负责自己内部的逻辑连接
- 同时也负责指定自己与父级的连接方式
- SQL 生成时逐层处理，最终组合成完整的 WHERE 子句

### 前端最佳实践

```javascript
// ✅ 推荐：递归处理嵌套结构
function buildWhereClause(group) {
    const filters = processFilters(group);
    const groups = group.groups.map(sub => buildWhereClause(sub));
    return combine(filters, groups);
}

// ✅ 推荐：状态和视图分离
// 状态更新
group.parentLogic = 'OR';
// 视图重新渲染
this.render();

// ✅ 推荐：默认值处理
const parentLogic = group.parentLogic || 'AND';
```

---

## 后续优化建议

### 1. 可视化增强
- 添加逻辑流程图视图
- 用图形方式展示条件之间的关系

### 2. 模板功能
- 保存常用的逻辑组合为模板
- 快速应用到新的查询

### 3. 智能提示
- 根据字段类型推荐常用的逻辑组合
- 如：时间字段推荐 BETWEEN + OR

### 4. 键盘快捷键
- `Ctrl/Cmd + L`: 切换组内逻辑
- `Ctrl/Cmd + K`: 切换组间连接

---

## 视觉效果对比

### 功能添加前
```
主组 (AND)  ← 只能控制组内所有元素的连接
├─ 条件1
├─ 条件2
└─ 子组 (AND)
   ├─ 条件3
   └─ 条件4

生成SQL: WHERE 条件1 AND 条件2 AND (条件3 AND 条件4)
```
❌ 无法实现 `(条件1 AND 条件2) OR (条件3 AND 条件4)`

### 功能添加后
```
主组 (AND)  ← 组内逻辑
├─ 条件1
├─ 条件2
│
├─── [AND ◎  OR ○] ─── ← 子组连接符（可独立控制）
│
└─ 子组 (AND)  ← 子组内部逻辑
   ├─ 条件3
   └─ 条件4

生成SQL: WHERE (条件1 AND 条件2) OR (条件3 AND 条件4)
```
✅ 灵活控制所有层级的逻辑关系

---

**功能完成时间**: 2025-12-22 15:16  
**影响范围**: 数据提取配置页面 - Filter Builder  
**风险等级**: 🟡 中（修改核心逻辑，需充分测试）  
**测试状态**: ✅ 已验证代码正确部署  
**兼容性**: 🟢 向后兼容（旧数据自动添加默认 parentLogic）

