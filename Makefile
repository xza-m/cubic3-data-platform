.DEFAULT_GOAL := help

SHELL := /bin/bash

PYTHON ?= python
NPM ?= npm
FRONTEND_DIR := frontend
DOMAIN_SMOKE_BASE_URL ?= http://127.0.0.1:3102
VERIFY_FILES ?=
VERIFY_BASE ?=
VERIFY_CONTEXT := $(if $(VERIFY_BASE),--base-ref $(VERIFY_BASE),$(if $(strip $(VERIFY_FILES)),,--worktree))
SEMANTIC_PREFLIGHT_OBJECT ?= StudentComment
SEMANTIC_PREFLIGHT_METRIC ?= comment_count
SEMANTIC_PREFLIGHT_CUBE ?= student_comment_cube
SEMANTIC_PREFLIGHT_MEASURE ?= comment_count
SEMANTIC_PREFLIGHT_TABLE ?= df_cb_258187.dwd_interaction_comment_reports_df
AGENT_RUNTIME_LIVE_QUESTION ?= 查询最近7天学生评论数，按学校汇总
DATABASE_URL ?=
SEMANTIC_FIXTURE_NAMESPACE ?=
SEMANTIC_PROD_LIVE ?= 0

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
	fact-source-guard \
	review \
	verify-semantic \
	verify-semantic-prod \
	verify-semantic-prod-strict \
	semantic-prod-env-required \
	test-semantic-prod-registry \
	test-semantic-postgres-concurrency \
	test-agent-runtime \
	test-platform-agent-runtime \
	preflight-agent-runtime \
	live-agent-runtime \
	test-modeling-agent \
	smoke-semantic \
	smoke-semantic-live \
	semantic-baseline-dry-run \
	semantic-prod-readiness-report \
	semantic-fixture-cleanup \
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
	check-tokens-frontend \
	check-i18n-frontend \
	typecheck-frontend \
	typecheck-backend \
	typecheck-contracts \
	build-frontend \
	test-unit \
	test-unit-backend \
	test-unit-frontend \
	test-integration \
	test-integration-backend \
	test-integration-frontend \
	smoke-backend \
	smoke-frontend \
	smoke-access \
	smoke-observability \
	coverage \
	coverage-backend \
	coverage-frontend \
	coverage-report \
	local-ci \
	local-smoke

