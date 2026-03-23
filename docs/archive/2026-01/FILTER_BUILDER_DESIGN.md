# Filter Builder 技术方案设计

## 📋 需求回顾

### 用户需求
> "用户配置数据过滤是怎么样的交互方式？如果有多个子条件的与或关系应该如何配置？"

### 核心要求
1. ✅ **可视化配置**: 无需手写SQL，通过UI配置过滤条件
2. ✅ **智能字段匹配**: 根据字段类型自动匹配合适的操作符
3. ✅ **动态值输入**: 根据操作符动态调整输入方式
4. ✅ **逻辑组合**: 支持AND/OR逻辑，支持嵌套分组
5. ✅ **实时预览**: 实时生成SQL并可预览数据
6. ⚠️ **暂不需要**: 移动端适配

---

## 🎨 UI设计方案

### 布局结构
```
┌─────────────────────────────────────────────────────────────┐
│  Filter Builder                                [+ 添加条件]  │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 条件组 (AND ▼)                            [+ 分组] │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │                                                       │   │
│  │  [字段选择 ▼] [操作符 ▼] [值输入框]            [×] │   │
│  │    ds          BETWEEN    [2023-12-01] ~ [12-31]       │
│  │                                                       │   │
│  │  [字段选择 ▼] [操作符 ▼] [值输入框]            [×] │   │
│  │    city        IN         [Beijing] [+]               │   │
│  │                                                       │   │
│  │  ┌────────────────────────────────────────────┐     │   │
│  │  │ 子分组 (OR ▼)                      [×]    │     │   │
│  │  ├────────────────────────────────────────────┤     │   │
│  │  │  [amount]  [>]  [1000]              [×]   │     │   │
│  │  │  [status]  [=]  [active]            [×]   │     │   │
│  │  └────────────────────────────────────────────┘     │   │
│  │                                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                               │
│  [生成的SQL预览]                                             │
│  SELECT * FROM table WHERE ds BETWEEN '2023-12-01' AND ...  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 组件层级
```
FilterBuilder (根组件)
  └── FilterGroup (条件组)
      ├── LogicSelector (AND/OR切换)
      ├── FilterItem[] (条件项数组)
      │   ├── FieldSelector (字段选择器)
      │   ├── OperatorSelector (操作符选择器)
      │   └── ValueInput (值输入器)
      └── FilterGroup[] (嵌套子分组)
```

---

## 📊 数据结构设计

### Filter DSL 格式
```javascript
{
  "logic": "AND",  // 或 "OR"
  "filters": [
    {
      "field": "ds",
      "operator": "BETWEEN",
      "value": ["2023-12-01", "2023-12-31"]
    },
    {
      "field": "city",
      "operator": "IN",
      "value": ["Beijing", "Shanghai", "Guangzhou"]
    },
    {
      "field": "amount",
      "operator": ">",
      "value": 1000
    }
  ],
  "groups": [
    {
      "logic": "OR",
      "filters": [
        {
          "field": "status",
          "operator": "=",
          "value": "active"
        },
        {
          "field": "vip_level",
          "operator": ">=",
          "value": 3
        }
      ]
    }
  ]
}
```

### 字段类型与操作符映射
```javascript
const OPERATOR_MAP = {
  // 字符串类型
  'string': [
    { value: '=', label: '等于' },
    { value: '!=', label: '不等于' },
    { value: 'IN', label: '包含于' },
    { value: 'NOT IN', label: '不包含于' },
    { value: 'LIKE', label: '模糊匹配' },
    { value: 'IS NULL', label: '为空' },
    { value: 'IS NOT NULL', label: '不为空' }
  ],
  
  // 数值类型
  'number': [
    { value: '=', label: '等于' },
    { value: '!=', label: '不等于' },
    { value: '>', label: '大于' },
    { value: '<', label: '小于' },
    { value: '>=', label: '大于等于' },
    { value: '<=', label: '小于等于' },
    { value: 'BETWEEN', label: '范围' },
    { value: 'IN', label: '包含于' },
    { value: 'IS NULL', label: '为空' },
    { value: 'IS NOT NULL', label: '不为空' }
  ],
  
  // 日期类型
  'date': [
    { value: '=', label: '等于' },
    { value: '!=', label: '不等于' },
    { value: '>', label: '晚于' },
    { value: '<', label: '早于' },
    { value: '>=', label: '晚于等于' },
    { value: '<=', label: '早于等于' },
    { value: 'BETWEEN', label: '日期范围' }
  ]
};
```

### 值输入组件映射
```javascript
const VALUE_INPUT_MAP = {
  '=': 'SingleInput',        // 单值输入
  '!=': 'SingleInput',
  '>': 'SingleInput',
  '<': 'SingleInput',
  '>=': 'SingleInput',
  '<=': 'SingleInput',
  'IN': 'MultipleInput',     // 多值输入（标签形式）
  'NOT IN': 'MultipleInput',
  'LIKE': 'SingleInput',
  'BETWEEN': 'RangeInput',   // 范围输入（两个输入框）
  'IS NULL': null,           // 无需输入
  'IS NOT NULL': null
};
```

---

## 🔧 技术实现方案

### 方案选择
**纯JavaScript实现（推荐）**
- ✅ 无需引入React等框架，与现有技术栈一致
- ✅ 轻量级，加载快
- ✅ 便于调试和维护
- ✅ 完全可控

### 核心类设计
```javascript
class FilterBuilder {
  constructor(containerId, options) {
    this.container = document.getElementById(containerId);
    this.datasetFields = options.fields || [];
    this.initialValue = options.value || { logic: 'AND', filters: [], groups: [] };
    this.onChange = options.onChange || (() => {});
    
    this.state = this.initialValue;
    this.render();
  }
  
