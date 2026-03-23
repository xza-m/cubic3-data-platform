# SQL格式化正则表达式修复报告

**日期**: 2025-12-22  
**问题**: SQL预览中HTML标签被破坏，显示为纯文本  
**状态**: ✅ 已修复  

---

## 问题描述

在数据提取配置页面的"配置过滤条件"步骤中，SQL预览区域显示的HTML标签被破坏，导致样式无法正确渲染。

**用户反馈**: "还是有标签"（指HTML标签作为纯文本显示）

**现象**:
```html
<span class="operator"><</span>span class<span class="operator">=</span>"keyword"<span class="operator">></span>WHERE<span class="operator"><</span>/span<span class="operator">></span> is_active <span class="operator">=</span> <span class="value">'1'</span>
```

**预期效果**:
```html
<span class="keyword">WHERE</span> is_active <span class="operator">=</span> <span class="value">'1'</span> <span class="keyword">AND</span> type_code <span class="operator">=</span> <span class="value">'23'</span>
```

---

## 根本原因

### 问题定位过程

通过添加调试日志，发现了问题的根源：

**控制台日志输出**:
```
formatSQL输入: WHERE is_active = '1' AND type_code = '23'
formatSQL输入类型: string
formatSQL输入中是否包含<span: false
formatSQL输出: <span class="operator"><</span>span class<span class="operator">=</span>"keyword"<span class="operator">></span>WHERE<span class="operator"><</span>/span<span class="operator">></span>...
```

### 关键发现

**原有代码** (`app/templates/extraction_config.html`):
```javascript
function formatSQL(sql) {
    return sql
        .replace(/\b(WHERE|AND|OR|IN|BETWEEN|LIKE|IS NULL|IS NOT NULL)\b/g, '<span class="keyword">$1</span>')
        .replace(/([=><!]+)/g, '<span class="operator">$1</span>')
        .replace(/'([^']*)'/g, '<span class="value">\'$1\'</span>');
}
```

**问题分析**:

执行步骤：
1. **第一次替换（关键词）**: `WHERE` → `<span class="keyword">WHERE</span>` ✓
2. **第二次替换（操作符）**: `.replace(/([=><!]+)/g, ...)` 匹配所有 `=`, `>`, `<`, `!` 字符
   - 匹配到 `<span` 中的 `<` → `<span class="operator"><</span>span`
   - 匹配到 `class="keyword"` 中的 `=` → `class<span class="operator">=</span>"keyword"`
   - 匹配到 `</span>` 中的 `<` 和 `>` → 全部被破坏！

### 根本原因

**正则表达式的执行顺序错误**：
- 先用 `<span>` 标签包裹关键词
- 再用正则匹配操作符时，连 `<span>` 标签中的 `<`, `>`, `=` 也被匹配并替换

这导致HTML标签结构被彻底破坏。

---

## 解决方案

### 核心思路

使用**占位符保护策略**：
1. 先用占位符保护字符串值（如 `'1'`, `'23'`）
2. 然后替换操作符（此时不会影响占位符）
3. 再替换关键词
4. 最后恢复字符串值并用 `<span>` 包裹

### 修复后的代码

**文件**: `app/templates/extraction_config.html`  
**位置**: 第1306-1333行

```javascript
function formatSQL(sql) {
    // 如果SQL已经包含HTML标签，直接返回（避免重复格式化）
    if (sql.includes('<span')) {
        return sql;
    }
    
    // 关键：调整替换顺序，避免操作符替换破坏HTML标签
    // 1. 先替换字符串值（用临时占位符保护）
    const stringPlaceholders = [];
    let formatted = sql.replace(/'([^']*)'/g, (match, content) => {
        const placeholder = `__STRING_${stringPlaceholders.length}__`;
        stringPlaceholders.push(content);
        return placeholder;
    });
    
    // 2. 替换操作符（此时字符串已被占位符保护）
    formatted = formatted.replace(/([=><!]+)/g, '<span class="operator">$1</span>');
    
    // 3. 替换关键词
    formatted = formatted.replace(/\b(WHERE|AND|OR|IN|BETWEEN|LIKE|IS NULL|IS NOT NULL)\b/g, '<span class="keyword">$1</span>');
    
    // 4. 恢复字符串值（用span包裹）
    stringPlaceholders.forEach((content, index) => {
        const placeholder = `__STRING_${index}__`;
        formatted = formatted.replace(placeholder, `<span class="value">'${content}'</span>`);
    });
    
    return formatted;
}
```

### 执行流程示例

**输入**: `WHERE is_active = '1' AND type_code = '23'`

**步骤1 - 保护字符串**:
```
WHERE is_active = __STRING_0__ AND type_code = __STRING_1__
stringPlaceholders = ['1', '23']
```

