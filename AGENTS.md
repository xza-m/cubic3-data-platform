
# AGENTS 地图

本文件是 agent 的首要入口，负责告诉 agent 先看什么、信什么、下一步去哪里读。
本文件只做导航和工作约束，不复制知识库内容。
当前主线是 `React SPA + Flask API + PostgreSQL/Redis/RQ` 的分层数据平台，重点覆盖语义建模、查询体验和异步数据任务，不再以 Jinja 页面渲染为主。
`docs/` 是项目级知识库：当前事实放基线文档，设计输入放 `docs/prd/` 与 `docs/reference-design/`，历史过程放 `docs/archive/`。

## 1. 首先看哪里

按这个顺序建立上下文：

1. `README.md`：项目总览、当前架构、关键入口。
2. `docs/readme.md`：知识库首页、目录分层和推荐阅读顺序。
3. `docs/DOC_ALIGNMENT_REPORT.md`：确认哪些文档是当前基线，哪些只是历史记录。
4. `docs/TECH_STACK_AND_ARCHITECTURE.md`：理解当前前后端分层、部署拓扑与主技术栈。
5. `docs/architecture/README.md`：理解当前系统设计、模块边界和架构决策。
6. `docs/QUICK_START.md` 或 `docs/STARTUP_GUIDE.md`：按目标选择最短启动路径或完整启动说明。
7. `frontend/README.md`：前端目录、脚本、代理和调试约定。

按任务继续深入：

- 新能力、跨模块契约变化、架构调整：先看 `docs/prd/README.md`、`docs/architecture/README.md`，必要时补专题设计说明
- 产品范围、业务背景、设计目标：`docs/prd/README.md`
- 系统设计、模块边界、当前 ADR：`docs/architecture/README.md`
- 验证矩阵与统一测试入口：`docs/quality/testing.md`
- 本地运行与专项联调：`docs/runbooks/local-dev.md`
- 参考设计与未完全落地草案：`docs/reference-design/README.md`
- 历史迁移、阶段总结、一次性修复：`docs/archive/README.md`
- 语义中心验证路径：`docs/semantic_verification.md`
- 后端应用入口：`app/__init__.py`、`app/interfaces/api/v1/`、`app/di/container.py`
- 前端应用入口：`frontend/src/main.tsx`、`frontend/src/App.tsx`、`frontend/src/api/client.ts`
- 语义中心页面：`frontend/src/pages/Semantic/`

## 2. 开发工作流

1. 改代码前先读受影响的基线文档和对应代码入口；如果涉及新能力、跨模块契约变化、架构调整或较大范围设计决策，先补设计说明，再改代码。
2. 实现时保持最小改动面，优先复用现有分层与模块边界，不顺手重写无关代码。
3. 改动完成后优先使用仓库根目录 `make` 固定入口执行校验，不直接猜测子目录脚本；优先用 `make verify-detect` / `make verify-changed` 选择对应 `make verify-*`，跨域或影响面不明时再回到仓库级 `make verify`。仅在专项定位问题时再下钻到对应层级或子目标。
4. 提交前同步更新受影响文档，并在结论里说明已验证项、未验证项和阻塞原因。

## 3. 不可违背的规则

- `AGENTS.md` 只做地图，不做知识库副本；详细事实统一写入 `docs/`。
- `docs/readme.md` 是知识库首页；`docs/architecture/` 保存当前系统设计和 ADR；`docs/prd/` 只放设计输入，必须写状态；`docs/reference-design/` 只做参考，不代表当前实现；`docs/archive/` 只存历史记录，不作为当前标准；`docs/archive/legacy/` 用于继续下沉根层遗留的历史专题。
- 修改启动方式、端口、代理、脚本、关键路由、关键 API 后，必须同步检查 `README.md`、`docs/QUICK_START.md`、`docs/STARTUP_GUIDE.md`、`docs/DOC_ALIGNMENT_REPORT.md`、`frontend/README.md`。
- 修改系统边界、分层、运行拓扑、异步执行模型或语义持久化方式后，必须同步检查 `docs/TECH_STACK_AND_ARCHITECTURE.md` 与 `docs/architecture/`。
- 文档与实现冲突时，以当前代码和运行结果为准，并回写基线文档；不要直接把历史文档当现状。
- 新增文档前先判断归属：当前基线、设计输入、专题说明或历史归档；不要把一次性总结继续堆进首页。
- 关键入口文档必须维护最小元数据：`doc_type`、`status`、`source_of_truth`、`owner`、`last_reviewed`；自动化只依赖这些元数据，不再维护第二套导航。
- 默认校验入口以仓库根目录 `Makefile` 为准：能用 `make setup` / `make lint` / `make typecheck` / `make test` / `make smoke` / `make verify` / `make verify-*` / `make verify-detect` / `make verify-changed` / `make review` 时，不直接拼装零散命令。
- `AGENTS.md` 只定义验证原则、完成标准和统一入口引用，不维护路径匹配、规则表或执行脚本细节；具体验证规则见 `docs/quality/testing.md`，自动路由由 `scripts/checks/changed_validation.py` 读取规则表执行。
- 四层校验语义固定如下：`make lint` 只负责静态检查，`make typecheck` 只负责类型与接口检查，`make test` 只负责自动化测试，`make smoke` 只负责运行验证；不要把不同层的逻辑重新混回一个黑箱脚本。
- 不要把仓库工作流绑定到特定 agent 框架；需要规划流程时，把设计说明落到 `docs/prd/`、`docs/architecture/` 或对应专题文档。
- 后端新实体禁止继承 `db.Model`：领域行为放 `app/domain/entities/`（纯 Python），ORM 列定义放 `app/infrastructure/models/`；示范模块见 `app/domain/entities/datasource_behavior.py` 与 `app/infrastructure/models/datasource.py`。

## 4. 完成标准

- 改动必须直接完成任务目标，不引入无关的大范围改动、重复实现或绕开现有约束。
- 必需验证必须已执行并通过；具体验证入口与矩阵以 `docs/quality/testing.md` 为准。
- 行为、接口、工作流、配置或开发方式变更时，相关文档必须同步更新。
- 标记任务完成前，不应存在明显已知回归、未解释的失败检查或未处理的关键问题。
- 若有检查无法运行，必须明确说明原因、风险和当前结论；不要把“已实现但未验证”表述为“已完成”。

## 5. 按任务类型的附加要求

- Bug 修复：修复根因，并补充或更新回归验证。
- 新功能：覆盖核心路径；涉及用户可见行为、接口或配置时同步更新说明。
- 重构：保持既有外部行为不变，除非任务明确要求变更。
- API / Schema / 契约变更：补充兼容性或契约验证，并更新相关文档。
- 前后端联动或关键链路改动：补充跨域验证。
- 构建、工具链或配置改动：保证默认开发流程仍可用，并更新相关说明。
- 文档改动：保持与当前实现一致，不保留未标记的过期规则。

## 6. 非完成状态

出现以下任一情况时，不应将任务视为完成：

- 只完成了部分目标路径。
- 缺少要求的验证。
- 有失败检查但未修复、未说明或未明确接受。
- 行为已改变但文档未更新。
- 改动范围明显超出任务目标。

详细验证规则见 `docs/quality/testing.md`。  
Review 规则见 `docs/quality/review.md`。  
本地开发与运行方式见 `docs/runbooks/local-dev.md`。
