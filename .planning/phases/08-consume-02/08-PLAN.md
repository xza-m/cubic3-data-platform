---
phase: 08-consume-02
plan: 01
type: tdd
wave: 1
depends_on: []
files_modified:
  - tests/unit/application/conversation/test_send_message_handler.py
autonomous: true
requirements: [CONSUME-02]
must_haves:
  truths:
    - "存在一条单测断言 _handle_via_semantic_router 调 execute_plan 时 kwargs 含 runtime_mode=='official'"
    - "该断言在未改 send_message_handler.py 前为 RED（当前未传 runtime_mode → 失败）"
  artifacts:
    - path: tests/unit/application/conversation/test_send_message_handler.py
      provides: "execute_plan(runtime_mode='official') 调用契约的失败断言"
      contains: "runtime_mode"
  key_links:
    - from: tests/unit/application/conversation/test_send_message_handler.py
      to: SendMessageHandler._handle_via_semantic_router
      via: "semantic_router_service.execute_plan.call_args.kwargs"
      pattern: "execute_plan.*call_args.*runtime_mode"
---

<objective>
Wave 1（RED）：为 DataChat 全局问数"切 official"立一条会失败的契约测试——断言 `SendMessageHandler._handle_via_semantic_router` 在调用 `semantic_router_service.execute_plan(...)` 时，kwargs 必须包含 `runtime_mode="official"`。

Purpose: 这是 D1（DataChat 切 official）的 TDD 锚点。当前 handler `:93-96` 只传 `question` 与 `viewer_roles`，不传 `runtime_mode`，所以这条断言现在必然失败（RED）。Wave 2 改 handler 后转 GREEN。先 RED 坐实"切 official 这一步确实尚未发生"，避免空过。

Output: `tests/unit/application/conversation/test_send_message_handler.py` 新增 1 个测试方法，运行即失败（断言 runtime_mode 缺失）。

**本 plan 只写测试、不改产品代码。** Wave 2（08-02）才改 handler 让它转绿。
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/08-consume-02/08-CONTEXT.md

<interfaces>
<!-- 事实源：handler 当前调用点（未传 runtime_mode），以及现有 semantic router 成功路径测试样式。 -->
<!-- 执行者直接复用下面契约，无需再翻代码库。 -->

app/application/conversation/handlers/send_message_handler.py :93-96（当前调用，缺 runtime_mode）：
```python
plan_result = self.semantic_router_service.execute_plan(
    question=command.content,
    viewer_roles=[],
)
```

现有成功路径测试样式（tests/unit/application/conversation/test_send_message_handler.py :214-261，TestSendMessageHandlerAgent.test_semantic_router_success_short_circuits_agent_and_legacy）：
- `semantic_router_service = MagicMock()`，注入 handler；
- `conversation` 为 MagicMock，`user_id="user_123"`、`dataset_id=10`；
- `msg_repo.create.side_effect = [user_message, ai_message]`（两次 create：先 user 后 assistant）；
- `semantic_router_service.execute_plan.return_value = {"route": {"route_type": "cube"}, "execution_results": [{...status:"executed", target_type:"sql", result:{...}, traceability:{...}}], "traceability": {...}}`；
- 调 `handler.handle(SendMessageCommand(conversation_id=1, user_id="user_123", content="..."))`；
- 断言用 `semantic_router_service.execute_plan.assert_called_once()` 与 `execute_plan.call_args`。

