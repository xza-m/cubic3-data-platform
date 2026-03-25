# 项目研究摘要

**Project:** CUBIC3 企业数据应用平台  
**Domain:** 企业数据应用平台（语义中心 + 异步任务 + 内网部署 + AI 辅助分析）  
**Researched:** 2026-03-25  
**Confidence:** MEDIUM

## Executive Summary

这是一个典型的 brownfield 企业数据平台，不是从零搭建的新系统。研究结果一致指向同一个结论：当前最重要的不是扩张能力边界，而是把现有 `React SPA + Flask API + PostgreSQL/Redis/RQ` 骨架上的核心链路做稳、做通、做可追踪。对 roadmap 而言，第一优先级应是“生产可用的核心平台 + 语义中心完整性”，第二优先级才是“受控的智能问数 / DataAgent 验证”。

从工程原则看，这个项目最适合走 KISS 和 YAGNI 路线：先保留现有技术栈与分层，不做框架迁移；先把语义对象、查询可信、发布/漂移、应用消费这些主链路闭合，再考虑更复杂的平台化能力。SOLID 和 DRY 的落点也很明确：把语义定义、编译、运行时绑定、应用执行拆开，避免 UI、AI 或临时脚本重复实现口径和校验逻辑。

主要风险集中在四类：语义口径分叉、join fan-out 导致错数、物理层与语义层漂移、AI 输出不可验证。它们不会单独消失，必须通过阶段化建设来压住。最稳妥的顺序是先完成数据接入与语义底座，再完成语义运行闭环与模板消费，最后做受控智能验证。

## Key Findings

### Recommended Stack

研究建议保留当前主栈，不要在 brownfield 阶段引入大规模迁移成本。最合理的路径是：继续以 `React SPA + Flask API + PostgreSQL + Redis + RQ` 作为主干，逐步把新代码收敛到更现代的实现习惯上，而不是重写成另一个平台。

前端上，React 19.2、TypeScript 5.x、Vite 8、TanStack Query、Monaco、Radix、`@xyflow/react` 这一组合适合语义中心和分析型 SPA。后端上，Flask 3.1 + SQLAlchemy 2.x + psycopg3 + PostgreSQL 18 + Redis 8.2 + RQ 2.7 仍然是当前内部平台最稳的组合。这里的关键不是“追新”，而是把现有骨架升级到更可维护的现代栈，同时保持部署和验证方式简单可控。

**Core technologies:**
- React 19.2.x：SPA UI 运行时，适合语义中心、查询中心和应用中心的复杂交互
- Flask 3.1.x：API 与服务边界，保留现有 App Factory 分层最稳妥
- PostgreSQL 18.x：主元数据库，承载元数据、历史、注册表与执行记录
- Redis 8.2 + RQ 2.7：缓存、队列与异步任务，满足后台作业与调度需求
- SQLAlchemy 2.x + psycopg3：现代 ORM 与数据库驱动，建议作为新代码方向

### Expected Features

功能研究最重要的结论是：v1 不是“什么都做一点”，而是必须先闭合核心语义数据应用环。用户对内部生产版平台的最低预期很清楚，缺了这些就会像 demo，而不像能长期使用的工具。

**Must have (table stakes):**
- 异构数据源接入、连接校验、元数据同步、查询预览
- `Cube / View / Domain / Recipe` 全生命周期管理
- 域目录与语义资产发现
- 查询可信能力：生成 SQL 可见、历史可追踪、结果可复现
- 至少一个可运行的应用模板和一条订阅型消费路径

**Should have (competitive):**
- 受控的智能问数体验
- 垂直 `DataAgent` 验证场景
- 更完整的 lineage / impact analysis
- 更多模板化应用实例，但必须建立在统一语义对象之上

**Defer (v2+):**
- 通用 Agent 平台
- Prompt-to-App / 低代码全自动应用生成
- 全量多租户与权限治理
- 追求实时化一切

### Architecture Approach

架构上建议延续并强化“控制面 / 数据面”拆分：语义定义、校验、发布、漂移检测、资产发现属于控制面；查询执行、刷新、订阅、调度属于运行面。系统不应该把 UI 当作规则承载层，也不应该把 AI 当作主编译器。

更具体地说，语义资产应当是 metadata-first 的：定义是源头，SQL、数据集、执行包和订阅行为都是派生结果。运行时绑定也是必要能力，但必须是确定性的、可审计的、可回放的。对于当前仓库，这意味着要把 `app/domain/semantic/`、`app/application/semantic/`、`app/infrastructure/semantic/` 和 `app/application/services/app_center/` 继续分开，前端则围绕共享 read model 和语义工作台演进。

**Major components:**
1. 前端语义壳层与共享 read model - 负责语义对象列表、详情、工作台与治理视图
2. Flask API 边界 - 负责请求归一、校验、分页和错误映射
3. 语义服务层 - 负责定义、编译、发布、漂移、运行时绑定
4. 应用模板运行时 - 负责实例校验、调度、执行与通知
5. PostgreSQL / Redis / RQ - 负责元数据、历史、队列、任务状态与后台作业

### Critical Pitfalls

1. **语义口径分叉** - 用版本化语义仓库作为唯一口径入口，禁止页面、临时 SQL 和 AI 输出绕过主语义层
2. **Join 图和粒度不完整** - 将 grain、主键、关系和受限 join 路径作为硬约束，fan-out 风险不能静默放行
3. **物理层同步只做巡检不做门禁** - schema diff、字段引用和映射校验必须进入发布链路
4. **模板森林失控** - 模板优先参数化和复用执行器，避免复制粘贴式派生
5. **AI 假答案进入决策链** - 只允许结构化输出和工具调用，结果必须可验证、可回退、可追溯

