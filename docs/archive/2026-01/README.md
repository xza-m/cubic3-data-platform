---
doc_type: archive-index
status: maintained
source_of_truth: historical
owner: engineering
last_reviewed: 2026-03-24
---

# 2026-01 归档索引

本目录主要保存 2026 年 1 月期间的架构重构、前后端拆分、查询中心迁移、数据抽取和应用/配置相关实施记录。

> 状态：历史归档目录。
> 适合用来追溯“当时为什么这样改、分几步落地、遇到过什么问题”，不适合直接判断当前实现。

## 建议先读

如果你只想快速理解这一阶段的演进脉络，建议优先阅读：

1. [重构总结](REFACTORING_SUMMARY.md)
2. [架构重构记录](ARCHITECTURE_REFACTORING.md)
3. [前后端部署说明](FRONTEND_DEPLOYMENT.md)
4. [查询中心迁移完成](QUERY_CENTER_MIGRATION_COMPLETE.md)
5. [项目完善总结](PROJECT_ENHANCEMENT_COMPLETE.md)

## 架构与迁移

- [架构重构记录](ARCHITECTURE_REFACTORING.md)
- [架构清理总结](ARCHITECTURE_CLEANUP_SUMMARY.md)
- [架构评审](ARCHITECTURE_REVIEW.md)
- [API 迁移完成](API_MIGRATION_COMPLETE.md)
- [前后端部署说明](FRONTEND_DEPLOYMENT.md)
- [迁移成功总结](MIGRATION_SUCCESS.md)
- [重构总结](REFACTORING_SUMMARY.md)

## 查询中心

- [查询中心迁移完成](QUERY_CENTER_MIGRATION_COMPLETE.md)
- [查询编辑器修复](QUERY_EDITOR_FIX.md)
- [查询模板修复](QUERY_TEMPLATE_FIX.md)
- [模板 CRUD 完成](TEMPLATE_CRUD_COMPLETE.md)

## 数据抽取与数据集

- [数据抽取 Phase 4 完成](DATA_EXTRACTION_PHASE4_COMPLETE.md)
- [数据抽取交付方案](DATA_EXTRACTION_DELIVERY.md)
- [执行与交付设计](EXTRACTION_EXECUTION_DESIGN.md)
- [Filter Builder 完成](FILTER_BUILDER_COMPLETE.md)
- [数据集注册改进](DATASET_REGISTRATION_IMPROVEMENTS.md)
- [数据源支持完成](DATASOURCE_SUPPORT_COMPLETE.md)

说明：这一组文档覆盖数据抽取、过滤构建器、数据集注册和数据源能力的阶段性实施过程。

## 应用、配置与平台改造

- [配置中心 UI 完成](CONFIG_CENTER_UI_COMPLETE.md)
- [项目完善总结](PROJECT_ENHANCEMENT_COMPLETE.md)
- [全栈实施总结](FULLSTACK_IMPLEMENTATION_SUMMARY.md)
- [DI 容器完善](DI_CONTAINER_COMPLETE.md)

## 验证与报告

- [Docker 验证报告](DOCKER_VERIFICATION_REPORT.md)
- [最终 Docker 验证](FINAL_DOCKER_VERIFICATION.md)
- [测试报告](TEST_REPORT.md)
- [通用验证报告](VERIFICATION_REPORT.md)
- [最终总结](FINAL_SUMMARY.md)

## 历史总览

- [旧版项目说明](readme-old.md)

## 使用建议

- 优先把这里当作“历史背景材料”而不是“当前规范”
- 如果要引用其中结论，请回到当前代码和基线文档核实
