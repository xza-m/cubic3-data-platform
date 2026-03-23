# Design Document: 统一数据中心架构设计

## Context

### 背景
当前系统将"数据源管理"和"数据集管理"作为两个独立的顶级模块：
- 数据源（Datasources）：连接外部数据库（MySQL、PostgreSQL、ClickHouse、MaxCompute）
- 数据集（Datasets）：基于数据源创建的逻辑数据视图（物理表、SQL 虚拟表、CSV 文件）

从用户视角看，这两者构成完整的"数据底座"，但在 UI 和 API 架构上割裂。

### 约束
1. **不破坏现有业务逻辑**：数据源和数据集的 CRUD、权限、元数据管理逻辑保持不变
2. **最小化迁移成本**：路由和 API 路径变更需要向后兼容或提供清晰的迁移路径
3. **保持设计一致性**：遵循 Glass Morphism UI 风格和 DDD 架构模式

### 利益相关方
- **数据分析师**：需要快速找到可用的数据源和数据集
- **开发者**：需要清晰的 API 结构和稳定的接口
- **平台管理员**：需要统一的权限管理和数据资产视图

## Goals / Non-Goals

### Goals
1. ✅ **统一数据资产入口**：将数据源和数据集整合到"数据中心"主菜单下
2. ✅ **规范 API 路径**：使用 `/api/v1/data-center/*` 作为统一前缀，体现层次关系
3. ✅ **优化导航体验**：采用二级菜单设计，减少顶级菜单数量
4. ✅ **保持功能完整性**：不改变现有功能和业务逻辑

### Non-Goals
1. ❌ 不合并数据源和数据集的数据库表（保持 `data_sources` 和 `datasets` 表独立）
2. ❌ 不新增数据血缘、数据目录、数据质量等高级功能（留作后续迭代）
3. ❌ 不修改权限模型和认证逻辑
4. ❌ 不影响查询中心、数据提取、智能问数等其他模块

## Decisions

### Decision 1: API 路径迁移策略

**选择**: 使用嵌套路径 `/api/v1/data-center/{resource}/*`

**理由**:
- ✅ 清晰的层次关系（data-center 是父概念，datasources/datasets 是子资源）
- ✅ 符合 RESTful 约定（资源组织）
- ✅ 易于扩展（未来可添加 `/api/v1/data-center/lineage`、`/api/v1/data-center/quality` 等）

**备选方案**:
1. **平坦路径** (`/api/v1/datasources-v2`, `/api/v1/datasets-v2`)
   - ❌ 缺乏语义关联
   - ❌ 版本号误导（非版本升级，而是重组）

2. **独立 API 版本** (`/api/v2/datasources`, `/api/v2/datasets`)
   - ❌ 过度设计（功能未变化）
   - ❌ 增加维护成本（需同时维护 v1 和 v2）

### Decision 2: 向后兼容性处理

**选择**: 立即移除旧路径，不提供兼容层

**理由**:
- ✅ 简化实现，减少维护成本
- ✅ 避免中间状态的复杂性（301 重定向、Deprecation 管理）
- ✅ 强制系统快速现代化，避免技术债务累积
- ✅ 前后端同步部署，统一迁移时间点

**前提条件**:
1. 当前系统主要为内部使用，外部集成方可控
2. 部署窗口可协调（后端和前端同步上线）
3. 有明确的迁移通知机制

**风险与缓解**:
- ⚠️ **风险**: 部署期间短暂的 API 不可用
  - **缓解**: 选择低峰期部署，准备快速回滚方案
  
- ⚠️ **风险**: 外部系统未及时更新导致调用失败
  - **缓解**: 提前 3 天发布迁移公告，提供完整的路径映射表

**备选方案**:
1. **保留 30 天兼容期**
   - ❌ 增加代码复杂度（需维护两套路径）
   - ❌ 延长技术债务清理周期
   - ❌ 前端需额外处理重定向逻辑
   
2. **永久保留旧路径**
   - ❌ API 文档混乱（两套路径并存）
   - ❌ 违背"统一数据中心"的设计初衷

### Decision 3: 部署策略

**选择**: 蓝绿部署（Blue-Green Deployment）或停机维护窗口

**理由**:
- ✅ 无兼容层时，需确保前后端版本一致性
- ✅ 避免用户在部署过程中遇到 404 错误

