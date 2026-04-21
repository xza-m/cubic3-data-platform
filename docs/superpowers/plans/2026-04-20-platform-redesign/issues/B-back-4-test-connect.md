<!-- B-back-4: 数据源测试连接增强 -->

# B-back-4 · 数据源测试连接增强

**类型**: extend
**周**: W2
**关联前端**: P15
**migration**: 无（纯接口字段补齐）

## 接口

- `POST /api/v1/datasources/:id/test`

成功返回 `latency_ms`、`tested_at`、`details.{server_version, tls}`；
失败返回 `error_code`、`error_message`、`hint`。

## 验收

- [ ] mock connector 抛超时 → 返回 `error_code=CONNECTION_TIMEOUT`
- [ ] 成功返回 `details` 完整字段
- [ ] 集成测试 `tests/integration/datasources/test_test_connection.py` `@pytest.mark.redesign`

详见 [02 §5](../02-backend-workstream.md#5-b-back-4--数据源测试连接增强)
