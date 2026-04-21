<!-- B-back-2: App 实例 health 字段 -->

# B-back-2 · App 实例 health

**类型**: extend
**周**: W2
**关联前端**: P22
**migration**: 不需要新表（复用 `instance_heartbeats`）

## 接口

- `GET /api/v1/app-instances` 列表新增 `health`、`last_heartbeat_at`
- `GET /api/v1/app-instances/:id` 详情新增同字段

## 实现

- 阈值放 `app/config.py`：`HEALTH_DEGRADED_SECONDS=60`、`HEALTH_UNHEALTHY_SECONDS=180`
- 不引入实时推送

## 验收

- [ ] mock 心跳时间窗，断言 health 流转 healthy → degraded → unhealthy
- [ ] 集成测试 `tests/integration/app_instances/test_health.py` `@pytest.mark.redesign`

详见 [02 §3](../02-backend-workstream.md#3-b-back-2--app-实例-health)
