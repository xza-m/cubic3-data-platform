<!-- B-back-7: Cube 派生字段 -->

# B-back-7 · Cube list 派生字段

**类型**: extend
**周**: W3
**关联前端**: Cube 卡片
**migration**: 无（首期不物化；如需，第二阶段 ADR）

## 接口

- `GET /api/v1/semantic/cubes` 每条 cube 新增：
  - `dimension_count`
  - `measure_count`
  - `downstream_bi_count`
  - `last_modified_at`

## 实现

cube 仓储层 join + group by 一次取齐；前端不再 N+1。

## 验收

- [ ] 100 个 cube 列表查询 P95 ≤ 300ms（基准压测）
- [ ] 集成测试 `tests/integration/semantic/test_cube_list_derivatives.py` `@pytest.mark.redesign`

详见 [02 §8](../02-backend-workstream.md#8-b-back-7--cube-派生字段)
