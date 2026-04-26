---
doc_type: reference-index
status: maintained
source_of_truth: reference
owner: design
last_reviewed: 2026-04-25
---

# 设计参考目录

本目录存放设计参考稿、静态原型和工作草案。
它们用于辅助讨论与设计，不直接代表当前前端实现。

## 使用边界

- 查看当前实现，请优先阅读 [../../README.md](../../README.md)、[../TECH_STACK_AND_ARCHITECTURE.md](../TECH_STACK_AND_ARCHITECTURE.md)、[../../frontend/README.md](../../frontend/README.md)
- 查看当前路由与页面，以 `../../frontend/src/v2/routes.tsx`、`../../frontend/src/v2/pages/` 和当前代码为准
- 查看文档可信度，以 [../DOC_ALIGNMENT_REPORT.md](../DOC_ALIGNMENT_REPORT.md) 为准

## 目录内容

- `index.html`、`css/`、`js/`
  - 历史静态原型
  - 用于保留早期视觉探索，不作为当前前端实现基线
- [SEMANTIC_WORKBENCH_NOTES.md](SEMANTIC_WORKBENCH_NOTES.md)
  - 语义工作台相关的 Pencil 画布说明、IA 草案与页面结构记录
  - 属于工作草案，不是最终实现约束

## 维护原则

- 新的设计结论如果已经落地，应同步回写到基线文档
- 一次性草图、探索稿和视觉参考继续放在本目录，不要塞回 `docs/readme.md`
- 如果某份参考稿已失去价值，应归档或删除，避免继续误导
