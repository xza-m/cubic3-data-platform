## 1. Implementation
- [x] 1.1 调整 `DomainDefinition` 和相关 schema，支持 `draft -> active -> archived` 生命周期
- [x] 1.2 重构 `create_domain`，仅接收 `name` 并在后端自动生成 `code/id/status=draft`
- [x] 1.3 在 `publish_domain` 中实现结构指纹计算、重复领域硬校验和 `draft -> active` 状态切换
- [x] 1.4 扩展 registry，记录 `domain_fingerprint` 与领域发布摘要
- [x] 1.5 调整前端 `DomainList` 为极简创建草稿表单，并在创建成功后跳转领域画布
- [x] 1.6 调整 `DomainCanvas` 状态展示和发布失败提示，明确草稿/已发布状态

## 2. Tests & Validation
- [x] 2.1 增加 `DomainModelingService` 单测，覆盖草稿创建、发布激活、重复检测
- [x] 2.2 增加 API 集成测试，覆盖 `POST /domains` 和 `POST /domains/:id/publish` 的成功/失败路径
- [x] 2.3 运行 `PYTHONPATH=. pytest -q` 并确保覆盖率门槛通过
- [x] 2.4 运行 `npm exec -- tsc --noEmit --pretty false`
- [x] 2.5 运行 `npm run build`
- [x] 2.6 运行 `openspec validate update-domain-lifecycle-and-minimal-modeling --strict`
