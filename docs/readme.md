---
doc_type: knowledge-base-index
status: current
source_of_truth: primary
owner: engineering
last_reviewed: 2026-03-24
---

# 文档中心

`docs/` 是本仓库的知识库目录。
本文件只做索引和分层说明，不再承载大段设计草案、实现细节或一次性过程记录。
如果你是 agent，请先读 `../AGENTS.md`，再按本页导航进入知识库正文。

## 1. 当前基线文档

以下文档已按当前实现对齐，优先阅读：

- [项目总览](../README.md)：关键入口、常用命令
- [技术栈与架构](TECH_STACK_AND_ARCHITECTURE.md)：当前架构、部署拓扑、代码分层
- [设计语言基线](DESIGN.md)：统一 UI/UX 风格语言、工作台范式与视觉约束
- [架构设计目录](architecture/README.md)：当前系统设计、模块边界和 ADR
- [快速开始](QUICK_START.md)：最短启动路径
- [启动指南](STARTUP_GUIDE.md)：完整启动、端口、代理、排障说明
- [测试与验证约束](quality/testing.md)：统一验证入口、分层矩阵与专项验证约束
- [后端覆盖率看板](quality/backend-coverage.md)：后端 coverage 波次、模块目标与当前基线
- [前端覆盖率看板](quality/frontend-coverage.md)：前端 coverage 基线、核心页面守护与当前缺口
- [评审规则](quality/review.md)：测试通过后，哪些情况下仍不应合并
- [本地开发运行手册](runbooks/local-dev.md)：本地联调、专项验证与环境就绪要求
- [文档对齐报告](DOC_ALIGNMENT_REPORT.md)：哪些文档可信、哪些只是历史记录
- [语义中心验证流程](semantic_verification.md)：语义中心固定验证流程
- [语义层统一术语表](semantic-glossary.md)：团队统一术语、页面与需求沟通默认口径
- [知识库治理规范](KNOWLEDGE_BASE_GOVERNANCE.md)：文档分层、更新责任、维护节奏
- [知识库维护 SOP](KNOWLEDGE_BASE_MAINTENANCE_SOP.md)：日常清洗、检查和修复流程
- [前端说明](../frontend/README.md)：前端脚本、目录与代理约定

## 2. 按任务找文档

- 理解项目全貌：[README.md](../README.md)
- 判断文档是否过期：[DOC_ALIGNMENT_REPORT.md](DOC_ALIGNMENT_REPORT.md)
- 查看技术栈与分层：[TECH_STACK_AND_ARCHITECTURE.md](TECH_STACK_AND_ARCHITECTURE.md)
- 查看统一设计语言与工作台风格：[DESIGN.md](DESIGN.md)
- 查看当前系统设计与架构决策：[architecture/README.md](architecture/README.md)
- 快速跑起项目：[QUICK_START.md](QUICK_START.md)
- 排查启动、端口、构建、代理问题：[STARTUP_GUIDE.md](STARTUP_GUIDE.md)
- 查看统一验证矩阵：[quality/testing.md](quality/testing.md)
- 查看后端 coverage 波次与模块目标：[quality/backend-coverage.md](quality/backend-coverage.md)
- 查看前端 coverage 基线与核心页面守护：[quality/frontend-coverage.md](quality/frontend-coverage.md)
- 查看评审拒绝条件：[quality/review.md](quality/review.md)
- 查看本地联调与专项运行前提：[runbooks/local-dev.md](runbooks/local-dev.md)
- 执行日常知识库维护：[KNOWLEDGE_BASE_MAINTENANCE_SOP.md](KNOWLEDGE_BASE_MAINTENANCE_SOP.md)
- 查看语义中心专项验证：[semantic_verification.md](semantic_verification.md)
- 查看语义层术语与统一口径：[semantic-glossary.md](semantic-glossary.md)
- 查看产品范围与需求背景：[PRD 目录](prd/README.md)
- 查看设计参考与工作草案：[reference-design/README.md](reference-design/README.md)
- 查看历史迁移、修复与一次性总结：[archive/README.md](archive/README.md)
- 查看已从根层下沉的历史专题：[archive/legacy/README.md](archive/legacy/README.md)

## 3. 文档分层规则

### 当前基线

描述当前代码实现、脚本、端口、路由和运行方式的文档，必须与仓库现状一致。

当前基线包括：

- [README.md](../README.md)
- [TECH_STACK_AND_ARCHITECTURE.md](TECH_STACK_AND_ARCHITECTURE.md)
- [DESIGN.md](DESIGN.md)
- [QUICK_START.md](QUICK_START.md)
- [STARTUP_GUIDE.md](STARTUP_GUIDE.md)
- [quality/testing.md](quality/testing.md)
- [quality/backend-coverage.md](quality/backend-coverage.md)
- [quality/frontend-coverage.md](quality/frontend-coverage.md)
- [quality/review.md](quality/review.md)
- [runbooks/local-dev.md](runbooks/local-dev.md)
- [DOC_ALIGNMENT_REPORT.md](DOC_ALIGNMENT_REPORT.md)
- [semantic_verification.md](semantic_verification.md)
- [KNOWLEDGE_BASE_GOVERNANCE.md](KNOWLEDGE_BASE_GOVERNANCE.md)
- [KNOWLEDGE_BASE_MAINTENANCE_SOP.md](KNOWLEDGE_BASE_MAINTENANCE_SOP.md)
- [frontend/README.md](../frontend/README.md)

