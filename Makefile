.DEFAULT_GOAL := help

SHELL := /bin/bash

PYTHON ?= python
NPM ?= npm
FRONTEND_DIR := frontend
DOMAIN_SMOKE_BASE_URL ?= http://127.0.0.1:3000
VERIFY_FILES ?=
VERIFY_BASE ?=
VERIFY_CONTEXT := $(if $(VERIFY_BASE),--base-ref $(VERIFY_BASE),$(if $(strip $(VERIFY_FILES)),,--worktree))

.PHONY: \
	help \
	setup \
	lint \
	typecheck \
	test \
	test-backend \
	test-frontend \
	smoke \
	verify \
	verify-backend \
	verify-frontend \
	verify-cutover \
	verify-docs \
	verify-detect \
	verify-changed \
	review \
	verify-semantic \
	semantic-layout \
	smoke-semantic \
	docs-health \
	docs-impact \
	static \
	lint-frontend \
	lint-backend \
	static-eslint \
	static-format \
	static-imports \
	static-patterns \
	static-schema \
	typecheck-frontend \
	typecheck-backend \
	typecheck-contracts \
	test-unit \
	test-unit-backend \
	test-unit-frontend \
	test-integration \
	test-integration-backend \
	test-integration-frontend \
	test-regression \
	test-regression-platform-layout \
	test-regression-platform-data \
	test-regression-platform-query \
	test-regression-semantic \
	smoke-backend \
	smoke-frontend \
	smoke-observability \
	coverage \
	coverage-backend \
	coverage-frontend

help:
	@printf '%s\n' '可用目标:'
	@printf '  %-26s %s\n' 'make setup' '安装 Python / 前端依赖；首次创建 .env；安装 Playwright Chromium'
	@printf '  %-26s %s\n' 'make lint' '层 1：静态检查总入口（lint / formatting / imports / patterns / schema）'
	@printf '  %-26s %s\n' 'make typecheck' '层 2：类型与接口检查总入口（TS / Python / contracts）'
	@printf '  %-26s %s\n' 'make test' '层 3：自动化测试总入口（unit / integration / regression）'
	@printf '  %-26s %s\n' 'make smoke' '层 4：运行验证总入口（backend API / frontend shell / observability）'
	@printf '  %-26s %s\n' 'make verify' '顺序执行 lint -> typecheck -> test -> smoke'
	@printf '  %-26s %s\n' 'make verify-backend' '后端交付入口（backend lint/typecheck/test/smoke）'
	@printf '  %-26s %s\n' 'make verify-frontend' '前端交付入口（frontend lint/typecheck/test/smoke）'
	@printf '  %-26s %s\n' 'make verify-cutover' 'Round 3 Day 0 cutover 专用闸门（v2-only · scripts/cutover/deploy.sh 调用）'
	@printf '  %-26s %s\n' 'make verify-docs' '文档交付入口（docs-health）'
	@printf '  %-26s %s\n' 'make verify-detect' '按 VERIFY_FILES 或 VERIFY_BASE 指定的 diff 检测命中的验证规则'
	@printf '  %-26s %s\n' 'make verify-changed' '按 VERIFY_FILES 或 VERIFY_BASE 指定的 diff 执行最低必跑 verify-* 目标'
	@printf '  %-26s %s\n' 'make review' '审阅前总入口（verify + docs-health + docs-impact）'
	@printf '  %-26s %s\n' 'make verify-semantic' '语义中心专项总入口（共享层 + 语义回归 + 语义 smoke）'
	@printf '  %-26s %s\n' 'make semantic-layout' '语义中心布局与交互回归'
	@printf '  %-26s %s\n' 'make smoke-semantic' '语义中心关键路径运行验证'
	@printf '  %-26s %s\n' 'make coverage' 'coverage 聚合入口（backend + frontend，可选，不并入默认四层）'
	@printf '  %-26s %s\n' 'make coverage-backend' '后端完整 pytest 覆盖率基线 + 模块守护检查（可选，不并入默认四层）'
	@printf '  %-26s %s\n' 'make coverage-frontend' '前端单元测试 coverage 基线 + 核心页守护检查（可选，不并入默认四层）'
	@printf '  %-26s %s\n' 'make docs-impact' '检查当前改动是否遗漏关键知识库文档更新'
	@printf '%s\n' ''
	@printf '%s\n' '分层子目标:'
	@printf '  %-26s %s\n' 'make lint-frontend' '前端静态检查'
	@printf '  %-26s %s\n' 'make lint-backend' '后端静态检查（当前未配置时显式 skip）'
	@printf '  %-26s %s\n' 'make static-eslint' '前端 ESLint'
	@printf '  %-26s %s\n' 'make typecheck-frontend' '前端 TypeScript 类型检查'
	@printf '  %-26s %s\n' 'make test-unit' '单元测试聚合'
	@printf '  %-26s %s\n' 'make test-integration' '集成测试聚合'
	@printf '  %-26s %s\n' 'make test-regression' '平台定向回归聚合'
	@printf '  %-26s %s\n' 'make test-backend' '后端自动化测试聚合'
	@printf '  %-26s %s\n' 'make test-frontend' '前端自动化测试聚合'
	@printf '  %-26s %s\n' 'make test-regression-semantic' '语义中心定向回归'
	@printf '  %-26s %s\n' 'make smoke-backend' '后端关键 API smoke'
	@printf '  %-26s %s\n' 'make smoke-frontend' '前端平台壳层 smoke'
	@printf '  %-26s %s\n' 'make docs-health' '文档健康检查'

