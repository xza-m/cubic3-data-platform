---
doc_type: archive-index
status: maintained
source_of_truth: historical
owner: engineering
last_reviewed: 2026-03-24
---

# 历史专题目录

本目录保存仍有追溯价值、但已经不适合继续放在 `docs/` 根层的历史专题文档。
这些文档不描述当前实现，只用于理解迁移背景、旧方案和问题定位过程。

## 当前文件

- [架构迁移指南](MIGRATION_GUIDE.md)
- [前端架构审查报告](FRONTEND_ARCHITECTURE_REVIEW.md)
- [前端修复总结](FRONTEND_FIX_SUMMARY.md)
- [元数据同步完整指南](METADATA_SYNC_GUIDE.md)
- [元数据同步快速开始](METADATA_SYNC_QUICKSTART.md)
- [元数据同步前端指南](METADATA_SYNC_FRONTEND.md)
- [旧版数据集注册故障排查](TROUBLESHOOTING.md)

## 使用规则

- 看历史专题前，先看 `../README.md` 与 `../../DOC_ALIGNMENT_REPORT.md`
- 如果历史专题与当前代码冲突，以当前代码、运行结果和基线文档为准
- 新的历史专题如果不再适合放在 `docs/` 根层，继续归档到这里
