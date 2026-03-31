# 01-03 Summary

## Outcome

- 前端 `DataSource` / `Dataset` 类型补齐了 Phase 1 所需的目录同步、样本预览和同步摘要字段。
- 数据源页现在同时展示连接状态与目录同步摘要，并支持手动“同步目录”。
- 数据集列表、物理表注册页、文件注册页对齐到统一骨架：状态摘要、失败原因、`LIMIT 20` 样本预览。
- 文件注册页明确支持 `CSV / Excel`，重新上传只会创建新数据集。
- `QueryEditor -> SaveAsDatasetDialog` 保持为虚拟数据集唯一入口，字段分析失败时仍可继续注册。

## Key Files

- `frontend/src/types/index.ts`
- `frontend/src/api/datasources.ts`
- `frontend/src/api/datasets.ts`
- `frontend/src/api/files.ts`
- `frontend/src/pages/Datasources.tsx`
- `frontend/src/pages/Datasets.tsx`
- `frontend/src/pages/DatasetRegister.tsx`
- `frontend/src/pages/FileDatasetRegister.tsx`
- `frontend/src/components/business/SaveAsDatasetDialog.tsx`
- `frontend/src/pages/QueryCenter/Editor.tsx`

## Verification

- `cd frontend && npm run test:unit -- src/pages/Datasources.page.test.tsx src/pages/Datasets.page.test.tsx src/pages/DatasetRegister.page.test.tsx src/pages/FileDatasetRegister.page.test.tsx`
- `make typecheck-frontend`

## Notes

- 这一步没有新增第二套 SQL 数据集注册页面，继续遵守 Query Editor 单入口原则，避免重复路径和状态分叉。
