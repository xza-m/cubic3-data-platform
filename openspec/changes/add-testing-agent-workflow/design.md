## Context
当前项目已经具备：

- 四层验证入口：`make lint` / `make typecheck` / `make test` / `make smoke`
- 按范围交付入口：`make verify-backend` / `make verify-frontend` / `make verify-docs` / `make verify-semantic`
- 文档基线与职责拆分：`AGENTS.md` 负责完成标准，`docs/quality/testing.md` 负责可交付约束，`docs/runbooks/local-dev.md` 负责可开发状态
- 语义专项 smoke 的状态契约

当前缺口不再是“有没有统一命令”，而是“如何根据改动范围稳定选择正确的交付入口”。如果把路径到命令的映射继续写在文档里，规则会同时存在于文档、Makefile 和 agent 记忆中，形成双份真相。我们需要把这部分下沉为机器可读的规则表与检测脚本。

## Goals / Non-Goals
- Goals:
  - 保持四层入口与 `verify-*` 交付入口语义稳定
  - 将“变更范围 -> 必跑验证”规则机器化
  - 让文档继续承载策略与契约，而不是细粒度路由表
  - 保持低摩擦、可脚本化、可解释
- Non-Goals:
  - 不引入新的测试框架
  - 不构建独立调度服务或复杂规则引擎
  - 不消除人工兜底判断；脚本只负责最小必跑集合
  - 不在此变更中修复现有 lint / test 红灯

## Decisions
- Decision: 保持文档与执行分层。
  - `AGENTS.md` 只定义完成标准。
  - `docs/quality/testing.md` 只定义验证策略与契约。
  - `docs/runbooks/local-dev.md` 只定义进入可开发状态的方法。
  - 机器路由规则不再写入文档正文，而是写入规则表。
- Decision: 保持四层验证模型与 `verify-*` 交付入口族。
  - 四层入口：`lint` / `typecheck` / `test` / `smoke`
  - 范围交付：`verify-backend` / `verify-frontend` / `verify-docs` / `verify-semantic`
  - 仓库级收口：`verify`
- Decision: 引入机器可读规则表。
  - 规则表至少包含：规则 id、路径模式、命中范围、升级条件、目标集合、说明
  - 文档中只保留高层原则，不重复列完整匹配表
- Decision: 引入变更检测脚本。
  - 输入：文件列表或 git diff
  - 输出：命中的规则、原因、建议执行目标、是否升级到更保守入口
  - 默认策略：取目标并集；不确定时 fail closed，升级到 `make verify`
- Decision: 语义 smoke 继续单拆。
  - 语义 smoke 是专项、有状态、非 hermetic，不并入默认 `make smoke`
  - 它只能由语义专项规则命中或人工显式要求触发

## Rule Table Sketch

建议规则表结构：

```yaml
version: 1
rules:
  - id: docs-only
    description: 仅文档改动
    any:
      - "README.md"
      - "AGENTS.md"
      - "docs/**/*.md"
    targets:
      - "verify-docs"
    confidence: high

  - id: backend-change
    description: 后端代码或接口改动
    any:
      - "app/**/*.py"
      - "tests/**/*.py"
    targets:
      - "verify-backend"
    confidence: high

  - id: frontend-change
    description: 前端非语义改动
    any:
      - "frontend/src/**/*.ts"
      - "frontend/src/**/*.tsx"
      - "frontend/tests/e2e-node/**/*.ts"
    exclude:
      - "frontend/src/pages/Semantic/**"
      - "frontend/src/components/Semantic/**"
      - "frontend/src/api/semantic.ts"
    targets:
      - "verify-frontend"
    confidence: high

  - id: semantic-change
    description: 语义关键路径改动
    any:
      - "frontend/src/pages/Semantic/**"
      - "frontend/src/components/Semantic/**"
      - "frontend/src/api/semantic.ts"
      - "app/interfaces/api/v1/semantic.py"
      - "app/infrastructure/semantic/**"
    targets:
      - "verify-semantic"
    confidence: high

  - id: cross-domain-upgrade
    description: 跨域或共享契约改动，升级到仓库级收口
    any:
      - "Makefile"
      - "docker-compose.yml"
      - "frontend/package.json"
      - "requirements.txt"
      - "app/interfaces/api/v1/**"
      - "frontend/src/api/**"
      - "schema/**"
    targets:
      - "verify"
    confidence: high
```

说明：

- `any` 为命中路径
- `exclude` 为排除路径
- `targets` 为建议执行目标
- 实际匹配结果取并集
- 若命中多个高风险规则或未命中任何已知规则，则升级为 `verify`

## Risks / Trade-offs
- 风险: 规则表过细会迅速变成新的维护负担。
  - Mitigation: 只保留高价值、高重复、高可判定规则；不为边缘情况建复杂逻辑。
- 风险: 规则表与文档再次产生双份真相。
  - Mitigation: 文档只写策略和契约；机器匹配细则只写在规则表。
- 风险: 检测脚本误判导致漏跑验证。
  - Mitigation: 采用并集 + fail closed；不确定时升级到 `verify`。
- 风险: 语义 smoke 有状态，可能污染环境。
  - Mitigation: 保持单拆，显式前置条件和副作用说明，不纳入默认仓库 smoke。

## Migration Plan
1. 先通过 OpenSpec 固化规则表、检测脚本和文档职责边界。
2. 保持当前 `Makefile` 与 `verify-*` 族不变，只增加检测与建议执行层。
3. 先实现 advisory 模式：输出建议目标与命中规则。
4. 再增加 `verify-changed` 一类自动执行入口。
5. 若时机成熟，再将该能力接入 CI 或 PR 检查。

## Open Questions
- 规则表采用 YAML、JSON 还是 Python 常量更合适？
- 检测脚本默认读取 `git diff --name-only`，还是要求显式传入文件列表？
- `verify-changed` 是否默认执行，还是先保留 `verify-detect` 作为 advisory 入口？