**步骤2 - 替换操作符**:
```
WHERE is_active <span class="operator">=</span> __STRING_0__ AND type_code <span class="operator">=</span> __STRING_1__
```

**步骤3 - 替换关键词**:
```
<span class="keyword">WHERE</span> is_active <span class="operator">=</span> __STRING_0__ <span class="keyword">AND</span> type_code <span class="operator">=</span> __STRING_1__
```

**步骤4 - 恢复字符串**:
```
<span class="keyword">WHERE</span> is_active <span class="operator">=</span> <span class="value">'1'</span> <span class="keyword">AND</span> type_code <span class="operator">=</span> <span class="value">'23'</span>
```

✅ 完美！HTML标签结构完整，不会被破坏。

---

## 技术分析

### 问题的本质

这是一个典型的**正则表达式替换顺序问题**：
- 第一次替换生成的文本会成为第二次替换的输入
- 如果不小心处理，第二次替换会破坏第一次生成的内容

### 为什么会被破坏？

**正则表达式 `/([=><!]+)/g`** 的特点：
- 全局匹配（`g` flag）
- 匹配任何 `=`, `>`, `<`, `!` 字符
- **不区分上下文**：无法区分这些字符是在SQL中还是在HTML标签中

### 解决方案的优势

**占位符保护策略**:
```
原始文本 → 占位符保护 → 安全替换 → 恢复占位符
```

**优点**:
1. **安全性高**: 被保护的内容不会被后续替换影响
2. **可扩展性好**: 可以保护多种类型的内容
3. **易于理解**: 流程清晰，逻辑直观
4. **不依赖复杂正则**: 无需编写复杂的负向预查（negative lookahead）

### 其他可能的解决方案

#### 方案1: 使用负向预查（不推荐）
```javascript
.replace(/([=><!]+)(?![^<]*>)/g, '<span class="operator">$1</span>')
```
- **优点**: 一次性替换
- **缺点**: 正则复杂，难以维护，容易出错

#### 方案2: 使用DOM解析（过度工程）
```javascript
const parser = new DOMParser();
const doc = parser.parseFromString(sql, 'text/html');
// 遍历文本节点，只替换纯文本...
```
- **优点**: 理论上最安全
- **缺点**: 性能开销大，实现复杂

#### 方案3: 占位符保护（✅ 采用）
```javascript
// 先保护特殊内容 → 安全替换 → 恢复内容
```
- **优点**: 简单、高效、易维护
- **缺点**: 需要确保占位符不会与SQL内容冲突

---

## 验证测试

### 测试用例

#### 用例1: 简单条件
**输入**: `WHERE id = 10`  
**输出**: `<span class="keyword">WHERE</span> id <span class="operator">=</span> 10`  
**结果**: ✅ 通过

#### 用例2: 多个条件
**输入**: `WHERE is_active = '1' AND type_code = '23'`  
**输出**: `<span class="keyword">WHERE</span> is_active <span class="operator">=</span> <span class="value">'1'</span> <span class="keyword">AND</span> type_code <span class="operator">=</span> <span class="value">'23'</span>`  
**结果**: ✅ 通过

#### 用例3: 包含操作符的字符串
**输入**: `WHERE message = 'Error: x < y'`  
**输出**: `<span class="keyword">WHERE</span> message <span class="operator">=</span> <span class="value">'Error: x < y'</span>`  
**结果**: ✅ 通过（字符串内的 `<` 被占位符保护）

#### 用例4: IN操作符
**输入**: `WHERE status IN ('active', 'pending')`  
**输出**: `<span class="keyword">WHERE</span> status <span class="keyword">IN</span> (<span class="value">'active'</span>, <span class="value">'pending'</span>)`  
**结果**: ✅ 通过

#### 用例5: BETWEEN操作符
**输入**: `WHERE age BETWEEN 18 AND 65`  
**输出**: `<span class="keyword">WHERE</span> age <span class="keyword">BETWEEN</span> 18 <span class="keyword">AND</span> 65`  
**结果**: ✅ 通过

#### 用例6: 嵌套条件
**输入**: `WHERE (id > 10 AND status = 'active') OR (priority = 'high')`  
**输出**: `<span class="keyword">WHERE</span> (id <span class="operator">></span> 10 <span class="keyword">AND</span> status <span class="operator">=</span> <span class="value">'active'</span>) <span class="keyword">OR</span> (priority <span class="operator">=</span> <span class="value">'high'</span>)`  
**结果**: ✅ 通过

### 功能测试步骤

1. 访问 `/extraction/config` 页面
2. 选择一个数据集
3. 进入"配置过滤条件"步骤
4. 添加多个筛选条件（如 `is_active = '1' AND type_code = '23'`）
5. 观察SQL预览区域

**预期结果**:
```
SQL预览
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[深色背景 #1e293b]

WHERE is_active = '1' AND type_code = '23'
```

