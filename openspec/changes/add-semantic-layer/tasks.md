## 实施规范

1. **测试优先**：每完成一项功能模块，必须编写对应的单元测试并通过，形成"实现 → 测试 → 通过"闭环后再标记完成。
2. **进度同步**：每项任务完成且测试通过后，立即更新本文件中的 `- [ ]` 为 `- [x]`，保持进度实时可见。
3. **非阻塞推进**：实现过程中遇到阻塞问题（依赖缺失、环境问题、设计歧义等），在对应任务下方记录 `<!-- TODO: 描述问题 -->` 并跳过，继续后续任务，不阻塞整体进度。

---

## Phase 1.1 — 基础框架 + 数据模型（2天）

- [x] 1.1.1 创建 `app/domain/semantic/` 目录：entities.py、ports（cube_repository.py、view_repository.py、recipe_repository.py、schema_inspector.py）
- [x] 1.1.2 创建 `app/infrastructure/semantic/` 目录：yaml_cube_repository.py、yaml_view_repository.py、yaml_recipe_repository.py
- [x] 1.1.3 实现 entities.py：CubeDefinition、ViewDefinition、RecipeDefinition、DimensionDef、MeasureDef、JoinDef、SegmentDef、QueryDSL 等 Pydantic 模型（21 tests passed）
- [x] 1.1.4 实现 YamlCubeRepository：YAML 文件加载、Pydantic 校验、list_all/get/save/delete（9 tests passed）
- [x] 1.1.5 实现 YamlViewRepository：View YAML 加载、字段映射构建（3 tests passed）
- [x] 1.1.6 实现 YamlRecipeRepository：Recipe YAML 加载、DSL 自动提取 Cube 引用构建反向索引、get_by_cube 查询（7 tests passed）
- [x] 1.1.7 编写 Cube/View/Recipe YAML Schema 校验（内嵌 Pydantic model_validator，repo 加载时触发）

## Phase 1.2 — 14 个 Cube + 2 个 View + Recipe 定义（1.5天）

- [x] 1.2.1 根据 PRD 第四章，创建 14 个 Cube `.yml` 文件（14 files, all valid）
- [x] 1.2.2 创建 `student_answer_analysis` 和 `teaching_overview` 两个 View `.yml` 文件
- [x] 1.2.3 为核心 Cube 创建 Recipe `.yml` 文件（answer_accuracy_by_subject、energy_block_analysis、kt_accuracy）
- [x] 1.2.4 将旧 `query-templates.md` 中的 SQL 模板转写为 Recipe DSL 配方（整合至 3 个 Recipe）
- [x] 1.2.5 校验所有 Cube 字段引用 + JOIN 双向可达 + View 引用完整性（Repository 加载验证通过）

## Phase 1.3 — JoinGraph + Compiler（4天）

- [x] 1.3.1 实现 dialects.py：SQLDialect 抽象 + MaxComputeDialect（7 tests passed）
- [x] 1.3.2 实现 join_graph.py：图构建、BFS 最短路径推导、歧义消解（5 tests passed）
- [x] 1.3.3 实现 compiler.py：DSL → SQL 完整编译流水线
- [x] 1.3.4 MaxComputeDialect 实现 day/week/month/quarter/year granularity 转换
- [x] 1.3.5 Measure 递归展开（_resolve_measure_refs，最多 5 层）
- [x] 1.3.6 分区条件自动注入（主表 + latest_expr 兜底）
- [x] 1.3.7 Default Filter 注入 + Segment 注入
- [x] 1.3.8 Fan-out 防护：MAX_JOIN_DEPTH=3 + JoinPathTooDeepError
- [x] 1.3.9 错误处理：UnknownCubeError、UnknownFieldError、JoinPathNotFoundError、JoinPathTooDeepError、CompilationError
- [x] 1.3.10 查询执行重试策略：retryable/non-retryable 分类 + retryable 标记（集成在 SemanticLayerService）

## Phase 1.4 — Agent 工具集成（2天）