help:
	@printf '%s\n' '可用目标:'
	@printf '  %-26s %s\n' 'make setup' '安装 Python / 前端依赖；首次创建 .env；安装 Playwright Chromium'
	@printf '  %-26s %s\n' 'make lint' '层 1：静态检查总入口（lint / formatting / imports / patterns / schema）'
	@printf '  %-26s %s\n' 'make typecheck' '层 2：类型与接口检查总入口（TS / Python / contracts）'
	@printf '  %-26s %s\n' 'make test' '层 3：自动化测试总入口（unit / integration）'
	@printf '  %-26s %s\n' 'make smoke' '层 4：运行验证总入口（backend API / frontend shell / observability）'
	@printf '  %-26s %s\n' 'make verify' '顺序执行 lint -> typecheck -> test -> smoke'
	@printf '  %-26s %s\n' 'make verify-backend' '后端交付入口（backend lint/typecheck/test/smoke）'
	@printf '  %-26s %s\n' 'make verify-frontend' '前端交付入口（lint + tokens + i18n + tsc + build + test + smoke；是 local-ci 的严格超集）'
	@printf '  %-26s %s\n' 'make verify-cutover' 'Round 3 Day 0 cutover 专用闸门（v2-only · scripts/cutover/deploy.sh 调用）'
	@printf '  %-26s %s\n' 'make verify-docs' '文档交付入口（docs-health + fact-source-guard）'
	@printf '  %-26s %s\n' 'make verify-detect' '按 VERIFY_FILES 或 VERIFY_BASE 指定的 diff 检测命中的验证规则'
	@printf '  %-26s %s\n' 'make verify-changed' '按 VERIFY_FILES 或 VERIFY_BASE 指定的 diff 执行最低必跑 verify-* 目标'
	@printf '  %-26s %s\n' 'make review' '审阅前总入口（verify + docs-health + docs-impact）'
	@printf '  %-26s %s\n' 'make verify-semantic' '语义中心专项总入口（共享层 + 语义 smoke）'
	@printf '  %-26s %s\n' 'make verify-semantic-prod' '语义平台生产候选闸门（迁移 / nginx build / semantic verify / live opt-in / cleanup）'
	@printf '  %-26s %s\n' 'make verify-semantic-prod-strict' '语义平台上线前严格闸门（要求 DATABASE_URL / live smoke / fixture cleanup / PG 并发）'
	@printf '  %-26s %s\n' 'make semantic-prod-env-required' '校验严格上线前验证所需环境变量'
	@printf '  %-26s %s\n' 'make semantic-prod-readiness-report' '输出语义平台上线前补证 readiness 报告'
	@printf '  %-26s %s\n' 'make test-semantic-prod-registry' '语义生产化 SQL Registry / Publish Gate / Runtime Snapshot 单元与集成测试'
	@printf '  %-26s %s\n' 'make test-semantic-postgres-concurrency' '真实 PostgreSQL 发布并发与 active snapshot 约束测试（设置 DATABASE_URL 后执行）'
	@printf '  %-26s %s\n' 'make test-agent-runtime' 'Agent-first Runtime official 链路测试'
	@printf '  %-26s %s\n' 'make test-platform-agent-runtime' '平台 Agent 推理 Runtime 适配器、仓储、API 与 Codex opt-in smoke 测试'
	@printf '  %-26s %s\n' 'make preflight-agent-runtime' '真实环境 Agent Runtime 语义资产预检（不并入默认 verify）'
	@printf '  %-26s %s\n' 'make live-agent-runtime' '真实 MaxCompute 执行验收（opt-in，不并入默认 verify）'
	@printf '  %-26s %s\n' 'make test-modeling-agent' '建模助手 Copilot 与 Domain 上下文最小链路测试'
	@printf '  %-26s %s\n' 'make smoke-semantic' '语义中心关键路径运行验证'
	@printf '  %-26s %s\n' 'make smoke-semantic-live' 'Modeling Copilot live smoke（SEMANTIC_PROD_LIVE=1 时执行）'
	@printf '  %-26s %s\n' 'make coverage' 'coverage 聚合入口（backend + frontend，可选，不并入默认四层）'
	@printf '  %-26s %s\n' 'make coverage-backend' '后端完整 pytest 覆盖率 + ratchet 防倒退校验（scripts/backend_coverage_rules.json）'
	@printf '  %-26s %s\n' 'make coverage-frontend' '已退役 skip；前端守护由 vitest.config.ts 子树阈值承接'
	@printf '  %-26s %s\n' 'make coverage-report' 'opt-in：生成前后端覆盖率数字报告，不设阈值，仅供查看（~2-3 min）'
	@printf '  %-26s %s\n' 'make docs-impact' '检查当前改动是否遗漏关键知识库文档更新'
	@printf '%s\n' ''
	@printf '%s\n' '分层子目标:'
	@printf '  %-26s %s\n' 'make lint-frontend' '前端 ESLint'
	@printf '  %-26s %s\n' 'make lint-backend' '后端静态检查（当前未配置时显式 skip）'
	@printf '  %-26s %s\n' 'make static-eslint' '前端 ESLint（lint-frontend 别名）'
	@printf '  %-26s %s\n' 'make check-tokens-frontend' '前端 v2 CSS token 引用校验（scripts/check-v2-tokens.mjs）'
	@printf '  %-26s %s\n' 'make check-i18n-frontend' '前端 v2 i18n 覆盖率校验'
	@printf '  %-26s %s\n' 'make typecheck-frontend' '前端 TypeScript 类型检查'
	@printf '  %-26s %s\n' 'make build-frontend' '前端 v2 生产构建（vite build，作为类型/语法的最终把关）'
	@printf '  %-26s %s\n' 'make test-unit' '单元测试聚合'
	@printf '  %-26s %s\n' 'make test-integration' '集成测试聚合'
	@printf '  %-26s %s\n' 'make test-backend' '后端自动化测试聚合'
	@printf '  %-26s %s\n' 'make test-frontend' '前端自动化测试聚合'
	@printf '  %-26s %s\n' 'make smoke-backend' '后端关键 API smoke'
	@printf '  %-26s %s\n' 'make smoke-frontend' '前端平台壳层 smoke（== local-smoke）'
	@printf '  %-26s %s\n' 'make smoke-access' '权限体系产品闭环 smoke（Principal / API Key / DataPolicy / Agent）'
	@printf '  %-26s %s\n' 'make docs-health' '文档健康检查'
	@printf '  %-26s %s\n' 'make fact-source-guard' 'ADR-012 事实源口径守护'
	@printf '%s\n' ''
	@printf '%s\n' '本地闸门（GitLab CI 未就位时的替代入口）:'
	@printf '  %-26s %s\n' 'make local-ci' '本地等价 CI（verify-frontend 去掉 smoke/integration 的严格子集，~2 min，无需 docker）'
	@printf '  %-26s %s\n' 'make local-smoke' '本地 E2E 冒烟：smoke-frontend 别名（Playwright e2e:smoke；需前端在 :3000 可达）'

