# ADR-012 Fact Source Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 ADR-012 从架构决策落实到代码、界面、配置与文档守护，统一 Dataset、数据资产、语义层、Gateway 查询与平台交互式查询的职责边界，避免事实源和文档口径再次漂移。

**Architecture:** 新增轻量 `platform_facts` 读模型与状态归一模块，后端 Dashboard/API 只从明确事实源聚合数据并返回来源元数据；前端通过独立 API/hook 消费 Dashboard 数据并展示来源语义；查询执行继续以 `dw-query-gateway` 为生产执行面，平台只保留异构数据源连接、建模、治理与交互式查询历史；文档检查增加事实源守护规则。

**Tech Stack:** Flask、SQLAlchemy、dependency-injector、pytest、React、Vite、TanStack Query、Vitest、Playwright、Makefile、docs health scripts。

---

## 0. 边界原则与分期

本计划只治理 `cubic3-data-platform` 的控制面、治理面与交互式查询体验，不修改 `dw-query-gateway` 的执行逻辑，不把平台 Dataset 迁移成数据资产 Dataset，也不引入新的统一大模型编排层。

P0 先修“事实源可解释”：后端状态归一、Dashboard 聚合读模型、来源元数据和回归测试。P1 修“界面可理解”：首页和模块页文案明确区分平台 Dataset、数据资产和查询来源。P2 修“口径可守住”：配置默认值、文档守护脚本和验证入口。正式 Agent 问数统计若要进入首页，作为独立指标接入 Gateway telemetry，不覆盖平台交互式查询指标。

工程原则应用：
- KISS：先建小而清晰的读模型和来源字段，不做跨系统大改造。
- YAGNI：本阶段不做 Dataset 迁移、不重构 Gateway、不引入新实体层。
- SOLID：Dashboard 只组装展示投影，事实统计交给 `platform_facts`，状态归一交给独立模块。
- DRY：数据源连接状态、数据资产同步状态和 Dashboard 类型不再在多个页面内重复硬编码。

## 1. 文件地图

新增文件：
- `app/application/platform_facts/__init__.py`
- `app/application/platform_facts/source_status.py`
- `app/application/platform_facts/read_model.py`
- `tests/unit/application/platform_facts/test_source_status.py`
- `tests/unit/application/platform_facts/test_read_model.py`
- `frontend/src/v2/api/dashboard.ts`
- `frontend/src/v2/hooks/dashboard.ts`
- `frontend/src/v2/lib/factSources.ts`
- `frontend/src/v2/pages/Dashboard.test.tsx`
- `scripts/checks/fact_source_guard.py`

修改文件：
- `app/application/services/dashboard/overview_service.py`
- `app/application/datasource/handlers/get_statistics_handler.py`
- `tests/unit/application/dashboard/test_overview_service.py`
- `frontend/src/v2/pages/Dashboard.tsx`
- `frontend/src/v2/pages/data/Datasources.tsx`
- `frontend/src/v2/pages/data/Datasets.tsx`
- `frontend/src/v2/pages/semantic/assets/Assets.tsx`
- `docker-compose.yml`
- `Makefile`
- `docs/quality/testing.md`

## 2. Task 1: 建立状态归一事实源

- [x] 新增 `app/application/platform_facts/source_status.py`，集中定义数据源连接状态和数据资产同步状态归一逻辑。

```python
from __future__ import annotations

CONNECTED_DATASOURCE_STATUSES = frozenset({"connected", "success"})


def normalize_datasource_connection_status(status: str | None) -> str:
    value = (status or "unknown").strip().lower()
    if value == "success":
        return "connected"
    return value or "unknown"


def is_connected_datasource_status(status: str | None) -> bool:
    return normalize_datasource_connection_status(status) == "connected"


def normalize_data_asset_sync_status(status: str | None) -> str:
    value = (status or "unknown").strip().lower()
    if value == "success":
        return "synced"
    if value == "running":
        return "pending"
    return value or "unknown"
```

- [x] 新增 `tests/unit/application/platform_facts/test_source_status.py`，先覆盖兼容旧状态与新状态的核心断言。

