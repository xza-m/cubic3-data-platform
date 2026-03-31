---
doc_type: governance
status: current
source_of_truth: primary
owner: engineering
last_reviewed: 2026-03-24
---

# 知识库治理规范

本规范定义 `docs/` 作为项目级知识库时的组织方式、更新责任和维护节奏。
目标是让架构设计、PRD、实施记录和当前基线都能长期共存，但不互相污染。

配套执行流程见：[知识库日常维护 SOP](KNOWLEDGE_BASE_MAINTENANCE_SOP.md)

## 1. 文档分层

### 当前基线

用于描述“现在系统是什么”的事实，必须与当前代码和脚本一致。

包含：

- `../README.md`
- `readme.md`
- `TECH_STACK_AND_ARCHITECTURE.md`
- `QUICK_START.md`
- `STARTUP_GUIDE.md`
- `DOC_ALIGNMENT_REPORT.md`
- `quality/testing.md`
- `quality/review.md`
- `runbooks/local-dev.md`
- `semantic_verification.md`
- `../frontend/README.md`

规则：

- 端口、命令、代理、启动方式、关键目录、关键路由变化后必须同步更新
- 基线文档之间出现冲突时，以 `DOC_ALIGNMENT_REPORT.md` 和当前代码为准
- 被新文档替代的旧基线说明，必须归档或显式标记 `status: superseded`

### 当前架构设计

用于沉淀当前系统为什么这样设计、模块边界如何划分、关键决策为何成立。

包含：

- `architecture/*.md`
- `architecture/decisions/*.md`

规则：

- 必须与当前基线文档和当前代码保持一致
- 负责解释“为什么这样设计”，但不取代启动、端口、脚本等操作型文档
- 架构决策变化后，优先更新 ADR 或当前架构正文

### PRD 与参考设计

用于沉淀“原始目标是什么”“设计输入是什么”，不直接代表最终实现。

包含：

- `prd/*.md`
- `reference-design/*.md`

规则：

- 必须写清状态，例如“设计中”“部分落地”“已过期参考”
- 设计结论一旦落地，应同步提炼进基线文档

### 实施过程与历史记录

用于保留迁移、修复、阶段性总结和一次性分析。

包含：

- `archive/**`
- `archive/legacy/**`

规则：

- 不直接作为当前实现标准
- 保留背景价值，但要避免继续被入口文档当作推荐资料

## 2. 入口要求

- 根 `AGENTS.md` 是 agent 首读入口，只做导航，不复制知识库内容
- `docs/readme.md` 是知识库首页，只做索引、分层和使用说明
- 每个重要子目录都应有自己的索引页，例如：
  - `docs/prd/README.md`
  - `docs/archive/README.md`
  - `docs/archive/legacy/README.md`
  - `docs/architecture/README.md`
  - `docs/reference-design/README.md`

## 3. 文档元数据

关键入口和基线文档应在顶部维护最小 frontmatter，供自动化和 agent 快速判断可信度与归属：

```yaml
---
doc_type: baseline
status: current
source_of_truth: primary
owner: engineering
last_reviewed: 2026-03-24
---
```

字段含义：

- `doc_type`：文档类型，例如 `baseline`、`governance`、`archive-index`、`historical-note`
- `status`：当前状态，例如 `current`、`maintained`、`design`、`archived`、`superseded`
- `source_of_truth`：可信度角色，例如 `primary`、`secondary`、`reference`、`historical`
- `owner`：维护团队或责任域，优先使用团队名而不是个人名
- `last_reviewed`：最后复核日期，格式固定为 `YYYY-MM-DD`

## 4. 编写规则

- 优先写“当前事实”和“适用范围”，避免大段历史混入入口页
- 文档引用尽量使用 Markdown 链接，而不是只写文件名
- 当内容明显依赖旧实现时，应在顶部补充状态说明
- 一次性过程记录不要继续追加到首页或 README

## 5. 更新触发器

发生以下变更时，必须同步检查知识库：

- 启动方式、端口、代理、Docker 编排变更
- 新增或删除一级模块、关键路由、关键 API
- 前端目录结构或脚本命令变化
- 语义中心关键验证路径变化
- 架构分层、依赖注入、任务调度方式变化

### 5.1 触发矩阵

| 变更类型 | 至少同步检查的文档 |
|---|---|
| 默认命令、验证入口、开发工作流变化 | `docs/quality/testing.md`、`docs/runbooks/local-dev.md` |
| 行为边界、source of truth、模块职责变化 | `docs/architecture/`、相关 ADR、受影响基线文档 |
| 统一评审规则、拒绝条件、证据要求变化 | `docs/quality/review.md` |
| 文档被新入口替代 | 旧文档归档，或显式标记 `status: superseded` 并降出默认导航 |
| 新增高价值文档 | `docs/readme.md` 和对应目录 `README.md` 必须补索引 |

## 6. 维护节奏

### 每次变更前后

- 检查受影响的基线文档是否需要同步更新
- 运行文档健康检查脚本

命令：

```bash
python scripts/check_docs_health.py --scope all
make docs-impact
```

### 每天

- 运行全量健康检查
- 优先修复基线文档与入口索引问题
- 参照 `KNOWLEDGE_BASE_MAINTENANCE_SOP.md` 处理失败项

### 每周

- 复核知识库首页和目录索引是否仍能正确导航
- 复核 PRD、设计稿、历史归档的状态说明是否需要调整

### 每月

- 清理“入口文档里混入的设计草案或一次性总结”
- 审视 `archive/` 是否需要新增月度索引或状态说明
- 审视 PRD 和设计稿是否需要补充“已落地/已过期”状态
- 对基线文档做一次轻量 review，确认 owner、status、last_reviewed 和默认导航仍然成立

### 每次较大流程变更后

- 追加一次轻量文档 review，重点复核 `testing.md`、`review.md`、`local-dev.md` 与相关架构文档是否仍一致

## 7. 健康检查范围

默认检查范围：

- 根 `README.md`
- `AGENTS.md`
- `frontend/README.md`
- `docs/readme.md`
- `docs/quality/testing.md`
- `docs/quality/review.md`
- `docs/runbooks/local-dev.md`
- `docs/KNOWLEDGE_BASE_GOVERNANCE.md`
- `docs/KNOWLEDGE_BASE_MAINTENANCE_SOP.md`
- `docs/architecture/README.md`
- `docs/prd/README.md`
- `docs/archive/README.md`
- `docs/archive/legacy/README.md`
- `docs/reference-design/README.md`
- 当前基线文档中的本地 Markdown 链接
- 关键入口和基线文档的 frontmatter 元数据

可选扩展范围：

- `docs/archive/**` 的历史文档链接

## 8. 责任划分

- 改代码的人负责同步受影响的基线文档
- 改系统边界或技术方案的人负责同步 `docs/architecture/` 与 ADR
- 改设计的人负责同步 PRD、参考设计和状态说明
- 做迁移或大改造的人负责把过程性总结归档到 `archive/`
- 替代旧文档的人负责归档或补 `superseded` 状态，并把它移出默认入口

## 9. 目标状态

知识库应始终满足以下条件：

- 新同学能从 `docs/readme.md` 出发，在 5 分钟内找到正确入口
- agent 能从 `AGENTS.md` 出发，在一次跳转内定位到正确知识源
- 当前基线文档不混入明显过期的知识
- 设计稿、PRD、实施记录各有归属，不互相冒充
- 主要文档链接可被脚本定期校验
