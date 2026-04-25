## 1. Product Boundary Convergence
- [x] 1.1 收口 `Cube 管理 / Cube 详情 / Cube Studio / Domain 画布` 页面职责与文案
- [x] 1.2 固定语义中心主跳转链路，去除职责回流入口
- [x] 1.3 确保画布中不再出现物理表浏览和 Cube 草稿生成流程

## 2. Runtime Convergence
- [x] 2.1 固定多 Cube 查询必须显式带 `domain_code/domain_id` 的行为
- [x] 2.2 固定 Domain 发布校验链路：环路、重复边、`1:N` 聚合策略、`active Cube`、重复指纹
- [x] 2.3 固定 `View` 逻辑发布边界，不引入真实物化
- [x] 2.4 固定跨数据源 Join 拒绝策略

## 3. Registry Formalization
- [x] 3.1 为 `SemanticRegistry` 编写正式 migration
- [x] 3.2 去除运行时补列依赖，保留兼容读取策略
- [x] 3.3 固定 registry 字段模型和状态摘要读取链路

## 4. Verification Convergence
- [x] 4.1 增加固定验证入口（如 `verify:semantic`）或等价脚本化流程
- [x] 4.2 保持 `domain-smoke` 稳定可执行
- [x] 4.3 新增 `domain-publish-smoke`
- [x] 4.4 新增 `cube-draft-smoke`
- [x] 4.5 补充开发者说明，固定本地验证流程与服务就绪要求

## 5. Acceptance
- [x] 5.1 验收主链路：物理表 -> Cube draft -> Cube active
- [x] 5.2 验收主链路：Domain draft -> 画布建模 -> 发布 active
- [x] 5.3 验收主链路：带 `domain_code` 的多 Cube 查询编译执行

## 6. Validation
- [x] 6.1 `PYTHONPATH=. pytest -q`
- [x] 6.2 `npm exec -- tsc --noEmit --pretty false`
- [x] 6.3 `npm run build`
- [x] 6.4 `openspec validate converge-semantic-modeling-platform --strict`