- [x] 1.4.1 tool_registry.py 注册 list_cubes、describe_cube、query 工具（ToolDef + handler）
- [x] 1.4.2 describe_cube 返回时自动附带 query_recipes（反向索引查询，最多 3 Recipe * 2 examples）
- [x] 1.4.3 query 工具实现：DSL 解析 → Compiler 编译 → execute_query → 返回结果
- [x] 1.4.4 保留 execute_sql 作为兜底（channels: ["feishu", "datachat"]）
- [x] 1.4.5 SemanticLayerService 应用服务（统一 list/describe/compile/execute）
- [x] 1.4.6 DI 容器配置：cube_repository → view_repository → recipe_repository → semantic_service → tool_registry
- [x] 1.4.7 System Prompt 更新：注入语义层工具说明（list_cubes/describe_cube/query 优先策略 + DSL 构造指引）
- [x] 1.4.8 安抚话术：compile_and_execute 返回 hint 字段（编译/执行失败时的友好提示与修复建议）
- [ ] ~~1.4.9 Redis 缓存~~ — 已取消

## Phase 1.5 — 物理层同步（1天）

- [x] 1.5.1 实现 SchemaSyncService：Schema 对比检测（8 tests passed）
- [x] 1.5.2 实现 MaxComputeSchemaInspector（ISchemaInspector 适配器）
- [x] 1.5.3 Schema Drift 定时任务注册（APScheduler cron，默认每日 03:30）
- [x] 1.5.4 Schema Drift 飞书群 webhook 推送（FeishuWebhookNotifier + 交互卡片）
- [x] 1.5.5 POST /api/v1/semantic/schema-sync 实际执行检测 + 可选 notify 参数

## Phase 1.6 — 测试与调优（2天）

- [x] 1.6.1 编写 Compiler 单元测试（覆盖 PRD 6.11 测试用例矩阵核心场景：32 tests passed）
- [x] 1.6.2 SemanticLayerService 集成测试（list/describe/compile/execute：15 tests passed）
- [x] 1.6.3 SchemaSyncService 单元测试（8 tests passed）
- [x] 1.6.4 全量测试通过：95 tests ALL passed，0 failures
<!-- TODO: 1.6.3 Recipe few-shot A/B 对比、1.6.5 System Prompt 调优 — 需要运行时 LLM 环境 -->

## Phase 1.7 — 后端 API（1.5天）

- [x] 1.7.1 Cube API：GET /api/v1/semantic/cubes + GET /api/v1/semantic/cubes/<name>
- [x] 1.7.2 View API：GET /api/v1/semantic/views + GET /api/v1/semantic/views/<name>
- [x] 1.7.3 Recipe API：GET /api/v1/semantic/recipes
- [x] 1.7.4 编译调试 API：POST /api/v1/semantic/compile
- [x] 1.7.5 Schema 同步 API：POST /api/v1/semantic/schema-sync（stub，需运行时 adapter）
- [x] 1.7.6 Blueprint 注册到 Flask app

## Phase 2 — Canvas UI + DevTools（前端）

### P0 — 全局基础
- [x] 2.0.1 Design Tokens 扩展（semantic-fact/dim/ok/warn/error 色、--font-mono）
- [x] 2.0.2 JetBrains Mono 字体 preload
- [x] 2.0.3 `useUrlState` Hook（URL query param 双向绑定）
- [x] 2.0.4 `format.ts`（fmtNumber / fmtDate）
- [x] 2.0.5 `api/semantic.ts`（API 客户端 + TypeScript 类型）
- [x] 2.0.6 `fill-mode-forwards` + `prefers-reduced-motion` 动画适配
- [x] 2.0.7 侧边栏"语义中心"菜单组（Cube 管理 / 关系画布 / 开发者工具）
- [x] 2.0.8 路由注册（semantic/cubes、cubes/:name、canvas、devtools）

### P1.1 — Cube 管理列表页
- [x] 2.1.1 CubeCard 组件（类型色标识、tabular-nums、staggered animation）
- [x] 2.1.2 SyncStatusBadge 组件（ok/warn/error 三态）
- [x] 2.1.3 CubeList 页面（搜索 + 类型筛选 + 排序 + URL 同步 + 空状态 + 骨架屏）

### P1.2 — Cube 详情页
- [x] 2.1.4 CubeDetail 页面（维度/指标/分段/关联 4 Tab + URL Tab 同步）
- [x] 2.1.5 维度/指标/分段/关联表格组件
- [x] 2.1.6 查询示例展示（Recipe DSL）