setup:
	@if [ ! -f .env ]; then cp env.sample .env; echo '已根据 env.sample 创建 .env'; else echo '.env 已存在，跳过复制'; fi
	$(PYTHON) -m pip install -r requirements.txt
	cd $(FRONTEND_DIR) && $(NPM) install
	cd $(FRONTEND_DIR) && $(NPM) exec -- playwright install chromium

lint: static

static: lint-frontend lint-backend check-tokens-frontend check-i18n-frontend static-format static-imports static-patterns static-schema

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

check-tokens-frontend:
	@printf '%s\n' '[layer1][tokens] 校验 v2 CSS 设计 token 引用'
	cd $(FRONTEND_DIR) && $(NPM) run check:v2-tokens

check-i18n-frontend:
	@printf '%s\n' '[layer1][i18n] 校验 v2 i18n 覆盖率'
	cd $(FRONTEND_DIR) && $(NPM) run i18n:coverage

typecheck: typecheck-frontend typecheck-backend typecheck-contracts

typecheck-frontend:
	@printf '%s\n' '[layer2][frontend] 运行 TypeScript 类型检查'
	cd $(FRONTEND_DIR) && $(NPM) exec -- tsc --noEmit --pretty false

typecheck-backend:
	@printf '%s\n' '[layer2][backend] skip: 当前仓库未配置 mypy / pyright 统一入口'

typecheck-contracts:
	@printf '%s\n' '[layer2][contracts] 校验 OpenAPI Agent 契约'
	PYTHONPATH=. $(PYTHON) scripts/checks/openapi_contracts.py

build-frontend:
	@printf '%s\n' '[layer2][build][frontend] 运行 v2 生产构建（vite build --config v2.vite.config.ts）'
	cd $(FRONTEND_DIR) && $(NPM) run build:v2

test: test-unit test-integration

test-backend: test-unit-backend test-integration-backend

test-frontend: test-unit-frontend test-integration-frontend

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

# Round 4 · D+21 cleanup：
#   原 `test-regression-platform-*` / `test-regression-semantic` DEPRECATED 目标
#   全部移除（legacy src/pages 已于本轮 `git rm -rf frontend/src/legacy`）。
#   替代命令：`make verify-cutover`（v2 闸门，含 alembic 拓扑自检）。

smoke: smoke-backend smoke-frontend smoke-observability

smoke-backend:
	@printf '%s\n' '[layer4][backend] 运行后端关键 API smoke'
	PYTHONPATH=. $(PYTHON) -m pytest --no-cov tests/integration/test_api_routes_smoke.py

smoke-frontend:
	@printf '%s\n' '[layer4][frontend] 运行前端 v2 cutover smoke (Round 3 W6.A · scripts/cutover/deploy.sh 走该 6/6 用例)'
	cd $(FRONTEND_DIR) && $(NPM) run e2e:smoke

smoke-access:
	@printf '%s\n' '[layer4][access] 运行权限体系产品闭环 smoke'
	PYTHONPATH=. $(PYTHON) -m pytest --no-cov tests/integration/access

smoke-observability:
	@printf '%s\n' '[layer4][observability] skip: 当前仓库未配置统一可观测阈值校验'