execute_plan 的契约（app/application/semantic_router/preview_service.py :582）：
```python
def execute_plan(self, *, question, viewer_roles=None, principal_context=None,
                 runtime_options=None, runtime_mode=None) -> Dict[str, Any]: ...
```
全部为 keyword-only 参数；故断言应读 `call_args.kwargs["runtime_mode"]`。
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: 写 RED 测试断言 execute_plan 收到 runtime_mode="official"</name>
  <files>tests/unit/application/conversation/test_send_message_handler.py</files>
  <read_first>
    - tests/unit/application/conversation/test_send_message_handler.py :213-261（TestSendMessageHandlerAgent.test_semantic_router_success_short_circuits_agent_and_legacy — 复用其 fixture/mock 搭法与 execution_results 形状）
    - app/application/conversation/handlers/send_message_handler.py :89-96（_handle_via_semantic_router 当前只传 question/viewer_roles，是被测对象）
    - app/application/semantic_router/preview_service.py :582-643（execute_plan 签名：runtime_mode 为 keyword-only，默认 None）
  </read_first>
  <behavior>
    - Test（RED）：构造注入了 MagicMock semantic_router_service 的 SendMessageHandler，给定一个成功的 execute_plan 返回值（route_type=cube + 一条 executed sql execution_result），调 handler.handle(...) 后，断言 `semantic_router_service.execute_plan.call_args.kwargs.get("runtime_mode") == "official"`。
    - 当前实现不传 runtime_mode → `call_args.kwargs` 无该键 → 断言失败（RED）。这正是预期。
  </behavior>
  <action>
    在 `tests/unit/application/conversation/test_send_message_handler.py` 的 `TestSendMessageHandlerAgent` 类内（紧跟 `test_semantic_router_success_short_circuits_agent_and_legacy` 之后）新增测试方法 `test_semantic_router_called_with_official_runtime_mode(self, mock_repos)`：

    1. 复用 `test_semantic_router_success_short_circuits_agent_and_legacy` 的搭法：`conv_repo, msg_repo, dataset_repo, llm_service = mock_repos`；`semantic_router_service = MagicMock()`；构造 `SendMessageHandler(..., semantic_router_service=semantic_router_service)`。
    2. `conversation = MagicMock()`，设 `conversation.user_id = "user_123"`、`conversation.dataset_id = 10`，`conv_repo.find_by_id.return_value = conversation`。
    3. `user_message`/`ai_message` 各为 MagicMock 并设 `.to_dict.return_value`，`msg_repo.create.side_effect = [user_message, ai_message]`。
    4. `semantic_router_service.execute_plan.return_value = {"route": {"route_type": "cube"}, "execution_results": [{"status": "executed", "target_type": "sql", "result": {"columns": [], "data": [], "row_count": 1}, "traceability": {}}], "traceability": {}}`。
    5. 调 `handler.handle(SendMessageCommand(conversation_id=1, user_id="user_123", content="学生答题统计 总数"))`。
    6. **核心断言（会 RED）**：`call_kwargs = semantic_router_service.execute_plan.call_args.kwargs`，然后 `assert call_kwargs.get("runtime_mode") == "official"`。再保留 `assert call_kwargs.get("question") == "学生答题统计 总数"` 锚定问法。

    问法用 CONTEXT.md 实测口径 "学生答题统计 总数"（official 下命中 student_total_count）。不要改任何产品代码；不要把现有成功路径测试的断言放宽。
  </action>
  <verify>
    <automated>PYTHONPATH=. /Users/xuan/miniconda3/bin/python -m pytest --no-cov -q -p no:cacheprovider tests/unit/application/conversation/test_send_message_handler.py::TestSendMessageHandlerAgent::test_semantic_router_called_with_official_runtime_mode</automated>
  </verify>
  <acceptance_criteria>
    - 该测试 **FAIL**（RED），失败信息指向 `runtime_mode` 断言（None != "official" 或 KeyError/.get 返回 None）。
    - `grep -n 'runtime_mode.*official' tests/unit/application/conversation/test_send_message_handler.py` 命中新断言。
    - `grep -n 'def test_semantic_router_called_with_official_runtime_mode' tests/unit/application/conversation/test_send_message_handler.py` 命中新方法。
    - 同文件其余既有测试不受影响：`PYTHONPATH=. /Users/xuan/miniconda3/bin/python -m pytest --no-cov -q -p no:cacheprovider tests/unit/application/conversation/test_send_message_handler.py -k 'not official'` 全绿。
  </acceptance_criteria>
  <done>新增测试方法存在且当前为 RED（断言 runtime_mode=="official" 失败），其余测试不回归。</done>
</task>

</tasks>

<verification>
- 新测试运行结果为 FAIL，且失败点是 runtime_mode 断言（不是 import error / fixture error）。
- 不存在任何 app/ 下产品代码改动（本 plan 纯测试）。
- `git diff --name-only` 仅含 tests/unit/application/conversation/test_send_message_handler.py。
</verification>

<success_criteria>
- RED 测试就位，坐实"handler 尚未传 official"。
- 为 08-02（GREEN）提供可转绿的精确契约。
</success_criteria>

<output>
完成后创建 `.planning/phases/08-consume-02/08-01-SUMMARY.md`，记录：新增测试方法名、RED 失败信息摘要、execute_plan 契约确认（keyword-only runtime_mode）。
</output>