## Implications for Roadmap

### Phase 1: 核心平台稳定化
**Rationale:** 先把入口链路做稳，后面的语义闭环、模板消费和 AI 验证才有可信输入。  
**Delivers:** 数据源接入、元数据同步、查询预览稳定性、语义对象基础生命周期、域目录与资产发现、查询可信的最小骨架。  
**Addresses:** `FEATURES.md` 中的 table stakes，尤其是接入、预览、生命周期和信任能力。  
**Avoids:** 语义口径分叉、demo/prod 错位、临时 SQL 绕过主链路。

### Phase 2: 语义运行闭环与消费模板
**Rationale:** 等核心对象和入口稳定后，再补编译、发布、漂移、物化和模板消费，否则只会把不稳定放大。  
**Delivers:** `Cube / View / Domain / Recipe` 的可发布、可校验、可查询闭环；发布/重建/漂移检测；至少一个可运行的订阅型应用模板。  
**Uses:** PostgreSQL 作为注册与历史存储，Redis + RQ 作为后台任务，React 共享 read model 作为前端承载。  
**Implements:** 控制面 / 数据面拆分，以及 metadata-first 语义资产模式。

### Phase 3: 受控智能问数与 DataAgent 验证
**Rationale:** AI 能力必须建立在可信语义层之上，否则只会把错误包装得更像正确。  
**Delivers:** 结构化问数流程、受控工具调用、垂直 `DataAgent` 验证场景、准确率与回归评估。  
**Addresses:** 智能问数闭环、可验证输出、错误回退和结果可追溯。  
**Avoids:** 通用 Agent 平台化、自由文本式答案、模型直接触达原始数据源。

### Phase 4: 运营化与扩展治理
**Rationale:** 当核心平台和 AI 验证都稳定后，再补治理与运营能力才不会拖慢主线。  
**Delivers:** 更完整的 lineage / impact、模板治理、订阅扩展、监控与管理能力。  
**Uses:** 现有运行时、历史记录和异步任务能力。  
**Implements:** 逐步增强的可观测性与模板治理，而不是一次性平台化重构。

### Phase Ordering Rationale

- 依赖链是单向的：先有接入与查询预览，才有可信语义对象；先有可信语义对象，才有发布、漂移和模板消费；先有可信消费链，才适合做智能验证。
- 架构上应先固化控制面契约，再扩展运行面能力。这样能减少 UI、AI 和后台任务之间的重复逻辑，符合 DRY，也更利于单元测试和回归测试。
- 这个顺序直接规避了研究里反复出现的坑：口径分叉、fan-out、漂移和 AI 假答案。若反过来先做 AI 或泛化平台，风险会被放大到核心链路。

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** 数据源适配、元数据同步和查询预览的现有实现边界需要先做代码级核对
- **Phase 2:** 语义编译、发布、漂移和运行时绑定的契约需要与现有服务拆分对齐
- **Phase 3:** AI 工具调用边界、输出结构和评估指标需要单独确认

Phases with standard patterns (skip research-phase):
- **Phase 4:** 运营化、监控和治理扩展可沿用成熟平台模式，风险相对可控

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | 主栈与当前仓库骨架一致，且升级方向明确，不需要推倒重来 |
| Features | MEDIUM | 需求方向清晰，但具体范围仍要结合现有代码能力和迁移成本收敛 |
| Architecture | MEDIUM | 控制面 / 数据面拆分很明确，但现有模块边界仍需代码级验证 |
| Pitfalls | HIGH | 这些问题在语义平台和 AI 辅助分析场景中高度常见，风险判断稳定 |

**Overall confidence:** MEDIUM

### Gaps to Address

- 现有代码对语义生命周期、发布、漂移和查询可信的覆盖度还没有做完整回审：规划前需要再做一次代码级核对，避免把研究假设当作当前事实。
- AI 验证阶段的评价标准还不够具体：需要在规划时明确结构化输出格式、回退策略和验收指标。
- 应用模板和订阅能力的边界可能需要进一步收敛：要优先保留能证明“语义层可消费”的最小模板集。

## Sources

### Primary (HIGH confidence)
- `.planning/PROJECT.md` - 项目目标、优先级、范围边界与 brownfield 约束
- `.planning/research/STACK.md` - 推荐技术栈、保留/扩展/避免项
- `.planning/research/FEATURES.md` - 功能分层、MVP、优先级矩阵
- `.planning/research/ARCHITECTURE.md` - 控制面 / 数据面、模块职责、构建顺序
- `.planning/research/PITFALLS.md` - 主要风险、技术债模式、阶段映射

### Secondary (MEDIUM confidence)
- `docs/prd/semantic_layer_prd.md` - 语义层阶段划分、编译与 fan-out 防护、物理层同步
- `docs/prd/app_center_prd.md` - 应用中心阶段、模板、执行器与治理演进

### Tertiary (LOW confidence)
- 外部官方文档中关于 React、Flask、SQLAlchemy、PostgreSQL、Redis、RQ、dbt、Cube、Looker、Fabric 的产品资料 - 用于验证技术趋势与行业最佳实践，但不直接决定本仓库范围

---
*Research completed: 2026-03-25*
*Ready for roadmap: yes*
