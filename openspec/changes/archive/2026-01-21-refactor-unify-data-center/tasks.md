# Implementation Tasks

## Phase 1: 后端 API 路径迁移（1天）

### 1.1 Blueprint 路径重构
- [x] 1.1.1 修改 `app/interfaces/api/v1/datasources.py` Blueprint 注册路径为 `/data-center/datasources`
- [x] 1.1.2 修改 `app/interfaces/api/v1/datasets.py` Blueprint 注册路径为 `/data-center/datasets`
- [x] 1.1.3 更新 `app/__init__.py` 中的 Blueprint 注册逻辑
- [x] 1.1.4 确认彻底移除旧路径支持（无 301 重定向）

### 1.2 测试验证
- [x] 1.2.1 使用 `flask routes` 验证新路径已生效，旧路径已移除
- [x] 1.2.2 使用 `curl` 测试关键 API 端点（列表、详情、创建、更新、删除）
- [x] 1.2.3 验证旧路径返回 404（确保彻底移除）

## Phase 2: 前端 API 客户端更新（0.5天）

### 2.1 API 基础路径变更
- [x] 2.1.1 更新 `frontend/src/api/datasources.ts` 的 base URL 为 `/api/v1/data-center/datasources`
- [x] 2.1.2 更新 `frontend/src/api/datasets.ts` 的 base URL 为 `/api/v1/data-center/datasets`
- [x] 2.1.3 使用全局搜索确认所有硬编码的旧 API 路径已更新

### 2.2 编译验证
- [x] 2.2.1 运行 `npm run build` 确保无 TypeScript 错误
- [x] 2.2.2 运行 `npm run dev` 验证 API 调用正常

## Phase 3: 前端导航与路由重构（1天）

### 3.1 路由定义更新
- [x] 3.1.1 修改 `frontend/src/App.tsx`，将路由路径调整为：
  - `/data-center/datasources`
  - `/data-center/datasets`
  - `/data-center/datasets/:id`
  - `/data-center/datasets/register/*`
- [x] 3.1.2 添加 `/data-center` 重定向到 `/data-center/datasources`
- [x] 3.1.3 移除旧路由定义（无前端兼容层）

### 3.2 导航菜单重构
- [x] 3.2.1 修改 `frontend/src/components/Layout/GlassAppLayout.tsx`：
  - 移除独立的 `datasources` 和 `datasets` 菜单项
  - 新增 `data-center` 菜单项（主菜单）
  - 添加子菜单结构（数据源、数据集）
  - 实现子菜单展开/收起逻辑
- [x] 3.2.2 调整导航高亮逻辑，支持多级路由匹配（如 `/data-center/*` 高亮主菜单）

### 3.3 快捷入口更新
- [x] 3.3.1 更新 `frontend/src/pages/GlassDashboard.tsx` 中的快捷卡片链接
- [x] 3.3.2 搜索并更新所有 `useNavigate()` 调用中的路径引用

### 3.4 UI/UX 优化
- [x] 3.4.1 设计"数据中心"菜单图标（建议使用 `FolderTree` 或 `Database` + `FolderOpen`）
- [x] 3.4.2 优化子菜单样式（缩进、hover 效果）
- [x] 3.4.3 确保 Glass Morphism 风格一致性

## Phase 4: 文档更新（0.5天）

### 4.1 API 文档
- [x] 4.1.1 更新 `docs/readme.md` 中的 API 路径示例
- [x] 4.1.2 移除所有旧路径引用（不保留 deprecated 标注）

### 4.2 项目文档
- [x] 4.2.1 更新 `openspec/project.md` 的目录结构说明
- [x] 4.2.2 更新访问指南和截图（如有）

### 4.3 变更日志
- [x] 4.3.1 在 `CHANGELOG.md`（如有）或 `docs/readme.md` 中记录 Breaking Changes
- [x] 4.3.2 提供旧路径到新路径的完整映射表供用户参考

## Phase 5: 集成测试与修复（1天）

### 5.1 端到端测试
- [x] 5.1.1 测试数据源管理全流程（列表 → 创建 → 编辑 → 测试连接 → 删除）
- [x] 5.1.2 测试数据集管理全流程（列表 → 注册（物理/SQL/文件）→ 编辑 → 删除）
- [x] 5.1.3 验证导航跳转和面包屑正确性

### 5.2 模块集成测试
- [x] 5.2.1 验证查询中心、数据提取、智能问数模块正常工作
- [x] 5.2.2 检查控制台首页统计数据正常显示
- [x] 5.2.3 验证所有依赖数据源/数据集 API 的功能模块正常

### 5.3 错误修复
- [x] 5.3.1 修复发现的路由 404 错误
- [x] 5.3.2 修复 API 调用失败的情况
- [x] 5.3.3 修复样式错位或交互问题

## Phase 6: 部署与回滚准备（0.5天）

### 6.1 构建与部署
- [x] 6.1.1 前端构建: `npm run build`
- [x] 6.1.2 后端重启: `docker compose -f docker-compose.full.yml restart backend`
- [x] 6.1.3 前端部署: 重启 Nginx 或同步 dist 目录

### 6.2 回滚计划
- [x] 6.2.1 备份当前代码版本（Git tag）
- [x] 6.2.2 准备快速回滚脚本（如需要）

### 6.3 监控与验证
- [x] 6.3.1 检查 Nginx 和 Backend 日志，确认无 404 或 500 错误
- [x] 6.3.2 验证用户访问路径正常（可通过浏览器开发者工具查看网络请求）

---

**预计总工时**: 2.5 - 3.5 天（移除兼容层后缩短）

**关键依赖**:
- Phase 1 必须在 Phase 2 之前完成（API 路径先变更）
- Phase 1 和 Phase 2 必须同步完成（否则前端调用失败）
- Phase 3.1 和 3.2 可并行开发
- Phase 5 依赖 Phase 1-4 全部完成

**并行机会**:
- Phase 2（API 客户端）和 Phase 3（前端路由）可在 Phase 1 完成后同时进行
- Phase 3.3（快捷入口）和 Phase 4（文档）可同时进行

**风险提示**:
- ⚠️ 无兼容层：需确保后端和前端同步部署，否则会导致 API 调用失败
- ⚠️ 需提前通知所有外部系统集成方进行同步更新
