# SQL 查询模板问题修复

**修复时间**: 2026-01-25 10:20  
**问题**: SQL 查询模板点击后空白界面，使用后没有携带模板  
**状态**: ✅ 已修复

---

## 🐛 问题描述

用户反馈两个问题：
1. **点击模板后空白界面** - 页面跳转但没有内容
2. **模板 SQL 没有携带** - 编辑器中没有显示模板的 SQL 内容

---

## 🔍 问题分析

### 模板页面的实现

**Templates.tsx** (第 45-50 行):
```typescript
onSuccess: (data) => {
  message.success('模板已应用')
  // 跳转到编辑器并填充 SQL
  navigate(`/queries/editor`, {
    state: { sql: data.sql_query, name: data.template_name }
  })
}
```

**工作流程**:
1. 用户点击"使用模板"
2. 调用 API 获取填充后的 SQL
3. 使用 `navigate` 跳转到编辑器
4. 通过 `state` 传递 SQL 和模板名称

### 编辑器页面的问题

**Editor.tsx** 原代码:
- ❌ 没有导入 `useLocation`
- ❌ 没有接收 `location.state`
- ❌ 无法获取模板传递的 SQL

**结果**:
- 页面跳转成功，但编辑器显示默认的空 SQL
- 模板的 SQL 内容丢失

---

## ✅ 修复方案

### 1. 添加 useLocation 导入

**修改位置**: Editor.tsx 第 12 行

```typescript
// 修复前
import { useNavigate, useSearchParams } from 'react-router-dom'

// 修复后
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
```

### 2. 获取 location 对象

**修改位置**: Editor.tsx 第 51-54 行

```typescript
export default function QueryEditor() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const location = useLocation()  // 新增：获取 location
  const [searchParams] = useSearchParams()
  const queryId = searchParams.get('id')
  // ...
}
```

### 3. 处理模板传递的 state

**修改位置**: Editor.tsx 第 119-145 行

**修复后的代码**:
```typescript
// 加载已保存的查询或模板
useEffect(() => {
  // 优先处理模板传递的 SQL（从模板页面跳转过来）
  const templateState = location.state as { sql?: string; name?: string } | null
  if (templateState?.sql) {
    tabIdCounter++
    setTabs([{
      id: `tab-${tabIdCounter}`,
      name: templateState.name || '新查询',
      sql: templateState.sql,
      modified: true
    }])
    setActiveTabId(`tab-${tabIdCounter}`)
    message.success('模板已加载')
    // 清除 state 避免重复加载
    navigate(location.pathname, { replace: true, state: null })
    return
  }
  
  // 加载已保存的查询
  if (queryId) {
    getQuery(Number(queryId)).then(query => {
      setTabs([{
        id: 'tab-1',
        name: query.query_name,
        sql: query.sql_query,
        sourceId: query.source_id
      }])
      setSelectedSource(query.source_id)
    }).catch(() => {
      message.error('加载查询失败')
    })
  }
}, [queryId, location.state])
```

**关键改进**:
1. ✅ 检查 `location.state` 是否包含模板 SQL
2. ✅ 创建新 Tab 并填充模板 SQL
3. ✅ 设置 Tab 名称为模板名称
4. ✅ 标记为已修改（`modified: true`）
5. ✅ 显示成功提示
6. ✅ 清除 state 避免刷新页面时重复加载

---

## 📊 数据流程

### 修复前 ❌
```
模板页面
  ↓ navigate('/queries/editor', { state: { sql, name } })
编辑器页面
  ↓ ❌ 没有读取 location.state
  ↓ 显示默认空 SQL
❌ 模板内容丢失
```

### 修复后 ✅
```
模板页面
  ↓ navigate('/queries/editor', { state: { sql, name } })
编辑器页面
  ↓ ✅ useLocation() 获取 location
  ↓ ✅ 读取 location.state
  ↓ ✅ 创建新 Tab 填充 SQL
  ↓ ✅ 显示模板内容
✅ 用户可以编辑和运行
```

---

## 🔧 使用流程

### 1. 浏览模板
1. 访问查询中心
2. 点击"查询模板"
3. 浏览可用模板

### 2. 使用无参数模板
1. 点击模板卡片或"使用模板"按钮
2. 自动跳转到编辑器
3. SQL 已填充到编辑器中
4. 选择数据源后可直接运行

### 3. 使用带参数模板
1. 点击"使用模板"
2. 弹出参数配置对话框
3. 填写参数（日期、文本、下拉选择等）
4. 点击"使用"
5. 跳转到编辑器，SQL 已填充（参数已替换）
6. 选择数据源后可直接运行

---

## 📁 修改的文件

```
frontend/src/pages/QueryCenter/Editor.tsx  # 添加模板 state 处理
```

---

## ✅ 验证清单

- [x] 导入 useLocation
- [x] 获取 location 对象
- [x] 检查 location.state
- [x] 创建新 Tab 填充模板 SQL
- [x] 设置 Tab 名称
- [x] 显示成功提示
- [x] 清除 state 避免重复加载
- [x] 前端重新构建
- [x] 文件自动更新

---

## 🎯 测试步骤

### 1. 测试无参数模板
```
1. 访问 http://localhost:81/queries/templates
2. 点击任意无参数模板
3. 验证：
   ✅ 跳转到编辑器
   ✅ SQL 已填充
   ✅ Tab 名称为模板名称
   ✅ 显示"模板已加载"提示
```

### 2. 测试带参数模板
```
1. 访问 http://localhost:81/queries/templates
2. 点击带参数的模板
3. 填写参数
4. 点击"使用"
5. 验证：
   ✅ 跳转到编辑器
   ✅ SQL 已填充（参数已替换）
   ✅ Tab 名称为模板名称
   ✅ 显示"模板已加载"提示
```

### 3. 测试页面刷新
```
1. 使用模板后在编辑器页面
2. 刷新浏览器
3. 验证：
   ✅ 不会重复加载模板
   ✅ 显示默认空 SQL
```

---

## 🔄 与其他功能的兼容性

### 1. 加载已保存的查询
- ✅ 通过 `?id=1` 参数加载
- ✅ 不受模板功能影响

### 2. 多 Tab 功能
- ✅ 模板创建新 Tab
- ✅ 可以继续添加更多 Tab

### 3. 保存查询
- ✅ 模板加载后可以保存为新查询
- ✅ 标记为已修改（`modified: true`）

---

## 💡 技术细节

### React Router state 传递

**优点**:
- 不污染 URL
- 数据不会暴露在地址栏
- 支持复杂对象

**注意事项**:
- state 在页面刷新后丢失
- 需要手动清除避免重复处理
- 使用 `replace: true` 替换历史记录

### 依赖数组

```typescript
useEffect(() => {
  // ...
}, [queryId, location.state])
```

**说明**:
- 监听 `queryId` 变化（URL 参数）
- 监听 `location.state` 变化（路由 state）
- 任一变化都会重新执行

---

## 🎊 总结

**根本原因**: 
- 编辑器页面没有接收模板页面通过 `location.state` 传递的 SQL

**修复方法**:
- 添加 `useLocation` 获取路由 state
- 在 `useEffect` 中检查并处理模板 SQL
- 创建新 Tab 填充模板内容

**预期效果**:
- 点击模板后正常跳转到编辑器
- SQL 内容正确填充
- 用户可以立即编辑和运行

---

**修复人**: AI Assistant  
**完成时间**: 2026-01-25 10:20  
**状态**: ✅ 已完成并验证
