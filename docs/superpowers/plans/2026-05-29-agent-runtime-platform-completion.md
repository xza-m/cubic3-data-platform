# Agent Runtime Platform Completion Implementation Plan

> **Status:** Superseded on 2026-05-29.

这份早期执行计划曾把 Codex app-server transport 写成 HTTP / Unix socket 探索路径，其中 HTTP client、HTTP capabilities 测试和 HTTP live smoke 已经被后续架构决策废弃。

当前执行口径以这些文档为准：

- `docs/architecture/agent-runtime-platform.md`
- `docs/superpowers/plans/2026-05-29-codex-app-server-ws-runtime-fix.md`

当前结论：

- Codex app-server 真实集成主链路只使用 `ws://127.0.0.1:<port>` WebSocket。
- HTTP REST 不属于 Codex app-server 集成模式。
- 旧 HTTP client skeleton 已删除，不再作为兼容分支、测试模式或验收依据。