setup:
	@if [ ! -f .env ]; then cp env.sample .env; echo '已根据 env.sample 创建 .env'; else echo '.env 已存在，跳过复制'; fi
	$(PYTHON) -m pip install -r requirements.txt
	cd $(FRONTEND_DIR) && $(NPM) install
	cd $(FRONTEND_DIR) && $(NPM) exec -- playwright install chromium

lint: static

static: lint-frontend lint-backend static-format static-imports static-patterns static-schema

lint-frontend:
	@printf '%s\n' '[layer1][eslint] 运行前端 ESLint'
	cd $(FRONTEND_DIR) && $(NPM) run lint

lint-backend:
	@printf '%s\n' '[layer1][backend] skip: 当前仓库未配置统一后端 lint 入口'

static-eslint: lint-frontend

static-format:
	@printf '%s\n' '[layer1][format] skip: 当前仓库未配置统一 formatting 入口'

static-imports:
	@printf '%s\n' '[layer1][imports] skip: 当前仓库未配置独立 imports 检查入口'

static-patterns:
	@printf '%s\n' '[layer1][patterns] skip: 当前仓库未配置 forbidden patterns 检查入口'

static-schema:
	@printf '%s\n' '[layer1][schema] skip: 当前仓库未配置独立基础 schema 校验入口'

typecheck: typecheck-frontend typecheck-backend typecheck-contracts

typecheck-frontend:
	@printf '%s\n' '[layer2][frontend] 运行 TypeScript 类型检查'
	cd $(FRONTEND_DIR) && $(NPM) exec -- tsc --noEmit --pretty false

typecheck-backend:
	@printf '%s\n' '[layer2][backend] skip: 当前仓库未配置 mypy / pyright 统一入口'

typecheck-contracts:
	@printf '%s\n' '[layer2][contracts] skip: 当前仓库未配置 OpenAPI / protobuf / GraphQL 一致性检查'

test: test-unit test-integration test-regression

test-backend: test-unit-backend test-integration-backend

test-frontend: test-unit-frontend test-integration-frontend test-regression

test-unit: test-unit-backend test-unit-frontend

test-unit-backend:
	@printf '%s\n' '[layer3][unit][backend] 运行后端单元测试 tests/unit'
	PYTHONPATH=. $(PYTHON) -m pytest --no-cov tests/unit

test-unit-frontend:
	@printf '%s\n' '[layer3][unit][frontend] 运行前端单元测试'
	cd $(FRONTEND_DIR) && $(NPM) run test:unit

test-integration: test-integration-backend test-integration-frontend

test-integration-backend:
	@printf '%s\n' '[layer3][integration][backend] 运行后端集成测试 tests/integration'
	PYTHONPATH=. $(PYTHON) -m pytest --no-cov tests/integration

test-integration-frontend:
	@printf '%s\n' '[layer3][integration][frontend] skip: 当前仓库未定义独立前端集成测试集合'

test-regression: \
	test-regression-platform-layout \
	test-regression-platform-data \
	test-regression-platform-query

test-regression-platform-layout:
	@printf '%s\n' '[layer3][regression][platform-layout] DEPRECATED · v2 cutover 已完成（W4），legacy src/pages 不复存在；请改用 make verify-cutover'

test-regression-platform-data:
	@printf '%s\n' '[layer3][regression][platform-data] DEPRECATED · 同上 · 请改用 make verify-cutover'

test-regression-platform-query:
	@printf '%s\n' '[layer3][regression][platform-query] DEPRECATED · 同上 · 请改用 make verify-cutover'

test-regression-semantic:
	@printf '%s\n' '[layer3][regression][semantic] DEPRECATED · v2 cutover 已完成（W4），legacy src/pages/Semantic 与 semantic.visual.spec.ts 不复存在；请改用 make verify-cutover'

smoke: smoke-backend smoke-frontend smoke-observability

