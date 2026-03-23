## 1. Implementation
- [ ] 1.1 定义 Testing Agent 的职责边界与任务清单模型
- [ ] 1.2 在规范中明确 L1/L2/L3 三层验证流程
- [ ] 1.3 定义语义中心相关改动触发 Playwright 烟测的规则
- [ ] 1.4 统一前端烟测脚本入口与环境变量约定
- [ ] 1.5 增加至少一个聚合验证入口（如 `verify:semantic`）
- [ ] 1.6 补充开发者说明文档，明确本地执行流程

## 2. Tests
- [ ] 2.1 验证 `tsc`、`build`、`e2e:domain-smoke` 可通过统一入口执行
- [ ] 2.2 验证语义中心相关改动的验证流程有文档和脚本双重保证
- [ ] 2.3 运行 `openspec validate add-testing-agent-workflow --strict`
