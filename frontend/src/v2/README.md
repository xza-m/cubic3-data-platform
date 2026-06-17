<!-- frontend/src/v2/README.md -->

# frontend/src/v2

Platform Redesign 的全新 UI/UX 命名空间。**与 legacy 互不 import**。

详见：

- [Master plan](../../../docs/superpowers/plans/2026-04-20-platform-redesign-rollout-implementation.md)
- [00 architecture](../../../docs/superpowers/plans/2026-04-20-platform-redesign/00-architecture.md)
- [01 frontend workstream](../../../docs/superpowers/plans/2026-04-20-platform-redesign/01-frontend-workstream.md)
- [03 cross-cutting](../../../docs/superpowers/plans/2026-04-20-platform-redesign/03-cross-cutting-concerns.md)

## 目录

```text
v2/
  main.tsx, App.tsx, routes.tsx        # 独立入口
  api/                                 # axios 客户端 + 业务接口
  hooks/                               # react-query hooks
  layout/                              # AppShell / TopBar / SecondarySidebar / TabStrip
  components/
    ui/                                # 设计系统组件
    PeekPanel / ResourceListPage / EntityFormDialog / ...
    ErrorBoundary / Can / RouteGuard
  styles/                              # tokens.css + globals.css
  i18n/                                # t() + zh.json（中文单语言）
  lib/                                 # cn / format / telemetry
  pages/                               # 业务页面，按域分子目录
  test/                                # vitest setup
```

## 红线（缺一不可）

1. 不允许 `display:none` / hidden 隐藏后端不支持字段，走 align/extend/new/drop
2. 不新增 mock 数据，新数据走真实 `/api/v1/*`
3. 不在页面层调 `axios.*`，统一 `v2/api/*`
4. mutation 必须 `invalidateQueries`
5. 无 `#hex` / `[12px]` 字面量；只用 token
6. 新可见字符串走 `t()`
7. 删除项注释 `// drop-frontend: backend has no design for X`

## 当前状态（Round 1）

由 main thread + 9 个 sub-agent 并行落地中。详见各域 README（如有）与本期产出报告。
