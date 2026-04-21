<!-- B-back-3: 语义 view 物化 -->

# B-back-3 · 语义 view 物化

**类型**: extend
**周**: W2
**关联前端**: P11
**migration**: `migrations/versions/20260420_02_add_view_materialize.py`

## 接口

- `GET /api/v1/semantic/views/:id` 返回 `materialized_at`、`materialize_status`
- `POST /api/v1/semantic/views/:id/materialize` 异步触发，返回 `run_id`
- `GET /api/v1/semantic/views/:id/materialize/runs?page=...`

## 验收

- [ ] 触发后 GET → status=running
- [ ] mock worker 完成 → status=idle 且 `materialized_at` 更新
- [ ] 集成测试 `tests/integration/semantic/test_view_materialize.py` `@pytest.mark.redesign`

详见 [02 §4](../02-backend-workstream.md#4-b-back-3--语义-view-物化)
