# Change: 引入可管理的领域 Catalog 第二阶段

## Why
第一阶段已经完成轻量 `catalog -> domain` 归属能力：`domain` 可携带 `catalog_code/catalog_name`，目录页也能按 catalog 展示与编辑归属。

但当前实现仍然存在明显边界问题：

- `catalog` 还不是独立对象，只是挂在 `domain` 上的归属字段
- catalog 名称、编码和描述无法独立维护，多个 domain 容易出现重复或漂移
- 新建领域时无法先选 catalog，也无法从目录页真正创建 catalog
- 目录页左侧虽然已有 catalog 分层，但还缺少 catalog 级创建、重命名、归档和删除
- 轻量模式适合第一阶段验证心智，不适合长期治理

如果继续停在第一阶段，目录结构会越来越像“约定俗成的标签”，而不是可治理的产品对象。

## What Changes
- **ADDED** Managed Domain Catalog Object：将 catalog 升级为独立可持久化对象，支持 `code/name/description/status/sort_order`
- **ADDED** Catalog CRUD API：提供 catalog 列表、创建、更新、归档和删除接口
- **ADDED** Domain Assignment Consistency：domain 只持有 `catalog_code` 或 `catalog_id` 引用，不再把 catalog 名称作为独立事实源维护
- **ADDED** Catalog Directory Workflow：目录页支持 catalog 级创建、重命名、状态管理和 domain 列表浏览
- **ADDED** Modeling Entry Catalog Selection：新建领域时允许选择已有 catalog，必要时可内联创建新 catalog
- **ADDED** Default Catalog Migration：把第一阶段依赖的隐式默认目录迁移为真实默认 catalog

## Impact
- Affected specs: `semantic-modeling`
- Affected code:
  - `app/domain/semantic/entities.py`
  - `app/domain/semantic/ports/domain_repository.py`
  - `app/application/semantic/domain_modeling_service.py`
  - `app/interfaces/api/v1/semantic.py`
  - `app/infrastructure/semantic/*`
  - `frontend/src/api/semantic.ts`
  - `frontend/src/pages/Semantic/DomainList.tsx`
  - `frontend/src/pages/Semantic/DomainModelingEntry.tsx`
