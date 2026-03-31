## 1. Implementation
- [ ] 1.1 统一验证模型为四层入口与 `verify-*` 交付入口族
- [ ] 1.2 定义文档职责边界：`AGENTS.md`、`docs/quality/testing.md`、`docs/runbooks/local-dev.md`
- [ ] 1.3 设计机器可读的验证规则表格式
- [ ] 1.4 增加变更检测脚本，输出命中的规则、原因和建议执行目标
- [ ] 1.5 增加统一入口用于查看或执行基于改动范围的验证集合
- [ ] 1.6 明确语义 smoke 的状态契约、前置条件与升级规则
- [ ] 1.7 更新开发者说明文档，避免文档与规则表双份真相

## 2. Tests
- [ ] 2.1 验证规则表能够将文档改动映射到 `verify-docs`
- [ ] 2.2 验证规则表能够将前端、后端、语义专项和跨域改动映射到正确的 `verify-*`
- [ ] 2.3 验证检测结果不确定时会升级到更保守的收口入口
- [ ] 2.3 运行 `openspec validate add-testing-agent-workflow --strict`
