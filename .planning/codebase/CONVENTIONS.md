# 代码约定

## 范围与依据

- 以当前代码和基线文档为准，主要参考 `README.md`、`docs/TECH_STACK_AND_ARCHITECTURE.md`、`docs/architecture/README.md`、`frontend/README.md`、`docs/quality/testing.md`
- 历史材料放在 `docs/archive/` 和 `docs/archive/legacy/`，只用于背景，不作为当前实现规范
- 以下约定中，凡标注“推断”的内容，表示仓库现状一致但未见独立强制工具规则，属于归纳出的工作约定

## 语言与风格

- 后端以 Python 为主，前端以 TypeScript 为主，文档与注释以中文为主
- Python 文件使用 `snake_case`，类名使用 `PascalCase`，常量使用全大写；前端组件与页面文件使用 `PascalCase`，测试文件常用 `*.page.test.tsx`、`*.test.ts`
- 代码优先保持短函数、短文件、单一职责，避免把应用逻辑和基础设施逻辑混写
- 现有代码广泛使用类型注解、接口类型和显式返回值；新增代码应沿用同样的可读性标准
- 推断：仓库没有统一强制的 formatter 约束文档，但现有 Python 与 TypeScript 代码都倾向于简洁、显式、少嵌套的写法

## 分层规则

- 后端主分层是 `app/application`、`app/domain`、`app/infrastructure`、`app/interfaces`
- `app/domain` 只放实体、领域服务、端口和领域事件，不直接依赖 Flask、SQLAlchemy 适配器或外部服务实现
- `app/application` 负责命令、查询、处理器和编排，通常只依赖领域端口和基础设施接口
- `app/infrastructure` 放仓储实现、缓存、队列、LLM 适配器、事件总线、语义 YAML 仓库等实现细节
- `app/interfaces/api/v1/` 只负责 HTTP 暴露和路由组装，推荐保持薄控制器风格
- 依赖装配集中在 `app/di/container.py`，App Factory 在 `app/__init__.py`
- 前端主入口是 `frontend/src/main.tsx`、`frontend/src/App.tsx`、`frontend/src/api/client.ts`

## 命名与目录约定

- Flask Blueprint 通常命名为 `bp`，并放在对应接口模块内，例如 `app/interfaces/api/v1/datasets.py`
- 应用层处理器通常使用 `*Handler`，命令使用 `*Command`，查询使用 `*Query`
- 仓储接口一般放在 `app/domain/ports/repositories/`，实现放在 `app/infrastructure/repositories/`
- 前端 API 模块按业务域拆分到 `frontend/src/api/*.ts`
- 业务组件集中在 `frontend/src/components/business/`，页面级路由放在 `frontend/src/pages/`
- 语义中心相关页面、状态与测试集中在 `frontend/src/pages/Semantic/`
- 页面跳转与壳层布局由 `frontend/src/components/Layout/AppLayout.tsx` 和 `frontend/src/components/auth/ProtectedRoute.tsx` 管理

## API 设计模式

- 后端响应应优先使用 `app/shared/response.py` 的 `success()`、`error()`、`created()` 等封装，保持统一 JSON 结构
- 统一错误出口由 `app/interfaces/api/middleware/error_handler.py` 处理，自定义异常定义在 `app/shared/exceptions.py`
- 成功响应约定为 `{'code': 0, 'message': '...', 'data': ...}`，失败响应约定为 `{'code': -1, 'message': '...', 'details': ...}`，并尽量附带 `trace_id`
- 前端统一通过 `frontend/src/api/client.ts` 访问后端，默认 baseURL 为 `/api/v1`
- 前端拦截器负责注入 `auth_token`、处理 401 跳转、超时、网络错误和已知接口缺失提示
- API 模块应按业务域封装参数和返回类型，不直接在页面里散写 `axios` 调用

## 组件与页面模式

- 前端以 React SPA 为主，路由集中在 `frontend/src/App.tsx`
- 页面级组件优先懒加载，公共壳层统一走 `AppLayout`
- 通用 UI 基础组件位于 `frontend/src/components/ui/`，业务包装组件位于 `frontend/src/components/business/`
- 复用逻辑优先抽到 `frontend/src/hooks/`、`frontend/src/utils/`、`frontend/src/components/business/`
- 页面与组件测试通常使用 React Testing Library + Vitest，路由与异步数据依赖通过 `QueryClientProvider`、`MemoryRouter`、`vi.mock` 进行隔离
- 推断：仓库偏好“组合基础 UI 原语 + 业务封装”的方式，而不是直接回到 Ant Design 这类大而全组件栈

## 错误处理与可观测性

- 后端业务异常优先抛出 `app/shared/exceptions.py` 中的类型化异常，不要在控制器里吞错
- 记录日志时优先使用 `app/shared/utils/logger.py` 的结构化日志能力
- 请求上下文会注入 `request_id`，并在响应中回传 `trace_id`
- `app/__init__.py` 会在请求开始时建立请求上下文，在请求结束时清理上下文；新增代码应避免绕开这一流程
- 仓储和基础设施层遇到异常时应明确记录上下文，并在必要时回滚事务

## 文档更新期望

- 影响启动方式、端口、代理、脚本、路由、API 路径、验证入口或架构分层时，必须同步检查 `README.md`、`docs/QUICK_START.md`、`docs/STARTUP_GUIDE.md`、`docs/DOC_ALIGNMENT_REPORT.md`、`frontend/README.md`
- 影响系统边界、运行拓扑、异步任务模型、语义持久化方式时，必须同步检查 `docs/TECH_STACK_AND_ARCHITECTURE.md` 与 `docs/architecture/README.md`
- 影响验证入口、覆盖范围、smoke、coverage 或评审门槛时，必须同步检查 `docs/quality/testing.md`、`docs/quality/backend-coverage.md`、`docs/quality/review.md`、`docs/runbooks/local-dev.md`
- 新文档先判断归属：当前基线、架构说明、专题资料或历史归档，不要把一次性过程记录继续堆到首页

## 仓库工作流约束

- 统一验证入口以根目录 `Makefile` 为准，优先使用 `make setup`、`make lint`、`make typecheck`、`make test`、`make smoke`、`make verify`、`make verify-*`
- 改动范围不清楚时，优先用 `make verify-detect` 和 `make verify-changed` 路由到最低必跑目标
- `make lint`、`make typecheck`、`make test`、`make smoke` 的四层语义不要混用
- `make coverage` 和 `make coverage-*` 属于专项验证，不并入默认交付入口
- 仅文档改动也要检查文档健康和文档影响，必要时运行 `make verify-docs`、`make docs-impact`
- 不要手改 `docs/archive/` 里的历史结论来充当前基线；若历史结论已落地，应回写到当前基线文档