smoke-semantic:
	@printf '%s\n' '[contract][semantic-smoke] 领域 smoke 需要前端开发服务、最新后端代码和可写语义目录；Modeling Copilot smoke 使用 v2 Playwright mock 闭环；不属于默认 repo smoke'
	@printf '%s\n' '[layer4][semantic] 运行语义中心关键路径 smoke'
	cd $(FRONTEND_DIR) && DOMAIN_SMOKE_BASE_URL=$(DOMAIN_SMOKE_BASE_URL) $(NPM) run e2e:domain-smoke
	cd $(FRONTEND_DIR) && DOMAIN_SMOKE_BASE_URL=$(DOMAIN_SMOKE_BASE_URL) $(NPM) run e2e:domain-publish-smoke
	cd $(FRONTEND_DIR) && DOMAIN_SMOKE_BASE_URL=$(DOMAIN_SMOKE_BASE_URL) $(NPM) run e2e:governance-issues-smoke
	cd $(FRONTEND_DIR) && DOMAIN_SMOKE_BASE_URL=$(DOMAIN_SMOKE_BASE_URL) $(NPM) run e2e:data-assets-smoke
	cd $(FRONTEND_DIR) && $(NPM) run e2e:modeling-agent-smoke

verify: lint typecheck test smoke

verify-backend: lint-backend typecheck-backend test-backend smoke-backend

# Round 4 · D+28 consolidation：
#   verify-frontend 现在是 local-ci 的严格超集：
#     layer1 静态：lint-frontend + check-tokens-frontend + check-i18n-frontend
#     layer2 类型：typecheck-frontend + build-frontend（v2 生产构建）
#     layer3 测试：test-frontend（unit + integration）
#     layer4 冒烟：smoke-frontend（== local-smoke，v2 e2e:smoke）
verify-frontend: lint-frontend check-tokens-frontend check-i18n-frontend typecheck-frontend build-frontend test-frontend smoke-frontend

# Round 3 W6 · cutover Day 0 专用闸门：只跑 v2 相关检查。
# 与 verify-frontend 的差异：
#   - 跑 v2 范围 vitest（components / hooks / lib / pages / api / observability）
#   - 跑 v2 cutover smoke (e2e:smoke 6/6)
#   - Round 4 · T-005：在前端闸门外挂 alembic 拓扑离线自检，防分叉 head 到 Day 0
#   - Round 4 · D+21：legacy regression 目标全量移除，本目标是唯一前端前置闸门
# 任一项失败即 fail-fast。scripts/cutover/deploy.sh 调用此目标。
verify-cutover: verify-alembic
	@printf '%s\n' '[cutover][gate] Round 3 Day 0 专用前端闸门启动'
	cd $(FRONTEND_DIR) && $(NPM) run lint
	cd $(FRONTEND_DIR) && $(NPM) exec -- tsc --noEmit --pretty false
	cd $(FRONTEND_DIR) && $(NPM) run lint:css
	cd $(FRONTEND_DIR) && $(NPM) run check:v2-tokens
	cd $(FRONTEND_DIR) && $(NPM) exec -- vitest run src/v2 --reporter=basic
	cd $(FRONTEND_DIR) && $(NPM) run e2e:smoke
	@printf '%s\n' '[cutover][gate] verify-cutover 通过'

# Round 4 · T-005：alembic 迁移拓扑离线自检（无需 DB / Flask app）
# 触发场景：verify-cutover 依赖；开发者本地合迁移后可单跑 `make verify-alembic`
verify-alembic:
	@printf '%s\n' '[cutover][gate] alembic 拓扑离线自检（single head + no orphans）'
	$(PYTHON) scripts/checks/alembic_head_guard.py

verify-docs: docs-health fact-source-guard

verify-detect:
	@printf '%s\n' '[routing] 检测当前改动命中的验证规则并输出建议目标'
	$(PYTHON) scripts/checks/changed_validation.py $(VERIFY_CONTEXT) $(VERIFY_FILES)

verify-changed:
	@printf '%s\n' '[routing] 按规则检测结果执行当前改动的最低必跑交付入口'
	$(PYTHON) scripts/checks/changed_validation.py --execute $(VERIFY_CONTEXT) $(VERIFY_FILES)