```python
from app.application.platform_facts.source_status import (
    is_connected_datasource_status,
    normalize_data_asset_sync_status,
    normalize_datasource_connection_status,
)


def test_datasource_success_is_connected_compatibility():
    assert is_connected_datasource_status("connected")
    assert is_connected_datasource_status("success")
    assert normalize_datasource_connection_status("success") == "connected"


def test_data_asset_sync_status_normalizes_legacy_values():
    assert normalize_data_asset_sync_status("success") == "synced"
    assert normalize_data_asset_sync_status("running") == "pending"
    assert normalize_data_asset_sync_status(None) == "unknown"
```

- [x] 修改 `app/application/datasource/handlers/get_statistics_handler.py`，连接成功统计统一使用 `CONNECTED_DATASOURCE_STATUSES`，不再只认 `connected`。
- [x] 执行验证：

```bash
PYTHONPATH=. PYTEST_ADDOPTS='--no-cov' pytest tests/unit/application/platform_facts/test_source_status.py -q
```

## 3. Task 2: 抽出平台事实读模型

- [x] 新增 `app/application/platform_facts/read_model.py`，封装 Dashboard 与统计页共享的事实聚合。

建议接口：

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


DatasetScaleSource = Literal["data_asset_tables", "datasets"]


@dataclass(frozen=True)
class DatasetScale:
    total: int
    current_week: int
    previous_week: int
    source: DatasetScaleSource


@dataclass(frozen=True)
class QueryScale:
    today: int
    current_week: int
    previous_week: int
    source: Literal["query_histories"]


class PlatformFactsReadModel:
    def __init__(self, session):
        self.session = session

    def datasource_total(self) -> int:
        ...

    def datasource_connected_total(self) -> int:
        ...

    def data_asset_scale(self, now) -> DatasetScale:
        ...

    def platform_dataset_scale(self, now) -> DatasetScale:
        ...

    def dataset_scale_for_dashboard(self, now) -> DatasetScale:
        ...

    def interactive_query_scale(self, now) -> QueryScale:
        ...
