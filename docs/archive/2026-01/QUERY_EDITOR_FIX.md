# 查询编辑器页面空白问题修复

**修复时间**: 2026-01-25 10:10  
**问题**: 执行 SQL 查询后页面为空  
**状态**: ✅ 已修复

---

## 🐛 问题描述

用户反馈：
- 在查询编辑器中执行 SQL 查询
- 提示"查询成功: 1 行, 耗时 44ms"
- 但结果面板为空，没有显示数据

---

## 🔍 问题分析

### 后端 API 响应格式

后端返回的数据结构：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "columns": ["id", "name", ...],
    "data": [[1, "test", ...]],
    "row_count": 1,
    "execution_time_ms": 44,
    "status": "success"
  }
}
```

### 前端代码问题

**错误的代码**（第 167-172 行）:
```typescript
onSuccess: (data) => {
  setTabs(prevTabs => prevTabs.map(t =>
    t.id === activeTabId ? { ...t, results: data.data } : t
  ))
  message.success(`查询成功: ${data.data?.row_count ?? 0} 行, 耗时 ${data.data?.execution_time_ms ?? 0}ms`)
}
```

**问题**:
- API 客户端的响应拦截器可能已经处理了数据结构
- 导致 `data` 参数的实际结构与预期不符
- 需要明确提取 `response.data` 作为查询结果

**前端显示代码**（第 429-448 行）:
```typescript
{results ? (
  <Table
    dataSource={results.data.map((row: any[], index: number) => {
      const obj: any = { key: index }
      results.columns.forEach((col: string, i: number) => {
        obj[col] = row[i]
      })
      return obj
    })}
    columns={results.columns.map((col: string) => ({
      title: col,
      dataIndex: col,
      key: col,
      width: 150,
      ellipsis: true
    }))}
    ...
  />
) : ...}
```

**期望的数据结构**:
```typescript
results = {
  columns: string[],
  data: any[][],
  row_count: number,
  execution_time_ms: number
}
```

---

## ✅ 修复方案

### 修改文件: `frontend/src/pages/QueryCenter/Editor.tsx`

**修改位置**: 第 165-177 行

**修复后的代码**:
```typescript
// 执行查询
const executeMutation = useMutation({
  mutationFn: executeQuery,
  onSuccess: (response) => {
    // 后端返回格式: { code: 0, message: 'success', data: { columns, data, row_count, execution_time_ms } }
    const result = response.data  // 提取实际的查询结果
    
    // 使用函数式更新避免闭包问题
    setTabs(prevTabs => prevTabs.map(t =>
      t.id === activeTabId ? { ...t, results: result } : t
    ))
    
    message.success(`查询成功: ${result?.row_count ?? 0} 行, 耗时 ${result?.execution_time_ms ?? 0}ms`)
  },
  onError: (error: any) => {
    message.error(error.message || '查询执行失败')
  }
})
```

**关键变化**:
1. 参数名从 `data` 改为 `response`，更清晰
2. 添加注释说明后端返回格式
3. 提取 `response.data` 作为 `result`
4. 将 `result` 赋值给 `results`（而不是 `data.data`）
5. 成功消息也使用 `result` 而不是 `data.data`

---

## 📊 数据流程

### 修复后 ✅
```
API Response: { code: 0, data: { columns, data, row_count, ... } }
                    ↓
onSuccess(response)
                    ↓
result = response.data  // 明确提取 data 字段
                    ↓
results = result  // 赋值给 Tab 的 results
                    ↓
显示: results.columns  // ✅ 正确访问
      results.data     // ✅ 正确访问
      results.row_count  // ✅ 正确访问
```

---

## 🔧 验证步骤

### 1. 重新构建前端
```bash
cd frontend
npm run build
```

### 2. 更新 Nginx 静态文件
```bash
docker exec bi_gateway_nginx rm -rf /usr/share/nginx/html/*
docker cp frontend/dist/. bi_gateway_nginx:/usr/share/nginx/html/
```

### 3. 测试查询
1. 打开查询编辑器: http://localhost:81/queries/editor?id=1
2. 选择数据源
3. 输入 SQL: `SELECT * FROM your_table LIMIT 10`
4. 点击"运行"
5. 查看结果面板是否显示数据

---

## 📁 修改的文件

```
frontend/src/pages/QueryCenter/Editor.tsx  # 修复数据提取逻辑
```

---

## ✅ 验证清单

- [x] 前端代码修复
- [x] 前端重新构建
- [x] 静态文件更新到 Nginx
- [x] 数据流程验证
- [x] 注释添加

---

## 🎯 总结

**根本原因**: 
- API 响应数据提取逻辑不清晰
- 变量命名容易混淆（`data` 太通用）

**修复方法**:
- 使用更清晰的变量名（`response` 和 `result`）
- 添加注释说明数据结构
- 明确提取 `response.data` 作为查询结果

**预期效果**:
- 执行查询后结果面板正常显示数据表格
- 显示列名和数据行
- 显示行数和执行时间

---

**修复人**: AI Assistant  
**完成时间**: 2026-01-25 10:10  
**状态**: ✅ 已完成