test-modeling-agent:
	@printf '%s\n' '[layer3][modeling-copilot] 运行建模 Copilot 与 Domain 上下文最小链路测试'
	PYTHONPATH=. $(PYTHON) -m pytest --no-cov \
		tests/unit/domain/semantic/test_entities.py::TestDomainEntities::test_domain_definition_accepts_context_fields_without_join_truth \
		tests/unit/application/semantic/test_domain_modeling_service.py::test_domain_context_preview_returns_candidate_scope_without_join_truth \
		tests/integration/test_semantic_api.py::TestDomainsEndpoint::test_domain_context_preview_returns_candidate_scope \
		tests/unit/application/semantic/test_modeling_draft_builder.py \
		tests/unit/application/semantic/test_modeling_copilot_service.py \
		tests/integration/test_semantic_modeling_copilot_api.py
	cd $(FRONTEND_DIR) && $(NPM) run test:unit -- src/v2/hooks/semantic.more.test.tsx src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx

test-semantic-prod-registry:
	@printf '%s\n' '[layer3][semantic-prod-registry] 运行 SQL Registry / Publish Gate / Release Snapshot 生产化收敛测试'
	PYTHONPATH=. $(PYTHON) -m pytest --no-cov \
		tests/unit/scripts/test_semantic_prod_env_guard.py \
		tests/unit/domain/semantic/test_asset_registry.py \
		tests/unit/infrastructure/semantic/test_sql_asset_registry_repository.py \
		tests/unit/application/semantic/test_asset_registry_service.py \
		tests/unit/application/semantic/test_runtime_snapshot_service.py \
		tests/unit/application/semantic/test_semantic_release_service.py \
		tests/unit/application/semantic/test_publish_gate_service.py \
		tests/integration/test_semantic_releases_api.py \
		tests/integration/semantic/test_semantic_registry_release_flow.py

test-semantic-postgres-concurrency:
	@if [ -n "$(DATABASE_URL)" ]; then \
		printf '%s\n' '[layer3][semantic-prod-postgres] 运行真实 PostgreSQL 并发发布验证'; \
		DATABASE_URL="$(DATABASE_URL)" \
		PYTHONPATH=. $(PYTHON) -m pytest --no-cov tests/integration/semantic/test_semantic_postgres_concurrency.py; \
	else \
		printf '%s\n' '[layer3][semantic-prod-postgres] skip: 未设置 DATABASE_URL'; \
	fi

test-agent-runtime:
	@printf '%s\n' '[layer3][agent-runtime] 运行 Agent-first official Runtime 最小链路测试'
	PYTHONPATH=. $(PYTHON) -m pytest --no-cov \
		tests/unit/application/semantic_router/test_preview_service.py::test_official_runtime_only_matches_active_ontology_and_glossary_targets \
		tests/unit/application/semantic_router/test_preview_service.py::test_official_runtime_requires_active_sql_snapshot \
		tests/unit/application/semantic_router/test_preview_service.py::test_official_runtime_filters_matches_by_snapshot_manifest \
		tests/unit/application/semantic_router/test_preview_service.py::test_official_runtime_routes_and_compiles_from_snapshot_manifest_without_yaml \
		tests/unit/application/semantic_router/test_preview_service.py::test_router_routes_metric_and_alias_to_cube \
		tests/unit/application/execution_compiler/test_execution_compiler_preview_service.py \
		tests/unit/application/agent/test_runtime_preflight_service.py \
		tests/unit/application/test_agent_plan_handler.py::test_agent_plan_handler_orchestrates_semantic_plan_and_ticket_preview \
		tests/integration/test_agent_semantic_api.py::test_agent_semantic_plan_api_returns_preview_only_ticket

test-platform-agent-runtime:
	@printf '%s\n' '[layer3][agent-runtime] 运行平台 Agent 推理 Runtime 测试'
	PYTHONPATH=. $(PYTHON) -m pytest --no-cov \
		tests/unit/application/agent_inference_runtime \
		tests/unit/infrastructure/agent_inference_runtime \
		tests/unit/application/semantic/test_semantic_modeling_agent_app.py \
			tests/unit/application/semantic/test_data_asset_agent_app.py \
			tests/unit/interfaces/api/v1/test_semantic_assets_api.py \
			tests/unit/di/test_container_wiring.py \
			tests/integration/test_agent_runtime_api.py \
			tests/integration/agent_inference_runtime/test_codex_ws_live_smoke.py