**实施方案**:

**方案 A: 蓝绿部署（推荐）**
1. 准备新版本环境（Green）
2. 验证新环境功能正常
3. 切换流量到新环境
4. 保留旧环境 24 小时作为回滚选项

**方案 B: 维护窗口（简单）**
1. 公告维护时间（如凌晨 2:00-3:00）
2. 停止服务
3. 部署新版本（后端 + 前端）
4. 验证并恢复服务

**方案 C: 灰度发布（最安全，但本次不适用）**
- ❌ 无兼容层时无法实现灰度（新旧路径不兼容）

---

### Decision 4: 前端导航结构

**选择**: 二级菜单设计（主菜单 "数据中心" + 子菜单 "数据源"/"数据集"）

**理由**:
- ✅ 符合传统后台管理系统习惯（如 Apache Superset、Metabase）
- ✅ 权限控制更清晰（可单独控制子菜单可见性）
- ✅ 减少顶级菜单数量，降低视觉干扰

**交互设计**:
```
数据中心 [▼]          ← 主菜单（可展开/收起）
  ├─ 数据源            ← 子菜单 1
  └─ 数据集            ← 子菜单 2
```

**备选方案**:
1. **Tab 切换设计**（单页面内切换数据源/数据集视图）
   - ❌ 路由不清晰（URL 不直观）
   - ❌ 权限控制复杂（需要在组件内部判断）

2. **保持独立菜单**（仅修改 API 路径）
   - ❌ 未达成"统一入口"目标
   - ❌ 用户体验无提升

### Decision 5: 前端路由策略

**选择**: 同步调整为 `/data-center/datasources` 和 `/data-center/datasets`

**理由**:
- ✅ URL 与导航结构一致（用户看到的和访问的路径匹配）
- ✅ 便于未来添加 `/data-center/lineage` 等新功能
- ✅ SEO 友好（如需要）

**实现细节**:
```tsx
// frontend/src/App.tsx
<Route path="data-center">
  <Route path="datasources" element={<GlassDatasources />} />
  <Route path="datasets">
    <Route index element={<GlassDatasets />} />
    <Route path=":id" element={<GlassDatasetDetail />} />
    <Route path="register/table" element={<GlassDatasetRegister />} />
    <Route path="register/sql" element={<SqlLabRegister />} />
    <Route path="register/file" element={<FileDatasetRegister />} />
  </Route>
  <Route index element={<Navigate to="datasources" replace />} />
</Route>
```

**备选方案**:
1. **保持原路由不变**
   - ❌ URL 与导航不一致，用户困惑
   - ❌ 书签和外部链接指向错误

## Architecture

### 后端架构变更

**当前结构**:
```
app/interfaces/api/v1/
├── datasources.py    Blueprint(url_prefix='/api/v1/datasources')
└── datasets.py       Blueprint(url_prefix='/api/v1/datasets')
```

**目标结构**:
```
app/interfaces/api/v1/
├── data_center/
│   ├── __init__.py           # 注册父 Blueprint
│   ├── datasources.py        # 子 Blueprint (url_prefix='datasources')
│   └── datasets.py           # 子 Blueprint (url_prefix='datasets')
```

**简化说明**: 无兼容层，直接迁移至新结构

**Blueprint 注册**:
```python
# app/interfaces/api/v1/data_center/__init__.py
from flask import Blueprint

data_center_bp = Blueprint('data_center', __name__, url_prefix='/api/v1/data-center')

# 注册子 Blueprints
from . import datasources, datasets
data_center_bp.register_blueprint(datasources.bp)
data_center_bp.register_blueprint(datasets.bp)

# app/__init__.py
from app.interfaces.api.v1.data_center import data_center_bp
app.register_blueprint(data_center_bp)
```

### 前端架构变更

**导航组件**:
```tsx
// frontend/src/components/Layout/GlassAppLayout.tsx
const menuItems = [
  { path: '/dashboard', icon: BarChart3, label: '控制台', color: 'indigo' },
  { path: '/queries', icon: Code, label: '查询中心', color: 'cyan' },
  { 
    path: '/data-center', 
    icon: FolderTree, 
    label: '数据中心', 
    color: 'blue',
    children: [
      { path: '/data-center/datasources', icon: Database, label: '数据源' },
      { path: '/data-center/datasets', icon: Table2, label: '数据集' }
    ]
  },
  // ...
]
```