```

- [x] 读模型规则：
  - `datasource_total` 来源是 `data_sources`。
  - `datasource_connected_total` 来源是 `data_sources.connection_status`，兼容 `connected` 与历史 `success`。
  - `data_asset_scale` 来源是 `data_asset_tables`，表示资产事实层。
  - `platform_dataset_scale` 来源是 `datasets`，表示平台 Dataset 抽象。
  - `dataset_scale_for_dashboard` 优先使用 `data_asset_tables`；当资产表为空时回退 `datasets`，并返回 `source`。
  - `interactive_query_scale` 来源是 `query_histories`，只代表平台交互式查询，不代表 Agent 正式问数。

- [x] 新增 `tests/unit/application/platform_facts/test_read_model.py`，覆盖以下场景：
  - 有数据资产表时 Dashboard 数据规模使用 `data_asset_tables`。
  - 数据资产表为空时 Dashboard 回退 `datasets`。
  - 数据源连接统计同时识别 `connected` 和 `success`。
  - 查询统计只读 `query_histories`。

- [x] 修改 `app/application/services/dashboard/overview_service.py`，移除内联 `_dataset_fact_counts()` 等分散聚合逻辑，改用 `PlatformFactsReadModel`。
- [x] Dashboard API 返回体保留现有字段，同时新增来源元数据。

```python
"sources": {
    "datasource_total": "data_sources",
    "connected_datasource_count": "data_sources",
    "dataset_total": dataset_scale.source,
    "today_query_count": "query_histories",
    "recent_queries": "query_histories",
}
```

- [x] 更新 `tests/unit/application/dashboard/test_overview_service.py`：
  - 保留旧字段兼容断言。
  - 增加 `sources.dataset_total == "data_asset_tables"` 和回退为 `"datasets"` 的断言。
  - 增加 `today_query_count` 来源为 `"query_histories"` 的断言。

- [x] 执行验证：

```bash
PYTHONPATH=. PYTEST_ADDOPTS='--no-cov' pytest tests/unit/application/platform_facts tests/unit/application/dashboard/test_overview_service.py -q
```

## 4. Task 3: 前端 Dashboard API 与来源呈现

- [x] 新增 `frontend/src/v2/api/dashboard.ts`，把 Dashboard response type 和 `getDashboardOverview()` 从页面中移出。

```ts
export interface DashboardOverviewSources {
  datasource_total: 'data_sources'
  connected_datasource_count: 'data_sources'
  dataset_total: 'data_asset_tables' | 'datasets'
  today_query_count: 'query_histories'
  recent_queries: 'query_histories'
}
```

- [x] 新增 `frontend/src/v2/hooks/dashboard.ts`，封装 TanStack Query。
- [x] 修改 `frontend/src/v2/pages/Dashboard.tsx`：
  - 删除页面内 API 函数和类型定义。
  - 首页“数据集”指标改成“数据资产”或在副文案中明确“资产事实层”。
  - “今日查询”指标改成“平台查询”，副文案明确“交互式查询 · query_histories”。
  - 最近查询卡片底部来源从“来自 query_history”改成“平台交互式查询 · query_histories”。
  - 当 `sources.dataset_total === "datasets"` 时，展示“回退到平台 Dataset”。

- [x] 新增 `frontend/src/v2/pages/Dashboard.test.tsx`，mock `useDashboardOverview()`，覆盖：
  - 页面展示数据资产来源。
  - 平台查询不被表述为 Gateway 正式问数。
  - fallback 时出现“回退到平台 Dataset”。

- [x] 执行验证：

```bash
cd frontend && npm run test:unit -- Dashboard.test.tsx
```

## 5. Task 4: 模块页面统一语义提示

- [x] 新增 `frontend/src/v2/lib/factSources.ts`，集中定义前端状态归一与来源展示函数。

建议函数：
- `normalizeDatasourceConnectionStatus(status?: string): 'connected' | 'disconnected' | 'pending' | 'failed' | 'unknown'`
- `isConnectedDatasourceStatus(status?: string): boolean`
- `normalizeDataAssetSyncStatus(status?: string): 'synced' | 'pending' | 'failed' | 'unknown'`
- `formatDatasetScaleSource(source?: string): string`

- [x] 修改 `frontend/src/v2/pages/data/Datasources.tsx`，连接状态筛选和统计使用 `isConnectedDatasourceStatus()`，兼容历史 `success`。
- [x] 修改 `frontend/src/v2/pages/data/Datasets.tsx`，页面标题或副文案明确“平台 Dataset 是基于物理表的消费抽象，不是全量数据资产目录”。
- [x] 修改 `frontend/src/v2/pages/semantic/assets/Assets.tsx`，页面标题或空状态明确“数据资产底座记录元数据事实层，Dataset 类型资产通过 `asset_type='dataset'` 表达”。
- [x] 检查页面中不要出现“数据资产 Dataset”这类混合说法；应使用“平台 Dataset”或“Dataset 类型资产”。
- [x] 执行前端专项验证：

```bash
cd frontend && npm run test:unit -- Datasources
cd frontend && npm run test:unit -- Dashboard.test.tsx
```

## 6. Task 5: 查询口径与 Gateway 边界

- [x] 保持首页现有查询指标为平台交互式查询，来源固定为 `query_histories`，不把它解释成 Agent 正式问数。
- [x] Gateway 生产执行统计继续使用现有治理接口：
  - `GET /api/v1/governance/gateway/summary`
  - `GET /api/v1/governance/gateway/query-runs`
  - `GET /api/v1/governance/gateway/alerts`
- [x] 如产品需要在首页展示正式问数，新增独立 KPI“正式问数”，从 Gateway telemetry 读取，不复用“平台查询”字段。
- [x] 在 `frontend/src/v2/pages/Dashboard.tsx` 或后续新增 Dashboard view 中，明确区分：
  - 平台查询：平台内异构数据源交互式查询，事实源 `query_histories`。
  - 正式问数：Agent 先过语义层，实际执行通过 `dw-query-gateway`，事实源 Gateway telemetry。

推荐方案：本轮先完成平台查询标注，不新增 Gateway 首页 KPI。这样变更面小、含义清楚，符合 KISS 与 YAGNI。

## 7. Task 6: 配置默认值与文档守护

- [x] 修改 `docker-compose.yml` 中后端和 worker 的 `SEMANTIC_MODELING_COPILOT_STORE` 默认值为 `sql`，只允许 fixture 或专项演示显式覆盖为 `yaml`。
- [x] 新增 `scripts/checks/fact_source_guard.py`，扫描 `README.md`、`docs/`、`frontend/src/v2/` 中容易漂移的表达。

建议规则：

```python
RULES = [
    (
        "data asset dataset",
        "不要新增 data asset dataset；使用平台 Dataset 或 Dataset 类型资产",
    ),
    (
        "数据资产 Dataset",
        "不要混用数据资产和平台 Dataset；使用平台 Dataset 或 Dataset 类型资产",
    ),
    (
        "来自 query_history",
        "查询来源应写为平台交互式查询 · query_histories",
    ),
    (
        "首页查询代表 Gateway",
        "首页平台查询只代表 query_histories；正式问数应独立接 Gateway telemetry",
    ),
]
```

- [x] `fact_source_guard.py` 输出命中文件、行号和建议替代表达；支持仓库根目录直接运行。
- [x] 修改 `Makefile`：
  - 新增 `fact-source-guard` target。
  - 将 `verify-docs` 扩展为执行 `docs-health` 和 `fact-source-guard`。
- [x] 修改 `docs/quality/testing.md`，记录事实源守护检查的触发场景和命令。
- [x] 执行验证：

```bash
python scripts/checks/fact_source_guard.py
make verify-docs
```

## 8. Task 7: 端到端核验与交付

- [x] 执行后端回归：

```bash
PYTHONPATH=. PYTEST_ADDOPTS='--no-cov' pytest tests/unit/application/platform_facts tests/unit/application/dashboard/test_overview_service.py -q
```

- [x] 执行前端回归：

```bash
cd frontend && npm run test:unit -- Dashboard.test.tsx
```

- [x] 执行文档与差异检查：

```bash
make verify-docs
git diff --check
```

- [x] 若当前本地服务可用，在浏览器打开 `http://localhost:81/dashboard`，检查；本次因 Computer Use runtime 缺失，改用 `VITE_AUTH_BYPASS=1 npm run dev:v2 -- --host 127.0.0.1 --port 3105` + Playwright DOM sanity 验证：
  - 首页数据不为空。
  - 数据资产数量显示来源。
  - 查询指标明确为平台交互式查询。
  - 最近查询来源文案不再使用旧的 `query_history` 单数表达。