### 当前架构设计

用于解释当前系统为什么这样分层、边界如何划分、关键决策是什么。

- [架构设计目录](architecture/README.md)

### 专题资料

用于承载产品需求、设计参考、专题说明，但不直接作为当前实现规范：

- [PRD 目录](prd/README.md)
- [设计参考目录](reference-design/README.md)

### 历史记录

仅用于追溯背景，不作为当前实现标准：

- [archive/README.md](archive/README.md)
- [archive/legacy/README.md](archive/legacy/README.md)
- 仓库根目录 `openspec/`：保留为历史变更资料，不再作为当前默认流程入口
- [archive/legacy/MIGRATION_GUIDE.md](archive/legacy/MIGRATION_GUIDE.md)
- [archive/legacy/FRONTEND_ARCHITECTURE_REVIEW.md](archive/legacy/FRONTEND_ARCHITECTURE_REVIEW.md)
- [archive/legacy/FRONTEND_FIX_SUMMARY.md](archive/legacy/FRONTEND_FIX_SUMMARY.md)
- [archive/legacy/METADATA_SYNC_GUIDE.md](archive/legacy/METADATA_SYNC_GUIDE.md)
- [archive/legacy/METADATA_SYNC_QUICKSTART.md](archive/legacy/METADATA_SYNC_QUICKSTART.md)
- [archive/legacy/METADATA_SYNC_FRONTEND.md](archive/legacy/METADATA_SYNC_FRONTEND.md)
- [archive/legacy/TROUBLESHOOTING.md](archive/legacy/TROUBLESHOOTING.md)

## 4. 设计与草案资料

- [reference-design/README.md](reference-design/README.md)：设计参考目录说明
- [reference-design/SEMANTIC_WORKBENCH_NOTES.md](reference-design/SEMANTIC_WORKBENCH_NOTES.md)：语义工作台、 Pencil 画布与 IA 工作草案
- 仓库根目录 `test_pencil.pen`：Pencil 画布源文件，只能通过 Pencil MCP 维护
- 仓库根目录 `uiv2.pen`：前端平台与工作台改版的 Pencil 设计源文件，作为界面设计参考输入

说明：

- 设计参考和工作草案不等于当前实现
- 如果设计稿、草案与代码冲突，以当前基线文档和代码为准
- 若草案已落地，应把结论沉淀回基线文档，而不是继续堆在入口页

## 5. 使用建议

如果你是首次接手项目，推荐阅读顺序如下：

1. [README.md](../README.md)
2. [DOC_ALIGNMENT_REPORT.md](DOC_ALIGNMENT_REPORT.md)
3. [TECH_STACK_AND_ARCHITECTURE.md](TECH_STACK_AND_ARCHITECTURE.md)
4. [DESIGN.md](DESIGN.md)
5. [architecture/README.md](architecture/README.md)
6. [QUICK_START.md](QUICK_START.md)
7. [STARTUP_GUIDE.md](STARTUP_GUIDE.md)
8. [quality/testing.md](quality/testing.md)
9. [quality/backend-coverage.md](quality/backend-coverage.md)
10. [quality/frontend-coverage.md](quality/frontend-coverage.md)
11. [quality/review.md](quality/review.md)
12. [runbooks/local-dev.md](runbooks/local-dev.md)
13. [frontend/README.md](../frontend/README.md)

## 6. 维护规则

- 修改启动方式、端口、代理、脚本时，同时更新 [README.md](../README.md)、[QUICK_START.md](QUICK_START.md)、[STARTUP_GUIDE.md](STARTUP_GUIDE.md)、[DOC_ALIGNMENT_REPORT.md](DOC_ALIGNMENT_REPORT.md)
- 修改统一验证入口、验证分层、coverage 门槛或专项验证范围时，同时更新 [quality/testing.md](quality/testing.md)、[quality/backend-coverage.md](quality/backend-coverage.md)、[quality/frontend-coverage.md](quality/frontend-coverage.md)、[quality/review.md](quality/review.md)、[semantic_verification.md](semantic_verification.md)、[runbooks/local-dev.md](runbooks/local-dev.md)
- 修改系统边界、分层、运行拓扑和关键架构决策时，同时检查 [architecture/README.md](architecture/README.md)
- 修改前端结构或脚本时，同时检查 [frontend/README.md](../frontend/README.md)
- 修改语义中心关键流程时，同时检查 [semantic_verification.md](semantic_verification.md)
- 新增文档时，先决定它属于当前基线、当前架构设计、专题资料还是历史记录
- 一次性修复总结不要继续堆到本文件，统一归档到 `archive/`

## 7. 冲突处理

当文档之间出现冲突时，优先级如下：

1. `DOC_ALIGNMENT_REPORT.md`
2. 当前代码实现与运行结果
3. 当前基线文档
4. 设计参考与历史记录