**API 客户端**:
```typescript
// frontend/src/api/datasources.ts
const API_BASE = '/api/v1/data-center/datasources'

export const getDatasources = (params: ListDatasourcesParams) => 
  apiClient.get<ListDatasourcesResponse>(`${API_BASE}`, { params })

// 同理更新 datasets.ts
```

## Risks / Trade-offs

### Risk 1: 外部系统依赖旧 API 路径

**风险等级**: 🔴 极高（无兼容层）

**影响**: 
- 外部数据同步脚本立即中断
- 第三方集成（如 CI/CD pipeline）立即失败
- 依赖旧路径的所有系统同步停止工作

**缓解措施**:
1. ✅ **提前 3-7 天发布迁移公告**（邮件 + 内部文档 + 飞书群通知）
2. ✅ 提供完整的**路径映射表和迁移脚本**
3. ✅ 在部署前**逐一确认所有外部集成方已完成更新**
4. ✅ 准备**快速回滚方案**（Git tag + Docker 镜像备份）
5. ✅ 选择**低峰期部署**（如周末凌晨或非工作时间）
6. ✅ 部署后**立即验证关键集成方的调用情况**

**迁移检查清单**:
```bash
# 1. 扫描所有依赖方代码
rg "/api/v1/datasources|/api/v1/datasets" --type py --type js --type ts

# 2. 提供替换脚本
sed -i 's|/api/v1/datasources|/api/v1/data-center/datasources|g' *.py
sed -i 's|/api/v1/datasets|/api/v1/data-center/datasets|g' *.py
```

### Risk 2: 前端路由变更导致书签失效

**风险等级**: 🟡 中

**影响**: 
- 用户保存的书签指向 404 页面
- 外部文档中的链接失效

**缓解措施**:
1. ✅ 在用户首次访问时显示**全屏提示信息**："导航结构已更新，请从'数据中心'菜单访问数据源和数据集"
2. ✅ 在 404 页面添加**智能引导**（检测 URL 模式并建议新路径）
3. ✅ 更新所有**内部文档和知识库**中的链接
4. ✅ 在飞书/邮件中发送**变更通知和新路径指南**

### Risk 3: 前后端部署不同步导致服务中断

**风险等级**: 🔴 高（无兼容层特有风险）

**影响**: 
- 后端先部署：前端调用旧路径返回 404
- 前端先部署：前端调用新路径但后端未就绪

**缓解措施**:
1. ✅ **原子化部署**：后端和前端在同一维护窗口内部署
2. ✅ **部署顺序**：先部署后端，立即验证新路径可用，再部署前端
3. ✅ **健康检查**：部署前后执行完整的 API 健康检查脚本
4. ✅ **快速回滚**：准备一键回滚脚本，5 分钟内恢复旧版本

---

### Risk 4: 导航重构引入 UX 问题

**风险等级**: 🟢 低

**影响**: 
- 子菜单展开/收起逻辑可能出现 bug
- 高亮状态判断错误

**缓解措施**:
1. ✅ 参考 Ant Design `Menu` 组件的最佳实践
2. ✅ 编写完整的路由匹配测试
3. ✅ 进行用户验收测试（UAT）

### Trade-off 1: 代码重组 vs 最小化变更

**选择**: 创建新的 `data_center/` 目录，而非直接修改现有文件

**优势**:
- ✅ 保持 Git 历史清晰（文件移动而非修改）
- ✅ 便于回滚（删除新目录即可）
- ✅ 符合"开闭原则"（对扩展开放，对修改关闭）

**劣势**:
- ❌ 增加文件数量
- ❌ 需要额外的 Blueprint 嵌套

**结论**: 优势大于劣势，采用新目录方案

### Trade-off 2: 兼容性策略（无兼容层 vs 30天兼容期）

**选择**: 无兼容层，立即全量迁移

**优势**:
- ✅ 简化实现，减少代码复杂度
- ✅ 避免"两套路径并存"的混乱状态
- ✅ 强制快速完成迁移，避免拖延
- ✅ 降低长期维护成本

**劣势**:
- ❌ 部署风险更高（需原子化部署）
- ❌ 对外部系统的影响更直接
- ❌ 需要更充分的准备和沟通

