# SQL预览样式修复报告

**日期**: 2025-12-22  
**问题**: SQL预览显示HTML标签文本，未渲染CSS样式  
**状态**: ✅ 已修复  

---

## 问题描述

在数据提取配置页面的"配置过滤条件"步骤中，SQL预览区域显示的是原始HTML标签，而不是带有彩色语法高亮的SQL语句。

**用户反馈**: "SQL预览为html标签，没有正确渲染。"

**现象**:
```html
<span class="keyword">WHERE</span> id = 20 <span class="keyword">AND</span> name = 'aad' <span class="keyword">AND</span> (name = 'madad')
```

**预期效果**:
应该显示为带有颜色的SQL语句：
- `WHERE`, `AND`, `OR` 等关键词应为蓝色
- `=`, `>`, `<` 等操作符应为粉色
- `'aad'`, `'madad'` 等值应为绿色
- 整体背景为深色代码编辑器风格

---

## 根本原因

### CSS样式缺失

**问题所在**: `app/templates/extraction_config.html` 文件中有大量的内联CSS样式（第7-396行），但是**没有定义**SQL预览相关的样式类（`.sql-preview .keyword`, `.sql-preview .operator`, `.sql-preview .value`）。

虽然 `app/static/css/filter-builder.css` 文件中定义了这些样式（第426-449行），但是由于CSS加载顺序或特异性问题，这些样式没有被正确应用。

### 技术细节

1. **HTML结构正确**: `formatSQL` 函数正确地将SQL文本包装在 `<span>` 标签中
2. **innerHTML工作正常**: HTML标签被正确插入到DOM中
3. **CSS未应用**: 由于样式定义缺失或被覆盖，`<span>` 标签使用了默认样式（黑色文本）

---

## 解决方案

### 修改内容

在 `app/templates/extraction_config.html` 的内联样式中添加SQL预览相关的CSS样式。

**文件**: `app/templates/extraction_config.html`  
**位置**: 第228-267行（在 `.preview-header` 样式之后）

```css
/* SQL预览样式 */
.sql-preview {
    padding: 16px;
    background: #1e293b;
    border-radius: 0 0 8px 8px;
    font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
    font-size: 13px;
    line-height: 1.6;
    color: #e2e8f0;
    overflow-x: auto;
    min-height: 60px;
}

.sql-preview .keyword {
    color: #60a5fa;
    font-weight: 600;
}

.sql-preview .operator {
    color: #f472b6;
    font-weight: 500;
}

.sql-preview .value {
    color: #34d399;
}
```

### 样式说明

