# 语义工作台建模页视觉收敛 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变语义工作台主结构的前提下，将建模页收紧成统一的平台工作台风格，提升顶部层级清晰度、字段扫读效率和左右区域的一致性。

**Architecture:** 复用现有 `DevTools` 和 `WorkbenchModelingTab` 作为主承载，不新增页面和后端契约。主要通过页面分层重组、样式收敛和字段卡片紧凑化完成视觉改版，并用页面测试锁定关键感知点。

**Tech Stack:** React、TypeScript、Tailwind CSS、Vitest、React Testing Library

---

## 文件结构

**Create:**
- `docs/superpowers/plans/2026-04-07-semantic-workbench-visual-refresh-implementation.md`

**Modify:**
- `frontend/src/pages/Semantic/DevTools.tsx`
- `frontend/src/components/Semantic/Workbench/WorkbenchModelingTab.tsx`
- `frontend/src/pages/Semantic/DevTools.page.test.tsx`

**Test:**
- `frontend/src/pages/Semantic/DevTools.page.test.tsx`

## Task 1: 顶部区域收紧为工作台层级

**Files:**
- Modify: `frontend/src/pages/Semantic/DevTools.tsx`
- Test: `frontend/src/pages/Semantic/DevTools.page.test.tsx`

- [ ] **Step 1: 先写失败测试，锁定顶部层级变化**

补测试断言：
- 流程条仍存在，但作为轻量辅助条
- `当前资源 / 当前 Cube / 当前状态` 不再是三张独立卡片，而是单一上下文带语义
- 对象标题区与 `预览 / 发布` 形成标准页头

- [ ] **Step 2: 运行测试，确认新增断言先失败**

Run:
```bash
cd frontend && npm run test:unit -- src/pages/Semantic/DevTools.page.test.tsx
```

- [ ] **Step 3: 在 `DevTools.tsx` 实现顶部收紧**

实现要点：
- 流程条视觉降级，减少胶囊感和占位
- 将上下文三卡改为单行信息带
- 将对象标题、来源和操作按钮收成标准页头

- [ ] **Step 4: 再跑页面测试，确认通过**

Run:
```bash
cd frontend && npm run test:unit -- src/pages/Semantic/DevTools.page.test.tsx
```

## Task 2: AI 摘要区降级为轻提示 + 紧凑统计

**Files:**
- Modify: `frontend/src/components/Semantic/Workbench/WorkbenchModelingTab.tsx`
- Test: `frontend/src/pages/Semantic/DevTools.page.test.tsx`

- [ ] **Step 1: 先补失败测试，锁定摘要区感知**

补测试断言：
- `AI 已生成建模初稿` 保留
- 长说明文案收短
- 统计区仍存在，但变为紧凑摘要而非强 KPI 卡

- [ ] **Step 2: 运行测试，确认失败**

Run:
```bash
cd frontend && npm run test:unit -- src/pages/Semantic/DevTools.page.test.tsx
```

- [ ] **Step 3: 在 `WorkbenchModelingTab.tsx` 实现摘要区收紧**

实现要点：
- 保留轻量状态提示
- 收短提示文案
- 减少渐变、阴影和大卡片感
- 统计信息采用更紧凑的工作台摘要样式

- [ ] **Step 4: 再跑页面测试，确认通过**

Run:
```bash
cd frontend && npm run test:unit -- src/pages/Semantic/DevTools.page.test.tsx
```

## Task 3: 字段分组和字段项紧凑化

**Files:**
- Modify: `frontend/src/components/Semantic/Workbench/WorkbenchModelingTab.tsx`
- Test: `frontend/src/pages/Semantic/DevTools.page.test.tsx`

- [ ] **Step 1: 先补失败测试，锁定字段列表行为和信息层级**

补测试断言：
- 字段项仍展示字段名、字段类型、描述
- 字段项默认信息压缩为更紧凑的两层结构
- `推荐理由 / 识别置信度 / 来源类型` 不再默认占据大面积独立块

- [ ] **Step 2: 运行测试，确认失败**

Run:
```bash
cd frontend && npm run test:unit -- src/pages/Semantic/DevTools.page.test.tsx
```

- [ ] **Step 3: 在 `WorkbenchModelingTab.tsx` 实现字段区紧凑化**

实现要点：
- 分组区改为轻分区块
- 字段项改为紧凑行块/列表块
- 收敛元信息的默认展示密度
- 缺失描述继续诚实显示 `暂无业务描述，待补充`

- [ ] **Step 4: 再跑页面测试，确认通过**

Run:
```bash
cd frontend && npm run test:unit -- src/pages/Semantic/DevTools.page.test.tsx
```

## Task 4: 左右区域风格统一与回归验证

**Files:**
- Modify: `frontend/src/pages/Semantic/DevTools.tsx`
- Modify: `frontend/src/components/Semantic/Workbench/WorkbenchModelingTab.tsx`
- Test: `frontend/src/pages/Semantic/DevTools.page.test.tsx`

- [ ] **Step 1: 先补失败测试，锁定左右区域统一感**

补测试断言：
- 左侧资源区仍保留现有结构
- 右侧建模区保留现有结构
- 但页面不再依赖大量大卡片，工作台骨架元素仍可识别

- [ ] **Step 2: 运行测试，确认失败**

Run:
```bash
cd frontend && npm run test:unit -- src/pages/Semantic/DevTools.page.test.tsx
```

- [ ] **Step 3: 调整左右容器样式并做最小清理**

实现要点：
- 统一边框、圆角、背景层级
- 降低左侧资源卡片和右侧字段卡片的风格割裂
- 保持现有交互不变

- [ ] **Step 4: 跑完整专项验证**

Run:
```bash
cd frontend && npm run test:unit -- src/pages/Semantic/DevTools.page.test.tsx
cd frontend && npm exec -- tsc --noEmit --pretty false
```

- [ ] **Step 5: 提交**

```bash
git add frontend/src/pages/Semantic/DevTools.tsx frontend/src/components/Semantic/Workbench/WorkbenchModelingTab.tsx frontend/src/pages/Semantic/DevTools.page.test.tsx
git commit -m "feat: refresh semantic workbench modeling layout"
```