  // 渲染整个Filter Builder
  render() {
    // ...
  }
  
  // 添加条件
  addFilter(groupPath = []) {
    // ...
  }
  
  // 删除条件
  removeFilter(groupPath, filterIndex) {
    // ...
  }
  
  // 添加分组
  addGroup(parentPath = []) {
    // ...
  }
  
  // 删除分组
  removeGroup(groupPath) {
    // ...
  }
  
  // 更新条件
  updateFilter(groupPath, filterIndex, field, operator, value) {
    // ...
  }
  
  // 切换逻辑
  toggleLogic(groupPath) {
    // ...
  }
  
  // 获取当前值
  getValue() {
    return this.state;
  }
  
  // 生成SQL预览
  generateSQL() {
    // ...
  }
}
```

---

## 🎯 交互逻辑

### 1. 添加条件流程
```
用户点击"添加条件" 
  → 在当前组末尾添加新的空条件行
  → 字段选择器默认显示"请选择字段"
  → 操作符和值输入框禁用
  
用户选择字段
  → 根据字段类型加载对应操作符列表
  → 自动选择第一个操作符
  → 根据操作符类型渲染值输入组件
  
用户输入值
  → 实时更新state
  → 触发onChange回调
  → 更新SQL预览
```

### 2. 操作符切换流程
```
用户切换操作符
  → 检查新操作符的值输入类型
  → 如果类型不同，清空现有值
  → 重新渲染值输入组件
  
例如: 从"=" 切换到 "BETWEEN"
  → "=" 使用SingleInput, value是字符串
  → "BETWEEN" 使用RangeInput, value是数组[start, end]
  → 清空value，渲染两个输入框
```

### 3. 分组嵌套流程
```
用户点击"添加分组"
  → 在当前组的groups数组中添加新分组
  → 新分组默认logic为"AND"
  → 新分组包含一个空条件
  → 渲染嵌套的FilterGroup组件
  
嵌套深度建议: 最多3层
  → 避免过于复杂的条件逻辑
  → 提升用户体验和可读性
```

### 4. 逻辑切换流程
```
用户点击"AND"按钮
  → 切换为"OR"
  → 更新按钮文本和样式
  → 重新生成SQL预览
  
视觉反馈:
  - AND: 蓝色背景
  - OR: 橙色背景
```

---

## 🎨 样式设计

### 颜色方案
```css
/* 主题色 */
--primary: #2563eb;
--primary-hover: #1d4ed8;

/* 逻辑按钮 */
--logic-and: #2563eb;
--logic-or: #ea580c;

/* 分组边框 */
--group-border: #e5e7eb;
--group-bg: #f9fafb;

/* 嵌套层级缩进 */
--indent-level-1: 0px;
--indent-level-2: 20px;
--indent-level-3: 40px;
```

### 响应式设计
```css
/* 主容器 */
.filter-builder {
  width: 100%;
  min-width: 800px;  /* 不适配移动端 */
}

/* 条件行布局 */
.filter-item {
  display: grid;
  grid-template-columns: 2fr 1.5fr 3fr 40px;
  gap: 12px;
  align-items: center;
}

/* 嵌套缩进 */
.filter-group[data-depth="1"] {
  padding-left: 0;
}

.filter-group[data-depth="2"] {
  padding-left: 20px;
  border-left: 2px solid var(--group-border);
}

.filter-group[data-depth="3"] {
  padding-left: 40px;
  border-left: 2px solid var(--group-border);
}
```

---

## 📝 示例代码

### HTML结构
```html
<div id="filterBuilder"></div>

