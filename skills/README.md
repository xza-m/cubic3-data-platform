# Agent Skills（本项目随代码版本管理）

给 AI agent（Claude/Codex）用的 skill 源，**随相关代码同 git、同 PR 演进**——避免 skill 与它指南的代码漂移（与 `tests/.../test_parity.py` 守 CLI 漂移同理）。

- **source-of-truth 在此**；本地通过 symlink 投影到 `~/.claude/skills/<name>`（编辑一处即生效），对外发布到 skillhub。
- 与 dw-skills（`ai-models/dw-skills.git`）范式一致，只是这些 skill 强绑本项目能力，故源放本仓库。

## 当前

| skill | 功能 | 指南的 CLI |
|---|---|---|
| `dp-semantic-builder/` | 建设/运维语义层：建模→发布 cube、调试问数、维护本体 | `semctl`(本地引擎) / `cubic3-dp`(远程客户端) |