- `WHERE`, `AND` 显示为**蓝色**（#60a5fa）
- `=` 显示为**粉色**（#f472b6）
- `'1'`, `'23'` 显示为**绿色**（#34d399）
- 无任何HTML标签显示为纯文本

---

## 相关文件清单

| 文件 | 修改类型 | 说明 |
|------|----------|------|
| `app/templates/extraction_config.html` | ✏️ 修改 | 重构 `formatSQL` 函数，采用占位符保护策略 |

### 修改详情

**formatSQL函数** (第1306-1333行):
- 删除：原有的简单三步替换逻辑
- 新增：占位符保护机制（4步安全替换流程）
- 删除：调试用的 `console.log` 语句

---

## 经验总结

### 技术要点

1. **正则表达式的执行顺序很重要**: 后续替换可能破坏前面生成的内容
2. **占位符是一种有效的保护机制**: 临时替换需要保护的内容，替换完成后再恢复
3. **测试边界情况**: 如字符串内包含特殊字符（`<`, `>`, `=`等）的情况
4. **调试技巧**: 使用 `console.log` 查看每一步的输入输出

### 设计模式

**保护-操作-恢复模式 (Protect-Operate-Restore)**:
```
1. Protect: 用占位符保护敏感内容
2. Operate: 安全地执行替换操作
3. Restore: 恢复被保护的内容
```

这种模式在处理嵌套替换、多步转换时非常有用。

### 正则表达式最佳实践

```javascript
// ❌ 不推荐：简单粗暴的全局替换
text.replace(/</, '&lt;').replace(/>/, '&gt;');

// ✅ 推荐：使用占位符保护特殊内容
const protected = text.replace(/special/g, '__PLACEHOLDER__');
const processed = protected.replace(/other/g, 'REPLACEMENT');
const final = processed.replace(/__PLACEHOLDER__/g, 'special');

// ✅ 推荐：使用回调函数进行复杂处理
text.replace(/pattern/g, (match, ...groups) => {
    // 自定义处理逻辑
    return transformedMatch;
});
```

---

## 后续优化建议

### 1. 性能优化
当SQL非常长时，可以考虑：
- 缓存格式化结果
- 使用虚拟滚动（Virtual Scrolling）

### 2. 功能增强
扩展语法高亮支持：
- SQL函数（如 `COUNT`, `SUM`, `AVG`）
- 数据类型（如 `INT`, `VARCHAR`）
- 注释（`-- comment` 或 `/* comment */`）

### 3. 测试覆盖
添加单元测试：
```javascript
describe('formatSQL', () => {
    it('should format simple WHERE clause', () => {
        const input = 'WHERE id = 10';
        const output = formatSQL(input);
        expect(output).toContain('<span class="keyword">WHERE</span>');
    });
    
    it('should protect strings with operators', () => {
        const input = "WHERE msg = 'x < y'";
        const output = formatSQL(input);
        expect(output).not.toContain('<span class="operator"><</span>span');
    });
});
```

---

## 视觉效果对比

### 修复前
```html
<!-- HTML标签被破坏 -->
<span class="operator"><</span>span class<span class="operator">=</span>"keyword"<span class="operator">></span>WHERE<span class="operator"><</span>/span<span class="operator">></span> is_active <span class="operator">=</span> <span class="value">'1'</span>
```
❌ 显示为带有破碎HTML标签的纯文本，无样式

### 修复后
```html
<!-- HTML标签完整 -->
<span class="keyword">WHERE</span> is_active <span class="operator">=</span> <span class="value">'1'</span> <span class="keyword">AND</span> type_code <span class="operator">=</span> <span class="value">'23'</span>
```
✅ 正确渲染为带颜色的SQL语句：
- `WHERE`, `AND` 为蓝色
- `=` 为粉色
- `'1'`, `'23'` 为绿色

---

## 调试技巧总结

### 1. 逐步输出
在每个替换步骤后添加 `console.log`，观察中间结果：
```javascript
let result = step1(input);
console.log('After step1:', result);
result = step2(result);
console.log('After step2:', result);
```

### 2. 检查类型
确认变量类型和内容：
```javascript
console.log('Type:', typeof value);
console.log('Contains HTML:', value.includes('<'));
```

### 3. DOM检查
对于innerHTML问题，检查实际的DOM内容：
```javascript
element.innerHTML = value;
console.log('Actual innerHTML:', element.innerHTML);
console.log('Visual text:', element.textContent);
```

---

**修复完成时间**: 2025-12-22 15:07  
**影响范围**: 数据提取配置页面 - SQL预览格式化  
**风险等级**: 🟢 低（仅修改格式化逻辑，不影响功能）  
**测试状态**: ✅ 已验证修复有效  
**性能影响**: 🟢 无（占位符策略性能开销极小）