preflight-agent-runtime:
	@printf '%s\n' '[preflight][agent-runtime] 检查真实环境 active Ontology + active Cube 资产绑定'
	PYTHONPATH=. $(PYTHON) scripts/checks/semantic_runtime_preflight.py \
		--object-name "$(SEMANTIC_PREFLIGHT_OBJECT)" \
		--metric-name "$(SEMANTIC_PREFLIGHT_METRIC)" \
		--cube-name "$(SEMANTIC_PREFLIGHT_CUBE)" \
		--measure-name "$(SEMANTIC_PREFLIGHT_MEASURE)" \
		--expected-table "$(SEMANTIC_PREFLIGHT_TABLE)"

live-agent-runtime:
	@printf '%s\n' '[acceptance][agent-runtime] 运行真实 MaxCompute Agent-first Runtime 验收（opt-in）'
	PYTHONPATH=. $(PYTHON) scripts/checks/agent_runtime_live_acceptance.py \
		--question "$(AGENT_RUNTIME_LIVE_QUESTION)" \
		--expected-table "$(SEMANTIC_PREFLIGHT_TABLE)" \
		--expected-metric "$(SEMANTIC_PREFLIGHT_METRIC)" \
		--expected-dimension "school_name"

verify-semantic: test-agent-runtime test-modeling-agent verify-backend verify-frontend smoke-semantic

semantic-baseline-dry-run:
	@if [ -n "$(DATABASE_URL)" ]; then \
		printf '%s\n' '[semantic-prod][baseline] 校验存量库 schema fingerprint'; \
		PYTHONPATH=. $(PYTHON) scripts/checks/semantic_alembic_baseline.py --database-url "$(DATABASE_URL)"; \
	else \
		printf '%s\n' '[semantic-prod][baseline] skip: 未设置 DATABASE_URL，仅执行离线 Alembic 拓扑检查'; \
	fi

semantic-prod-readiness-report:
	@PYTHONPATH=. $(PYTHON) scripts/checks/semantic_prod_readiness_report.py

smoke-semantic-live:
	@if [ "$(SEMANTIC_PROD_LIVE)" = "1" ]; then \
		printf '%s\n' '[semantic-prod][live] 运行 Modeling Copilot live smoke'; \
		cd $(FRONTEND_DIR) && $(NPM) run e2e:modeling-agent-smoke:live; \
	else \
		printf '%s\n' '[semantic-prod][live] skip: 设置 SEMANTIC_PROD_LIVE=1 后才运行真实 live smoke'; \
	fi

semantic-fixture-cleanup:
	@if [ -n "$(SEMANTIC_FIXTURE_NAMESPACE)" ] && [ -n "$(DATABASE_URL)" ]; then \
		printf '%s\n' '[semantic-prod][cleanup] 清理语义测试 namespace: $(SEMANTIC_FIXTURE_NAMESPACE)'; \
		PYTHONPATH=. $(PYTHON) scripts/checks/semantic_fixture_cleanup.py \
			--database-url "$(DATABASE_URL)" \
			--namespace "$(SEMANTIC_FIXTURE_NAMESPACE)"; \
	else \
		printf '%s\n' '[semantic-prod][cleanup] skip: 未设置 SEMANTIC_FIXTURE_NAMESPACE 或 DATABASE_URL，未执行外部清理'; \
	fi

semantic-prod-env-required:
	@DATABASE_URL="$(DATABASE_URL)" \
	SEMANTIC_FIXTURE_NAMESPACE="$(SEMANTIC_FIXTURE_NAMESPACE)" \
	SEMANTIC_PROD_LIVE="$(SEMANTIC_PROD_LIVE)" \
	$(PYTHON) scripts/checks/semantic_prod_env_guard.py \
		--require-baseline \
		--require-live \
		--require-fixture \
		--require-postgres-concurrency

