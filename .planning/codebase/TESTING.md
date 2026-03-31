# 测试说明

## 范围与依据

- 以 `docs/quality/testing.md`、`Makefile`、`pytest.ini`、`frontend/package.json`、`frontend/vitest.config.ts`、`frontend/playwright.config.ts`、`tests/conftest.py` 为主依据
- 这里只记录当前可执行的测试方式、目录分布、常见 mock 方式和已知限制
- 历史测试记录放在 `docs/archive/`，不作为当前默认策略

## 测试框架

- 后端使用 `pytest`
- 前端单元测试使用 `Vitest`
- 前端组件测试通常配合 `React Testing Library`
- 前端浏览器验证使用 `Playwright`
- 后端测试覆盖率由 `pytest.ini` 统一配置，默认门槛是 `--cov-fail-under=90`

## 测试目录

- 后端单元测试：`tests/unit/`
- 后端集成测试：`tests/integration/`
- 后端测试配置：`tests/conftest.py`
- 前端单元测试：`frontend/src/**/*.test.ts`、`frontend/src/**/*.test.tsx`
- 前端 E2E 与视觉回归：`frontend/tests/e2e-node/`
- 前端测试初始化：`frontend/src/test/setup.ts`

## 根目录命令

- `make test-unit-backend`：运行 `tests/unit`
- `make test-integration-backend`：运行 `tests/integration`
- `make smoke-backend`：运行 `tests/integration/test_api_routes_smoke.py`
- `make coverage-backend`：运行后端完整覆盖率
- `make lint-frontend`：前端 ESLint
- `make typecheck-frontend`：前端 `tsc --noEmit`
- `make test-unit-frontend`：前端 Vitest 单测
- `make smoke-frontend`：前端壳层 Playwright smoke
- `make test-regression-platform-layout`：平台壳层回归
- `make test-regression-platform-data`：数据中心回归
- `make test-regression-platform-query`：查询中心回归
- `make test-regression-semantic`：语义中心回归
- `make smoke-semantic`：语义中心关键路径 smoke
- `make verify`：`lint -> typecheck -> test -> smoke`
- `make verify-backend`、`make verify-frontend`、`make verify-semantic`：按范围收口
- `make verify-detect`、`make verify-changed`：按变更范围自动路由最低必跑目标
- `make docs-health`、`make docs-impact`：文档健康与影响检查

## 前端脚本

- `cd frontend && npm run test:unit`
- `cd frontend && npm run test:unit:coverage`
- `cd frontend && npm run test:e2e`
- `cd frontend && npm run test:visual`
- `cd frontend && npm run test:visual:platform`
- `cd frontend && npm run verify:ui`
- `cd frontend && npm run verify:platform-layout`
- `cd frontend && npm run verify:platform-data-inventory`
- `cd frontend && npm run verify:platform-query-workbench`
- `cd frontend && npm run verify:semantic-layout`
- `cd frontend && npm run verify:semantic`

## 配置与默认行为

- `pytest.ini` 默认扫描 `tests/`
- `pytest.ini` 使用 `python_files = test_*.py`、`python_classes = Test*`、`python_functions = test_*`
- `pytest.ini` 默认启用 `asyncio_mode = auto`
- `frontend/vitest.config.ts` 只收集 `src/**/*.test.ts` 和 `src/**/*.test.tsx`
- `frontend/vitest.config.ts` 使用 `jsdom`、`globals: true` 和 `src/test/setup.ts`
- `frontend/playwright.config.ts` 默认仅跑 `chromium`
- `frontend/playwright.config.ts` 默认 baseURL 来自 `DOMAIN_SMOKE_BASE_URL`，未设置时为 `http://127.0.0.1:3100`
- `frontend/playwright.config.ts` 在本地地址下会自动拉起 `npm run dev`

## 后端测试实践

- `tests/conftest.py` 用 SQLite 内存库做隔离，避免依赖真实 PostgreSQL
- `tests/conftest.py` 通过 `FLASK_TESTING=1` 阻止调度器和种子逻辑在测试里启动
- `tests/conftest.py` 提供 `client`、`app`、`db_session`、`mock_container`、`test_container` 等 fixture
- `tests/conftest.py` 会在 session 级强制导入 SQLAlchemy 实体，避免 mapper 注册顺序问题
- 常见 mock 模式是 `MagicMock`、`patch`、`monkeypatch`
- 集成烟测通常只验证路由已注册且返回非 404，不把业务断言放在烟测里
- `tests/unit/application/*/*_handler_coverage.py` 这类测试专门覆盖 handler 的成功、失败和边界路径

## 前端测试实践

- 页面测试通常包一层 `MemoryRouter`
- 依赖 React Query 的页面通常包一层 `QueryClientProvider`
- 外部 API 通常用 `vi.mock()` 隔离，必要时用 `vi.hoisted()` 先准备 mock 函数
- 通用组件测试常通过 `screen.getByRole()`、`getByTestId()`、`within()` 断言
- E2E 测试常用 `prepareAuthenticatedPage()` 预置 `auth_token`
- 语义中心 E2E 会通过 helper 直接操作页面并创建或修改资产，属于有副作用测试
- 视觉回归会使用 `toHaveScreenshot()`，并对部分页面设置 `mask`、`maxDiffPixels` 或隐藏光标

## Smoke 与回归覆盖

- `frontend/tests/e2e-node/platform-shell.spec.ts` 覆盖平台壳层导航
- `frontend/tests/e2e-node/platform.visual.spec.ts` 覆盖平台首屏视觉基线
- `frontend/tests/e2e-node/platform-data-inventory.spec.ts` 覆盖数据中心库存路径
- `frontend/tests/e2e-node/platform-query-analysis.spec.ts` 覆盖查询中心与问数路径
- `frontend/tests/e2e-node/semantic.visual.spec.ts` 覆盖语义中心视觉基线
- `frontend/tests/e2e-node/domain-creation.spec.ts`、`domain-publish.spec.ts`、`cube-draft.spec.ts` 覆盖语义关键流程
- `make smoke-semantic` 对应 `npm run e2e:domain-smoke`、`npm run e2e:domain-publish-smoke`、`npm run e2e:cube-draft-smoke`

## Fixtures 与 Mock 约定

- 后端测试优先通过 fixture 注入依赖，不直接访问外部数据库、Redis 或真实队列
- 前端单测优先 mock API 模块，而不是 mock 整个页面树
- 页面测试里若依赖路由参数或导航，应显式 mock `useNavigate` 或使用 `MemoryRouter`
- 若组件依赖第三方 UI 基础库，常见做法是把外围库替换成轻量 stub，例如 `overlayscrollbars-react`
- 推断：仓库更偏向“测试时 mock 边界、保留组件内部行为”这种风格，而不是大量 snapshot 断言

## 已知限制

- `Makefile` 里后端统一 lint、后端统一 typecheck、部分静态专项目前是 `skip`
- 前端没有独立的集成测试目录，`frontend` 的测试主要由单测、Playwright E2E 和视觉回归组成
- `make smoke-semantic` 会创建或更新语义资产，不是无副作用的 hermetic smoke
- Playwright 当前只配置了 Chromium，未见跨浏览器矩阵
- 视觉回归依赖本地字体、渲染和截图环境，失败时需优先排查环境差异
- `docs/quality/testing.md` 明确指出 coverage 是专项验证，不并入默认四层入口

