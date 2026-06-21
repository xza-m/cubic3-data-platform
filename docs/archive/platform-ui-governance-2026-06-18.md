---
doc_type: implementation-record
status: current
source_of_truth: historical
owner: engineering
last_reviewed: 2026-06-18
---

# 平台 UI 治理修复记录（2026-06-18）

## 背景

本轮治理围绕平台上线前的界面闭环复核展开，重点处理数据平台、语义层、配置中心和应用中心里的三类问题：

- 布局不合理：二级导航缺失、重复页头、无价值右侧面板、说明块挤占主工作区。
- 组件样式不合理：表格被长条件撑高、按钮/链接样式混用、配置模块偏开发调试台。
- 底层实现外露：API 路由、内部枚举、技术 ID、route_type、Gateway Query ID、SQL/YAML/JSON 等直接进入普通业务界面。

## 阶段执行记录

### P0：外显风险与误导信息清理

- 命令面板不再展示接口路由和“跳转到模块”类无效说明，静态导航只展示模块名称和业务分组。
- DataChat 将语义执行摘要从 `route_type`、Gateway Query ID、生成 SQL 改为业务化的“理解方式 / 治理状态 / 可追溯执行结果”。
- 应用中心统一通过应用名称、分类和实例名称展示对象，不再在列表、详情、订阅和执行记录中直出 `app_code`、`app_instance_id`、`channel_id`。
- 配置中心渠道/订阅错误态和兜底态不再展示 `#{id}`，未知枚举统一显示“未知事件 / 未知渠道 / 未知状态 / 未知实例”。
- 权限管理将执行方式从 `mc_m*_reader` 转换为“基础数据读取 / 汇总数据读取 / 明细数据读取”，行级范围压缩为摘要，完整条件通过 hover 明细查看。

### P1：布局与操作路径治理

- 数据中心补齐二级菜单，按“概览、数据连接、数据资产、数据同步、影响分析”组织任务路径。
- 数据中心移除重复页头说明、最近运营对象、职责边界说明等无操作价值内容；影响分析只保留真实影响关系。
- 网关观测按监控模块拆分为“监控概览、运行指标、Trace 查询、契约质量”，避免一个大页面堆叠所有指标。
- 渠道配置增加发送测试能力，按渠道类型验证联通情况并展示测试结果。
- 应用实例创建入口修复跳转，配置模块改为“配置结构 / 配置内容 / 编辑 / 校验”的单模块工作流。
- 设置页默认落点从手输路径改为工作区选择，减少路径配置错误。
- Cube 列表移除概念链路展示，卡片优先展示业务标题、业务上下文、描述、维度和指标数量，不直接暴露技术标识。
- 语义资产页移除重复的“物理表列表”标题；元数据同步记录保留分页能力。
- Cube 详情移除重复的“双层语义建模 / 物理底座 / 业务语义层”解释块，保留基础信息、规模、维度、度量和影响范围。

### P2：回归验证与记录

- 新增或更新前端回归测试，覆盖 DataChat 技术字段隐藏、应用/订阅标签转换、权限文案映射、数据资产去重复、Cube 列表去链路展示、设置默认落点等路径。
- 补齐应用实例创建 smoke 契约，确保“创建实例”从应用市场跳转到预选应用表单，并展示“配置结构 / 配置内容 / 编辑 / 校验”的统一模块。
- 运行定向回归、i18n 校验和仓库统一变更验证，确认本轮治理不破坏语义层、应用中心、配置中心、数据中心和查询入口。

## 已验证项

- `make verify-changed`：通过。该入口按变更升级到仓库级验证，覆盖 `make verify-semantic`、`make verify`、`make verify-docs`。
- 后端与语义链路：语义专项 `468 passed, 3 skipped`；后端 API smoke `27 passed`；gateway 可观测契约 `11 passed`。
- 前端工程链路：ESLint 通过；v2 design token 检查通过；TypeScript 类型检查通过；`npm run build:v2` 生产构建通过。
- 前端回归：单元测试 `109 passed / 865 tests passed`；v2 cutover smoke `66 passed`；建模 Agent smoke `3 passed`；语义领域创建、发布、治理问题和数据资产底座真实 smoke 均通过。
- 文档健康：`scripts/check_docs_health.py --scope all` 通过，共检查 227 个 Markdown 文件；事实源口径守护通过，共检查 498 个文本文件。
- `npm run i18n:keys`
- `npm run test:unit -- src/v2/pages/chat/DataChat.test.tsx src/v2/pages/config/_shared/event-labels.test.ts src/v2/pages/config/_shared/config-detail-content.test.tsx src/v2/pages/settings/Settings.test.tsx src/v2/pages/semantic/assets/Assets.test.tsx src/v2/pages/semantic/cubes/Cubes.test.tsx src/v2/pages/config/access/AccessIdentity.copy.test.ts`
- `npm exec -- playwright test --config tests/e2e-v2/playwright.config.ts tests/e2e-v2/smoke/interaction-contract.spec.ts:542`

## 待继续治理项

以下项目本轮未作为阻塞项处理，原因是它们属于管理员、查询或开发诊断场景，不能简单一刀切删除：

- DevTools、Cube 编辑器、建模 Copilot 中的 SQL/YAML/JSON 证据，需要统一收敛为“高级诊断 / 审计证据”模式，并加权限边界。
- 数据源、数据集、抽取任务详情中的原始配置、SQL、运行日志，需要区分普通业务摘要和管理员诊断详情。
- 查询工作台、保存查询、导出任务里的 SQL 属于产品核心能力，不应隐藏，但需要继续治理说明文字和信息密度。
- `Schema`、`Trace`、`Gateway`、`API Key` 等术语在管理员场景仍合理存在，后续可按角色做文案分层。

## 工程原则复盘

- KISS：普通业务页面只展示业务对象、状态和下一步动作，复杂证据不混在主路径里。
- YAGNI：本轮不新增新的全局设计系统，只复用现有 `Table`、`ListPagination`、`Chip`、`Button`、`Select` 等组件完成治理。
- SOLID：展示标签转换沉到共享 helper，避免页面组件各自理解应用编码、分类和执行方式。
- DRY：应用标签、执行方式标签、行级范围摘要统一复用格式化函数，降低后续枚举扩展成本。

## 结论

本轮已完成上线前最影响用户心智的界面治理：主路径不再把内部路由、底层 ID、执行枚举和概念说明当作产品内容展示；数据中心、语义资产、应用中心、配置中心的操作路径更一致。剩余问题集中在高级诊断和查询类页面，应作为下一轮“管理员证据面板治理”处理，而不是继续在普通业务页零散修补。
