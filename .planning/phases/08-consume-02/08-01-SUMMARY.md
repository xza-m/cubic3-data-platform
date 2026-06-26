---
phase: 08-consume-02
plan: 01
subsystem: conversation / semantic-router
tags: [tdd-red, datachat, semantic-router, official-runtime]
requires:
  - "Phase 7：active manifest 累积 + 发布累积代码已落地（official 运行时机制成立）"
provides:
  - "execute_plan(runtime_mode='official') 调用契约的失败断言（D1 的 TDD 锚点）"
affects:
  - "Wave 2 (08-02)：改 _handle_via_semantic_router 传 runtime_mode='official' 让此测试转 GREEN"
tech-stack:
  added: []
  patterns:
    - "TDD-RED：先立失败断言坐实‘切 official 尚未发生’，再于下一 wave 转绿"
key-files:
  created: []
  modified:
    - tests/unit/application/conversation/test_send_message_handler.py
decisions:
  - "断言读 call_args.kwargs（execute_plan 的 runtime_mode 为 keyword-only，默认 None）"
  - "问法用实测口径 ‘学生答题统计 总数’（official 下命中 student_total_count）"
metrics:
  duration: ~6m
  completed: 2026-06-26
  tasks: 1
  files: 1
---

# Phase 8 Plan 01: DataChat 切 official RED 锚点 Summary

为 D1（DataChat 全局问数切 official）立一条会失败的契约测试，坐实当前 `SendMessageHandler._handle_via_semantic_router` 调 `execute_plan` 时未传 `runtime_mode="official"`，为 Wave 2 提供可精确转绿的契约。

## What Was Built

新增测试方法 `TestSendMessageHandlerAgent::test_semantic_router_called_with_official_runtime_mode`（`tests/unit/application/conversation/test_send_message_handler.py:263`）：

- 复用 `test_semantic_router_success_short_circuits_agent_and_legacy` 的 fixture/mock 搭法（MagicMock `semantic_router_service` 注入 handler，`conversation.user_id="user_123"`/`dataset_id=10`，`msg_repo.create.side_effect=[user_message, ai_message]`，成功的 cube+executed-sql `execute_plan` 返回值）。
- 问法用 CONTEXT 实测口径 `"学生答题统计 总数"`（official 下命中 `student_total_count`）。
- 核心断言（RED）：`semantic_router_service.execute_plan.call_args.kwargs.get("runtime_mode") == "official"`；并保留 `question` 锚定断言。

**纯测试，零产品代码改动**（`git status --short app/` 为空）。

## RED 证据（pytest 实际输出）

命令：`PYTHONPATH=. /Users/xuan/miniconda3/bin/python -m pytest --no-cov -q -p no:cacheprovider tests/unit/application/conversation/test_send_message_handler.py::TestSendMessageHandlerAgent::test_semantic_router_called_with_official_runtime_mode`

```
tests/unit/application/conversation/test_send_message_handler.py:314: in test_semantic_router_called_with_official_runtime_mode
    assert call_kwargs.get("runtime_mode") == "official"
E   AssertionError: assert None == 'official'
E    +  where None = <built-in method get of dict object at 0x...>('runtime_mode')
E    +    where <built-in method get ...> = {'question': '学生答题统计 总数', 'viewer_roles': []}.get
...
FAILED tests/unit/application/conversation/test_send_message_handler.py::TestSendMessageHandlerAgent::test_semantic_router_called_with_official_runtime_mode
1 failed in 0.14s
```

失败点精确指向 `runtime_mode` 断言（None != "official"），**非** import/fixture 错误。handler 实际 kwargs 为 `{'question': '学生答题统计 总数', 'viewer_roles': []}` —— 坐实"切 official 尚未发生"。

> 测试输出中的 `agent_query_log write failed ... Working outside of application context` 是 `_record_query_log` 在无 Flask app context 下的预期 warning（被 try/except 吞掉、不阻断主流程），与本断言无关，亦不改变 RED 结论。

## execute_plan 契约确认

`app/application/semantic_router/preview_service.py:582`：

```python
def execute_plan(
    self, *, question, viewer_roles=None, principal_context=None,
    runtime_options=None, runtime_mode=None,
) -> Dict[str, Any]: ...
```

`runtime_mode` 为 **keyword-only**、默认 `None`，故断言读 `call_args.kwargs["runtime_mode"]` 是正确路径。

## No-Regression 验证

`PYTHONPATH=. ... pytest ... test_send_message_handler.py -k 'not official'` → **10 passed, 1 deselected**。既有成功路径测试断言未放宽，无回归。

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. 本 plan 仅新增一条失败断言（设计即 RED），无生产代码、无占位数据流；其 GREEN 化是 Wave 2 (08-02) 的既定职责。

## Self-Check: PASSED

- FOUND: tests/unit/application/conversation/test_send_message_handler.py（新方法 `test_semantic_router_called_with_official_runtime_mode` 存在，grep 命中）
- FOUND commit: cf7ae51（`test(08-consume-02-01): add failing test for DataChat official runtime_mode`，1 file +53）
- VERIFIED: `git status --short app/` 为空（零产品代码改动）
- VERIFIED: 新测试 RED（runtime_mode 断言失败），其余 10 测试全绿
