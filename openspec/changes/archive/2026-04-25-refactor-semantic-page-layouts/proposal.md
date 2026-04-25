# Change: 重构语义中心页面内部布局与测试闭环

## Why
当前语义中心已经形成相对稳定的功能边界，但页面内部仍然按照技术实现和对象信息堆叠组织，而不是按照用户任务组织。

现状中的主要问题不是“功能页如何划分”，而是“功能页内的功能点如何组织”：

- `Cube 管理` 同时混入对象详情、快速查询、跨工作区跳转，页面主任务不明确
- `Cube 设计` 中仍有与领域关系和非当前步骤状态相关的干扰信息，弱化了单 Cube 定义主任务
- `领域管理` 同时承载目录浏览、单领域编辑、新建领域和进入画布，导致上下文混乱
- `领域设计` 之外的页面仍暴露关系建模和发布前语义，使管理页与设计页边界被冲淡
- 页面首屏存在重复摘要、无效跳转和过量说明文案，业务用户难以在第一眼建立心智模型
- 当前测试覆盖了主链路是否可走通，但尚未覆盖“页面是否仍然只服务单一主任务”这一交互契约

如果继续在现状上叠加新功能，会进一步放大语义中心的认知负担，并让前端页面越来越像“功能拼盘”。

## What Changes
- **ADDED** Page Responsibility Contract：为 `Cube 管理 / Cube 设计 / 领域管理 / 领域设计` 固定页面内职责和允许动作
- **ADDED** Single Primary Task Layout Rules：固定四类页面的首屏布局规则、主操作规则和信息分层规则
- **ADDED** Navigation Guard Rules：删除无效跨页跳转，只保留顺主流程跳转
- **ADDED** Semantic Center Layout Test Matrix：增加页面职责、主操作唯一性、关键布局和视觉回归测试矩阵
- **MODIFIED** Semantic Center Frontend Layout：在不增加新语义对象和不重做后端 API 的前提下，重排四个页面内部区域和交互顺序

## Impact
- Affected specs: `frontend-ui`
- Affected code:
  - `frontend/src/pages/Semantic/CubeList.tsx`
  - `frontend/src/pages/Semantic/CubeStudio.tsx`
  - `frontend/src/pages/Semantic/DomainList.tsx`
  - `frontend/src/pages/Semantic/DomainCanvas.tsx`
  - `frontend/src/pages/Semantic/DevTools.tsx`
  - `frontend/src/components/Semantic/*`
  - `frontend/tests/e2e-node/*`
  - `frontend/src/components/Semantic/*.test.tsx`
  - `frontend/src/pages/Semantic/*.test.tsx`