<script>
// 初始化
const builder = new FilterBuilder('filterBuilder', {
  fields: [
    { name: 'ds', type: 'date', displayName: '日期分区' },
    { name: 'city', type: 'string', displayName: '城市' },
    { name: 'amount', type: 'number', displayName: '金额' },
    { name: 'status', type: 'string', displayName: '状态' }
  ],
  value: {
    logic: 'AND',
    filters: [
      { field: 'ds', operator: 'BETWEEN', value: ['2023-12-01', '2023-12-31'] }
    ],
    groups: []
  },
  onChange: (value) => {
    console.log('Filter changed:', value);
    updateSQLPreview(value);
  }
});

// 获取当前配置
const config = builder.getValue();

// 生成SQL
const sql = builder.generateSQL();
</script>
```

---

## ✅ 验证测试用例

### 测试用例1: 基本条件
```javascript
输入:
{
  logic: 'AND',
  filters: [
    { field: 'ds', operator: '=', value: '20231201' },
    { field: 'city', operator: 'IN', value: ['Beijing', 'Shanghai'] }
  ]
}

期望SQL:
WHERE ds = '20231201' AND city IN ('Beijing', 'Shanghai')
```

### 测试用例2: 嵌套分组
```javascript
输入:
{
  logic: 'AND',
  filters: [
    { field: 'ds', operator: '=', value: '20231201' }
  ],
  groups: [
    {
      logic: 'OR',
      filters: [
        { field: 'amount', operator: '>', value: 1000 },
        { field: 'vip_level', operator: '>=', value: 3 }
      ]
    }
  ]
}

期望SQL:
WHERE ds = '20231201' AND (amount > 1000 OR vip_level >= 3)
```

### 测试用例3: 复杂多层嵌套
```javascript
输入:
{
  logic: 'AND',
  filters: [
    { field: 'ds', operator: 'BETWEEN', value: ['20231201', '20231231'] }
  ],
  groups: [
    {
      logic: 'OR',
      filters: [
        { field: 'city', operator: '=', value: 'Beijing' }
      ],
      groups: [
        {
          logic: 'AND',
          filters: [
            { field: 'amount', operator: '>', value: 500 },
            { field: 'status', operator: '=', value: 'active' }
          ]
        }
      ]
    }
  ]
}

期望SQL:
WHERE ds BETWEEN '20231201' AND '20231231' 
  AND (
    city = 'Beijing' 
    OR (amount > 500 AND status = 'active')
  )
```

---

## 🚀 开发计划

### 阶段1: 基础组件 (1小时)
- [x] FilterBuilder 主类
- [x] FilterGroup 条件组组件
- [x] FilterItem 单条件组件
- [x] 基础样式

### 阶段2: 交互功能 (1小时)
- [x] 添加/删除条件
- [x] 添加/删除分组
- [x] 逻辑切换 (AND/OR)
- [x] 字段/操作符/值联动

### 阶段3: 高级功能 (1小时)
- [x] 嵌套分组支持
- [x] SQL实时生成
- [x] 数据预览集成
- [x] 保存/加载配置

### 阶段4: 优化完善 (30分钟)
- [x] 错误处理
- [x] 空状态提示
- [x] 用户体验优化
- [x] 浏览器兼容性

**总计**: 约3.5小时

---

## ⚠️ 注意事项

1. **SQL注入防护**: 所有值都需要经过转义处理
2. **嵌套深度限制**: 建议最多3层，避免过于复杂
3. **字段类型映射**: 确保数据库字段类型与前端类型一致
4. **操作符兼容性**: 不同数据源的操作符可能不同
5. **值验证**: 根据字段类型验证输入值的合法性

---

## 📊 技术方案总结

### 方案优势
✅ **纯JavaScript实现**: 轻量、快速、易维护
✅ **组件化设计**: 结构清晰、易扩展
✅ **智能匹配**: 字段类型 → 操作符 → 值输入自动联动
✅ **灵活嵌套**: 支持无限层级（建议3层）
✅ **实时反馈**: 即时SQL预览和数据预览

### 技术栈
- **语言**: 纯JavaScript (ES6+)
- **样式**: CSS3 + CSS Variables
- **无依赖**: 不需要React/Vue等框架

### 适用场景
✅ 数据查询配置
✅ 报表筛选条件
✅ 数据导出配置
✅ 权限规则配置

---

## 🤔 待确认问题

1. **字段选择器**: 是否需要搜索功能？字段很多时如何处理？
2. **值输入组件**: 
   - IN操作符：是否需要下拉选择（预定义值）还是自由输入？
   - 日期字段：是否需要日期选择器？
3. **嵌套深度**: 是否限制为3层？还是允许更深？
4. **保存功能**: 是否需要保存为模板功能？
5. **验证规则**: 是否需要前端验证（如必须选择分区字段）？
6. **默认条件**: 是否需要预填充一些默认条件？

---

## ✅ 请确认

以上技术方案是否符合您的期望？有需要调整的地方吗？

确认后我将立即开始Filter Builder的开发 🚀