verify-semantic-prod: verify-alembic test-semantic-prod-registry semantic-baseline-dry-run
	@printf '%s\n' '[semantic-prod] 构建 nginx 生产镜像（v2 build，测试文件不进入 frontend Docker context）'
	docker compose build nginx
	$(MAKE) verify-semantic
	$(MAKE) smoke-semantic-live
	$(MAKE) semantic-fixture-cleanup
	@printf '%s\n' '[semantic-prod] PASS'

verify-semantic-prod-strict: semantic-prod-env-required verify-semantic-prod test-semantic-postgres-concurrency
	@printf '%s\n' '[semantic-prod][strict] PASS'

coverage: coverage-backend coverage-frontend

coverage-backend:
	@printf '%s\n' '[coverage][backend] 运行后端完整 pytest 覆盖率基线'
	PYTHONPATH=. $(PYTHON) -m pytest tests
	@printf '%s\n' '[coverage][backend] 校验总门槛、模块均匀度和核心模块守护约束'
	$(PYTHON) scripts/checks/backend_coverage_guard.py

coverage-frontend:
	@printf '%s\n' '[coverage][frontend] Round 4 · D+28 退役：前端覆盖率守护已由 vitest.config.ts 的子树阈值（src/v2/components|hooks|lib 各 80%）接管'
	@printf '%s\n' '[coverage][frontend] 需要数字报告请运行 `make coverage-report`'

coverage-report:
	@printf '%s\n' '[coverage-report] 运行前端/后端 coverage 基线（不设阈值，仅供查看；耗时 ~2-3 min）'
	@printf '%s\n' '[coverage-report][backend] pytest tests（含 coverage）'
	-PYTHONPATH=. $(PYTHON) -m pytest tests >/dev/null || true
	@printf '%s\n' '[coverage-report][backend] 输出模块覆盖率（按覆盖率倒序）'
	@$(PYTHON) scripts/checks/backend_coverage_guard.py --json | $(PYTHON) -c "import sys,json; r=json.load(sys.stdin); print(f'  total = {r[\"total_rate\"]:.2f}% (threshold {r[\"total_threshold\"]:.2f}%)'); [print(f'  {m:45s} {v:6.2f}%') for m,v in sorted(r['module_rates'].items(), key=lambda x: -x[1])]"
	@printf '%s\n' '[coverage-report][frontend] vitest --coverage'
	cd $(FRONTEND_DIR) && $(NPM) run test:unit -- --coverage --coverage.reporter=text --coverage.reporter=json-summary
	@printf '%s\n' '[coverage-report][frontend] HTML 报告见 frontend/coverage/index.html'

docs-health:
	@printf '%s\n' '[docs] 运行文档健康检查'
	$(PYTHON) scripts/check_docs_health.py --scope all

fact-source-guard:
	@printf '%s\n' '[docs] 运行 ADR-012 事实源口径守护'
	$(PYTHON) scripts/checks/fact_source_guard.py

docs-impact:
	@printf '%s\n' '[docs] 运行文档影响检查'
	$(PYTHON) scripts/checks/doc_impact.py $(if $(VERIFY_BASE),--base-ref $(VERIFY_BASE),$(if $(VERIFY_FILES),$(VERIFY_FILES),--worktree))

# -----------------------------------------------------------------------------
# 本地闸门（GitLab CI 基建未就位时，替代 pipeline 的手动入口）
# -----------------------------------------------------------------------------
# local-ci:     提 MR / push 前手动跑一次，等价于 verify-frontend 去掉 smoke/integration 的子集。
#               复用 lint/typecheck/tokens/i18n/unit-test/build 原子 target，避免与
#               verify-frontend 发生定义漂移；不含 E2E（不需要 docker / 后端），耗时约 1-2 min。
# local-smoke:  smoke-frontend 的用户向别名；需要 docker compose 已起、前端在 :3000 可达。
# -----------------------------------------------------------------------------
local-ci: lint-frontend check-tokens-frontend check-i18n-frontend typecheck-frontend test-unit-frontend build-frontend
	@printf '%s\n' '[local-ci] PASS（lint + tokens + i18n + tsc + vitest + v2 build）'

local-smoke: smoke-frontend
	@printf '%s\n' '[local-smoke] PASS（== smoke-frontend，Playwright v2 e2e:smoke）'

review: verify verify-docs docs-impact