**结论**: 
在当前内部系统可控的前提下，接受较高的部署风险以换取更简洁的实现

## Migration Plan

### Phase 1: 准备阶段（D-7 至 D-1）
1. **D-7**: 
   - 发布迁移公告（内部邮件 + 飞书 + 内部文档）
   - 明确说明"无兼容层，旧路径将立即不可用"
2. **D-5**: 提供迁移工具包
   - 路径映射表
   - 代码扫描脚本
   - 自动替换脚本
3. **D-3**: 
   - 逐一联系外部集成方，确认迁移进度
   - 提供测试环境供集成方验证
4. **D-1**: 
   - 最终确认：所有外部系统已完成更新
   - 完成所有单元测试和集成测试
   - 准备回滚方案

### Phase 2: 部署阶段（D-Day，建议周六凌晨 02:00-04:00）
1. **01:50**: 发布维护公告（系统将于 02:00 短暂维护）
2. **02:00**: 备份关键数据
   - 数据库快照
   - Git tag: `v1.x-pre-datacenter`
   - Docker 镜像标记
3. **02:05**: 部署后端
   - 停止旧版本 backend 容器
   - 启动新版本 backend 容器
   - 验证 `/api/v1/data-center/datasources` 可访问
   - 验证 `/api/v1/datasources` 返回 404
4. **02:15**: 部署前端
   - 构建新版本前端
   - 更新 Nginx 挂载目录
   - 重启 Nginx
5. **02:25**: 冒烟测试（Smoke Test）
   - 数据源列表加载
   - 数据集列表加载
   - 创建测试数据源
   - 删除测试数据源
6. **02:35**: 恢复服务，发布完成公告

### Phase 3: 监控阶段（D+0 至 D+3）
1. **D+0**（部署当天）：
   - 实时监控 Nginx 和 Backend 日志
   - 统计 404 错误数量（旧路径访问）
   - 联系 404 错误的来源方
2. **D+1**：
   - 收集用户反馈
   - 修复发现的 bug
   - 确认所有核心功能正常
3. **D+3**：
   - 评估迁移成功率
   - 更新内部文档
   - 归档迁移日志

### Rollback Plan（5 分钟内完成）
如果在部署后 2 小时内发现严重问题（如核心功能不可用）：

```bash
# 1. 立即回滚到旧版本（预估 3 分钟）
git checkout v1.x-pre-datacenter
docker compose -f docker-compose.full.yml down
docker compose -f docker-compose.full.yml up -d

# 2. 验证旧版本功能（预估 2 分钟）
curl http://localhost:81/api/v1/datasources
curl http://localhost:81/datasources

# 3. 发布回滚公告
echo "由于技术问题，已回滚至旧版本，正在分析并修复"
```

**回滚后行动**:
1. 分析失败原因（日志、错误堆栈）
2. 在测试环境中修复问题
3. 重新计划部署时间（D+7）

## Open Questions

### Q1: 是否需要在数据库中新增 `data_center_settings` 表？
**答案**: 暂不需要。当前重构仅涉及路由和导航，不涉及新增业务逻辑。

### Q2: 子菜单权限如何控制？
**答案**: 复用现有的角色权限系统。在后端 API 层保持原有的 `@require_auth` 和 `@require_permission` 装饰器。前端根据用户权限动态显示/隐藏子菜单项。

### Q3: 移动端适配如何处理？
**答案**: 当前系统未提供移动端界面。如未来需要，二级菜单可折叠为汉堡菜单（Hamburger Menu）。

### Q4: 是否需要在 OpenAPI 文档中更新路径？
**答案**: 是。如果使用 `flask-openapi3` 或 Swagger，需要同步更新 API 规范文件。

### Q5: 无兼容层是否过于激进？是否应该保留短期兼容？
**答案**: 已确认采用无兼容层方案。理由：
1. 当前系统主要为内部使用，外部依赖方可控
2. 部署窗口可协调（选择维护时间窗口）
3. 简化实现，避免维护两套路径的复杂性
4. 强制快速完成迁移，避免拖延和技术债务

**前提**: 必须提前通知所有依赖方，并准备完善的回滚方案。

### Q6: 部署失败的回滚时间窗口是多久？
**答案**: 建议在部署后 2 小时内决定是否回滚。超过 2 小时后，用户已开始使用新版本，回滚可能导致数据不一致。