### P1.3 — DevTools 容器 + Playground Tab
- [x] 2.2.1 DevTools 页面（4 Tab + URL Tab 同步）
- [x] 2.2.2 PlaygroundTab：Cube/View 下拉 + 指标/维度勾选 + 时间范围 + DSL JSON 编辑
- [x] 2.2.3 PlaygroundTab：编译按钮 → SQL 预览 + 诊断信息

### P1.4 — Schema 同步 Tab
- [x] 2.2.4 SchemaSyncTab：状态概览（ok/warn/error 计数卡片 + 筛选）
- [x] 2.2.5 SchemaSyncTab：Cube 同步状态表格

### P2.1 — YAML 编辑器 Tab
- [x] 2.2.6 YamlEditorTab：文件树（Cubes/Views/Recipes 分组 + 选中高亮）
- [x] 2.2.7 YamlEditorTab：Monaco YAML 编辑器 + 暗色主题适配
- [x] 2.2.8 YamlEditorTab：保存 / 校验 / 未保存拦截

### P2.2 — 编译调试器 Tab
- [x] 2.2.9 CompileDebugTab：DSL JSON 输入 + 示例预填
- [x] 2.2.10 CompileDebugTab：逐步编译结果展示（步骤卡片 + 状态图标）
- [x] 2.2.11 CompileDebugTab：SQL 生成 + 复制

### P2.3 — 关系画布
- [x] 2.3.1 CubeNode 自定义节点（类型色、aria-label、handle）
- [x] 2.3.2 JoinEdge 自定义连线（关系标签、hover 交互）
- [x] 2.3.3 RelationCanvas 页面（React Flow + ELK 自动布局 + MiniMap + Controls）
- [x] 2.3.4 右侧 Sheet 详情面板（选中节点 → 摘要 + 查看详情链接）

### 后端 API 补齐
- [x] 2.4.1 GET /api/v1/semantic/graph（关系图 nodes + edges）
- [x] 2.4.2 GET /api/v1/semantic/files（文件树列表）
- [x] 2.4.3 GET /api/v1/semantic/files/:type/:name（读取 YAML）
- [x] 2.4.4 PUT /api/v1/semantic/files/:type/:name（保存 YAML + invalidate cache）
- [x] 2.4.5 POST /api/v1/semantic/files/:type/:name/validate（YAML 校验）

### P2.7 — View 物化
- [x] 2.7.1 后端：`expand_view_to_dsl()` — View → DSL 展开（includes/excludes 解析）
- [x] 2.7.2 后端：POST /api/v1/semantic/views/:name/materialize（编译 → 创建/更新虚拟数据集）
- [x] 2.7.3 后端：GET /api/v1/semantic/views/:name/materialize-status（单 View 物化状态）
- [x] 2.7.4 后端：GET /api/v1/semantic/views/materialize-status（批量 View 物化状态）
- [x] 2.7.5 前端 API client：materializeView + getMaterializeStatus + getBatchMaterializeStatus
- [x] 2.7.6 前端：ViewCard 组件（物化按钮 + AlertDialog 确认 + 状态展示 + Toast 反馈）
- [x] 2.7.7 前端：CubeList 页面集成 Views 区域（批量状态查询 + ViewCard 网格）

### P2.9 — DSL join_path 显式路径指定
- [x] 2.9.1 QueryDSL.join_path 类型从 Optional[str] 改为 Optional[List[str]]
- [x] 2.9.2 JoinGraph 新增 find_path_through(waypoints)：逐段查找直连边 + 深度校验
- [x] 2.9.3 Compiler.compile() 优先使用 dsl.join_path 显式路径，自动加载中间节点 Cube
- [x] 2.9.4 修复 BFS 自动路径中间节点未加载 bug（_ensure_edge_cubes_loaded）
- [x] 2.9.5 前端 PlaygroundTab 增加可选 JOIN 路径输入（逗号分隔 Cube 名称）

### 后续排期
- [ ] ~~2.8 Pre-aggregation 支持 + 加速层路由（Hologres/StarRocks）~~ — 暂缓
