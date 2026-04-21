<!-- B-back-8: ScheduledQuery -->

# B-back-8 · ScheduledQuery (new-backend)

**类型**: new
**周**: W3 ~ W4
**关联前端**: Q-sched
**migration**: `migrations/versions/20260420_03_add_scheduled_queries.py`
**ADR**: [ADR-001 调度器选型](../../../adr/001-scheduled-query-runner.md)

## 接口

```http
GET    /api/v1/queries/scheduled
POST   /api/v1/queries/scheduled
GET    /api/v1/queries/scheduled/:id
PATCH  /api/v1/queries/scheduled/:id
DELETE /api/v1/queries/scheduled/:id
POST   /api/v1/queries/scheduled/:id/enable
POST   /api/v1/queries/scheduled/:id/disable
POST   /api/v1/queries/scheduled/:id/trigger
GET    /api/v1/queries/scheduled/:id/runs
```

## 实现要点

- 调度器选型见 ADR-001（W3 内拍板）
- 复用现有 `app/infrastructure/scheduler/`（如未启用，本期启用）

## 验收

- [ ] cron 解析正确
- [ ] enable/disable 幂等
- [ ] 手动触发不影响下次定时
- [ ] 失败统计正确
- [ ] 集成测试 `tests/integration/queries/test_scheduled.py` `@pytest.mark.redesign`

详见 [02 §9](../02-backend-workstream.md#9-b-back-8--scheduledquerynew-backend)