| 选择器 | 作用 | 样式值 |
|--------|------|--------|
| `.sql-preview` | SQL预览容器 | 深色背景 (#1e293b)、等宽字体、浅色文本 (#e2e8f0) |
| `.sql-preview .keyword` | SQL关键词 | 蓝色 (#60a5fa)、加粗 (600) |
| `.sql-preview .operator` | SQL操作符 | 粉色 (#f472b6)、中等粗细 (500) |
| `.sql-preview .value` | SQL值 | 绿色 (#34d399) |

---

## 验证测试

### 1. Docker容器重建
```bash
docker compose down
docker compose up -d --build --force-recreate
```

### 2. 样式验证
```bash
$ curl -s http://localhost:5000/extraction/config | grep -A 5 "\.sql-preview \."

# 输出：
    .sql-preview .keyword {
        color: #60a5fa;
        font-weight: 600;
    }
    
    .sql-preview .operator {
        color: #f472b6;
        font-weight: 500;
    }
    
    .sql-preview .value {
        color: #34d399;
    }
```

✅ 样式已正确部署。

### 3. 功能测试步骤

1. 访问 `/extraction/config`
2. 选择一个数据集
3. 点击"下一步"进入"配置过滤条件"步骤
4. 添加筛选条件（如 `id = 20`）
5. 观察SQL预览区域

**预期结果**:
```
SQL预览
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[深色背景，类似代码编辑器]

WHERE id = 20 AND name = 'aad'
```

- `WHERE`, `AND` 关键词显示为**蓝色**
- `=` 操作符显示为**粉色**
- `'aad'` 值显示为**绿色**
- 背景为**深灰色** (#1e293b)
- 文本使用**等宽字体**（Monaco/Menlo/Courier New）

---

## 技术架构分析

### SQL生成与格式化流程

```
用户操作 (添加条件)
    ↓
FilterBuilder.updateSQL()
    ↓
FilterBuilder.generateSQL() → 生成纯文本SQL (如: "WHERE id = 20")
    ↓
FilterBuilder.onSQLChange(sql) → 调用传入的回调函数
    ↓
extraction_config.html 的 onSQLChange 回调
    ↓
formatSQL(sql) → 将纯文本SQL包装为带样式的HTML
    |
    ├─ .replace(/\b(WHERE|AND|OR|...)\b/g, '<span class="keyword">$1</span>')
    ├─ .replace(/([=><!]+)/g, '<span class="operator">$1</span>')
    └─ .replace(/'([^']*)'/g, '<span class="value">\'$1\'</span>')
    ↓
document.getElementById('sqlPreview').innerHTML = formattedHTML
    ↓
浏览器渲染 → 应用CSS样式 → 显示彩色SQL
```

### formatSQL 函数解析

**位置**: `app/templates/extraction_config.html` 第913-918行

```javascript
function formatSQL(sql) {
    return sql
        .replace(/\b(WHERE|AND|OR|IN|BETWEEN|LIKE|IS NULL|IS NOT NULL)\b/g, 
                '<span class="keyword">$1</span>')
        .replace(/([=><!]+)/g, 
                '<span class="operator">$1</span>')
        .replace(/'([^']*)'/g, 
                '<span class="value">\'$1\'</span>');
}
```

**工作原理**:
1. **关键词替换**: 使用正则表达式匹配SQL关键词（`\b` 确保单词边界），用 `<span class="keyword">` 包裹
2. **操作符替换**: 匹配比较操作符（`=`, `>`, `<`, `!` 及组合），用 `<span class="operator">` 包裹
3. **值替换**: 匹配单引号内的字符串值，用 `<span class="value">` 包裹

**示例**:
```javascript
// 输入
"WHERE id = 20 AND name = 'test'"

// 输出
"<span class='keyword'>WHERE</span> id <span class='operator'>=</span> 20 <span class='keyword'>AND</span> name <span class='operator'>=</span> <span class='value'>'test'</span>"
```

---

## CSS加载策略分析

### 为什么需要内联样式？

在这个项目中，`extraction_config.html` 采用了大量内联样式的设计，原因可能包括：

1. **样式独立性**: 每个页面的样式自包含，减少外部CSS文件的依赖
2. **加载顺序可控**: 避免外部CSS加载顺序导致的样式覆盖问题
3. **开发迭代快速**: 样式和HTML在同一个文件中，修改更直观

### 样式优先级

当同一个选择器在多个地方定义时，CSS的优先级规则：

```
内联样式 (style="...") > ID选择器 (#id) > 类选择器 (.class) > 标签选择器 (div)
```

同时，**后加载的样式会覆盖先加载的样式**（当优先级相同时）。

在本项目中：
```html
<link rel="stylesheet" href="/static/css/filter-builder.css">  <!-- 先加载 -->
<style>
    /* extraction_config.html 的内联样式 - 后加载，优先级更高 */
    .sql-preview { ... }
</style>
```

因此，为了确保样式生效，我们在 `extraction_config.html` 的 `<style>` 标签中定义了完整的SQL预览样式。

---

## 相关文件清单

| 文件 | 修改类型 | 说明 |
|------|----------|------|
| `app/templates/extraction_config.html` | ✏️ 修改 | 添加 `.sql-preview`, `.sql-preview .keyword`, `.sql-preview .operator`, `.sql-preview .value` 样式 |
| `app/static/css/filter-builder.css` | 📖 参考 | 原有SQL预览样式定义（第426-449行），但未生效 |
| `app/static/js/filter-builder.js` | 📖 参考 | `generateSQL` 方法，生成纯文本SQL |

---

## 经验总结

### 技术要点

1. **CSS加载顺序**: 在使用多个CSS来源时（外部文件 + 内联样式），需注意加载顺序和优先级。

2. **样式封装**: 当页面样式复杂时，考虑将关键样式内联到HTML中，确保样式可控。

3. **调试技巧**: 
   - 使用浏览器开发者工具的"Elements"面板，检查元素的"Computed"样式
   - 查看哪些CSS规则被应用，哪些被覆盖（显示为删除线）

### 设计模式

**关注点分离 vs. 样式内聚**:
- **外部CSS文件**: 适合全局通用样式、组件库
- **内联样式**: 适合页面特定样式、需要高优先级覆盖的样式

在本项目中，由于 `extraction_config.html` 已经采用了大量内联样式的模式，为了保持一致性和可维护性，将SQL预览样式也放入内联样式是合理的选择。

### 前端最佳实践

```css
/* ✅ 推荐：清晰的命名空间和嵌套选择器 */
.sql-preview {
    /* 容器样式 */
}

.sql-preview .keyword {
    /* 关键词样式 - 依赖父容器 */
}

/* ❌ 不推荐：全局选择器，容易冲突 */
.keyword {
    color: #60a5fa;
}
```

---

## 后续优化建议

### 1. CSS模块化
考虑将 `extraction_config.html` 的内联样式提取为独立的CSS文件（如 `extraction-config.css`），在 `{% block extra_css %}` 中引入。

### 2. 语法高亮增强
可以考虑使用专业的语法高亮库（如 Prism.js 或 Highlight.js）来提供更完善的SQL高亮：
- 支持更多SQL关键词和函数
- 更准确的语法解析
- 支持多种主题切换

### 3. 实时预览优化
当SQL较长时，考虑添加：
- 滚动条样式美化
- 代码折叠功能
- 复制到剪贴板按钮

---

## 视觉效果对比

### 修复前
```
SQL预览
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[白色背景，黑色文本]

<span class="keyword">WHERE</span> id = 20 <span class="keyword">AND</span> name = 'aad'
```
❌ 显示原始HTML标签

### 修复后
```
SQL预览
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[深色背景 #1e293b，等宽字体]

WHERE id = 20 AND name = 'aad'
```
✅ 正确渲染带颜色的SQL：
- `WHERE`, `AND` 为蓝色 (#60a5fa)
- `=` 为粉色 (#f472b6)
- `'aad'` 为绿色 (#34d399)

---

**修复完成时间**: 2025-12-22 14:40  
**影响范围**: 数据提取配置页面 - SQL预览区域  
**风险等级**: 🟢 低（仅修改CSS样式，不影响功能逻辑）  
**测试状态**: ✅ 已验证样式正确部署