- [x] 最终汇报需包含：
  - 已完成的事实源治理项。
  - 已执行验证命令与结果。
  - 未覆盖项和原因。
  - 是否新增 Gateway 正式问数 KPI；若未新增，说明保持边界的原因。

## 9. 验收矩阵

| 维度 | 验收点 | 验证方式 |
| --- | --- | --- |
| Dataset 边界 | 平台 Dataset 与数据资产不再在首页和文档中混用 | `fact_source_guard.py`、页面检查 |
| 数据资产事实源 | Dashboard 优先使用 `data_asset_tables` 并返回来源 | 后端单测 |
| 兼容旧状态 | 数据源 `success` 仍计入 connected | 后端单测、前端单测 |
| 查询边界 | 平台查询只代表 `query_histories` | Dashboard 单测、页面检查 |
| Gateway 边界 | 正式问数只通过 Gateway telemetry 表达 | 文案检查、接口边界检查 |
| 文档治理 | ADR-012 相关口径有守护脚本 | `make verify-docs` |

## 10. 风险与取舍

- Dashboard 新增 `sources` 字段属于兼容性增强，旧前端不依赖该字段，风险低。
- 把首页“数据集”改为“数据资产”会改变用户理解路径，但更符合当前事实源；若产品坚持显示平台 Dataset，应将 Dashboard source 固定为 `datasets`，不要再优先取 `data_asset_tables`。
- `fact_source_guard.py` 是轻量规则守护，不能替代人工架构评审；它负责拦截高频漂移表达。
- `SEMANTIC_MODELING_COPILOT_STORE` 默认值切到 `sql` 后，需要确认 fixture 测试是否显式覆盖为 `yaml`；如果没有，需要在测试配置中补覆盖，而不是回退生产默认值。
