# Change: Domain 生命周期与极简领域建模收口

## Why
当前 `Domain` 已经承担领域画布边界和多 Cube 查询上下文，但生命周期仍不完整，创建流程也过重：用户需要在建模前手工填写 `code`、`description`，并且领域一创建就进入 `active`。这与领域画布“先建结构、再发布”的心智不一致，也增加了 YAML 无序增长和重复领域的风险。

## What Changes
- 将 `Domain` 生命周期标准化为 `draft -> active -> archived`，并明确“创建领域”和“发布领域”的职责边界。
- 将领域创建流程极简化为“只输入 `name`”，由后端自动生成 `code`、`id` 和 `draft` 草稿对象。
- 将领域画布收口为领域关系建模工作台：只负责拖入 Cube、配置 Join、执行发布，不承担物理表浏览或单 Cube 建模。
- 引入 `Domain Fingerprint` 结构指纹，在发布时执行硬校验，阻止结构完全重复的领域 YAML 发布；编辑期提供软提示能力的扩展点。
- 统一领域建模的后端校验、前端交互和测试闭环，确保从创建草稿到发布激活的全链路可验证。

## Impact
- Affected specs: `semantic-layer`
- Affected code:
  - `app/domain/semantic/*`
  - `app/application/semantic/*`
  - `app/interfaces/api/v1/semantic.py`
  - `frontend/src/api/semantic.ts`
  - `frontend/src/pages/Semantic/DomainList.tsx`
  - `frontend/src/pages/Semantic/DomainCanvas.tsx`
  - `tests/unit/application/semantic/*`
  - `tests/integration/test_semantic_api.py`