smoke-backend:
	@printf '%s\n' '[layer4][backend] 运行后端关键 API smoke'
	PYTHONPATH=. $(PYTHON) -m pytest --no-cov tests/integration/test_api_routes_smoke.py

smoke-frontend:
	@printf '%s\n' '[layer4][frontend] 运行前端 v2 cutover smoke (Round 3 W6.A · scripts/cutover/deploy.sh 走该 6/6 用例)'
	cd $(FRONTEND_DIR) && $(NPM) run e2e:smoke

smoke-observability:
	@printf '%s\n' '[layer4][observability] skip: 当前仓库未配置统一可观测阈值校验'

semantic-layout: test-regression-semantic

smoke-semantic:
	@printf '%s\n' '[contract][semantic-smoke] 需要前端开发服务、最新后端代码和可写语义目录；该 smoke 会创建或更新草稿/测试资产，不属于默认 repo smoke'
	@printf '%s\n' '[layer4][semantic] 运行语义中心关键路径 smoke'
	cd $(FRONTEND_DIR) && DOMAIN_SMOKE_BASE_URL=$(DOMAIN_SMOKE_BASE_URL) $(NPM) run e2e:domain-smoke
	cd $(FRONTEND_DIR) && DOMAIN_SMOKE_BASE_URL=$(DOMAIN_SMOKE_BASE_URL) $(NPM) run e2e:domain-publish-smoke
	cd $(FRONTEND_DIR) && DOMAIN_SMOKE_BASE_URL=$(DOMAIN_SMOKE_BASE_URL) $(NPM) run e2e:cube-draft-smoke

verify: lint typecheck test smoke

verify-backend: lint-backend typecheck-backend test-backend smoke-backend

verify-frontend: lint-frontend typecheck-frontend test-frontend smoke-frontend

# Round 3 W6 · cutover Day 0 专用闸门：只跑 v2 相关检查，不依赖 legacy regression。
# 与 verify-frontend 的差异：
#   - 不跑 test-regression-platform-* / test-regression-semantic（legacy spec 已 DEPRECATED）
#   - 跑 v2 范围 vitest（components / hooks / lib / pages / api / observability）
#   - 跑 v2 cutover smoke (e2e:smoke 6/6)
# 任一项失败即 fail-fast。scripts/cutover/deploy.sh 调用此目标。
verify-cutover:
	@printf '%s\n' '[cutover][gate] Round 3 Day 0 专用前端闸门启动'
	cd $(FRONTEND_DIR) && $(NPM) run lint
	cd $(FRONTEND_DIR) && $(NPM) exec -- tsc --noEmit --pretty false
	cd $(FRONTEND_DIR) && $(NPM) run lint:css
	cd $(FRONTEND_DIR) && $(NPM) run check:v2-tokens
	cd $(FRONTEND_DIR) && $(NPM) exec -- vitest run src/v2 --reporter=basic
	cd $(FRONTEND_DIR) && $(NPM) run e2e:smoke
	@printf '%s\n' '[cutover][gate] verify-cutover 通过'

verify-docs: docs-health

verify-detect:
	@printf '%s\n' '[routing] 检测当前改动命中的验证规则并输出建议目标'
	$(PYTHON) scripts/checks/changed_validation.py $(VERIFY_CONTEXT) $(VERIFY_FILES)

verify-changed:
	@printf '%s\n' '[routing] 按规则检测结果执行当前改动的最低必跑交付入口'
	$(PYTHON) scripts/checks/changed_validation.py --execute $(VERIFY_CONTEXT) $(VERIFY_FILES)

verify-semantic: verify-backend verify-frontend test-regression-semantic smoke-semantic

coverage: coverage-backend coverage-frontend

coverage-backend:
	@printf '%s\n' '[coverage][backend] 运行后端完整 pytest 覆盖率基线'
	PYTHONPATH=. $(PYTHON) -m pytest tests
	@printf '%s\n' '[coverage][backend] 校验总门槛、模块均匀度和核心模块守护约束'
	$(PYTHON) scripts/checks/backend_coverage_guard.py

coverage-frontend:
	@printf '%s\n' '[coverage][frontend] 运行前端单元测试 coverage 基线'
	cd $(FRONTEND_DIR) && $(NPM) run test:unit:coverage
	@printf '%s\n' '[coverage][frontend] 校验总门槛和核心功能页守护约束'
	$(PYTHON) scripts/checks/frontend_coverage_guard.py

docs-health:
	@printf '%s\n' '[docs] 运行文档健康检查'
	$(PYTHON) scripts/check_docs_health.py --scope all

docs-impact:
	@printf '%s\n' '[docs] 运行文档影响检查'
	$(PYTHON) scripts/checks/doc_impact.py $(if $(VERIFY_BASE),--base-ref $(VERIFY_BASE),) $(VERIFY_FILES)

review: verify verify-docs docs-impact
