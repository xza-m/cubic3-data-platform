## 1. 共享抽象与基线
- [x] 1.1 在前端定义 `SemanticObjectSummary`、`SemanticGovernanceState`、`SemanticStructureSummary`、`WorkbenchContextItem`
- [x] 1.2 为语义中心建立统一的 view model hooks：`useCubeInventory`、`useCubeStudio`、`useDomainGovernance`、`useDomainCanvas`、`useSemanticDevTools`
- [x] 1.3 将 `SemanticPageHeader / ContextBar / Surface / Inspector / IssueList / PreviewPanel` 固定为语义中心标准工作台壳
- [x] 1.4 将本提案中的字段清单与组件清单落为开发参考文档并与实现同步

## 2. Overview / Inventory 类型页面
- [x] 2.1 收敛 `Overview`，只保留模块职责与整体状态
- [x] 2.2 收敛 `CubeList`，固定为 `Inventory` 页面：轻页头、单层筛选、对象列表、条件预览
- [x] 2.3 收敛 `DomainList`，固定为目录治理型 `Inventory` 页面：目录 rail、治理列表、条件摘要
- [x] 2.4 统一三者的页头文案、上下文条和状态语言

## 3. Studio 类型页面
- [x] 3.1 将 `CubeStudio` 固定为唯一单模型定义工作台
- [x] 3.2 明确 `CubeStudio` 只承载基础定义、来源、结构、规则、校验和生命周期动作
- [x] 3.3 从页面和文案层彻底去除 `Join / 领域发布 / DSL 调试` 责任

## 4. Canvas 类型页面
- [x] 4.1 将 `DomainModelingEntry` 固定为领域草稿入口，而不是治理页或画布页
- [x] 4.2 将 `DomainCanvas` 固定为关系建模页：左资源库、中画布、右 Inspector
- [x] 4.3 统一 `DomainCanvas` 的 Inspector 三态：领域摘要 / Cube 摘要 / Join 设置
- [x] 4.4 明确画布页只承载关系建模、Join 编辑和发布前检查

## 5. Developer Workbench 类型页面
- [x] 5.1 将 `DevTools` 固定为定义文件、编译调试、Schema 同步三 tab 工作台
- [x] 5.2 将 `Cube / View / Domain / Catalog` 的资源树切换统一到单一资源树入口
- [x] 5.3 对 `Domain / Catalog` 的不可编辑态提供稳定空状态和返回主模块的动作

## 6. View / Recipe 挂载策略
- [x] 6.1 明确 `View` 的主要挂载位置：`Cube` 预览/详情、`DevTools`、发布状态区
- [x] 6.2 明确 `Recipe` 的主要挂载位置：对象详情区或工具页，不新增一级导航
- [x] 6.3 清理残留的“资源即一级页面”设计倾向

## 7. 文档与验收
- [x] 7.1 根据本提案补充页面字段清单与组件清单文档
- [x] 7.2 为每个页面类型补充最小验收标准：页头、上下文条、主任务区、条件 Inspector
- [x] 7.3 校验路由、跳转和职责边界，不允许页面再次混入不属于自己的任务
- [x] 7.4 执行 `openspec validate refactor-semantic-center-ia --strict`
