<!-- B-back-1: 用户偏好 GET/PUT -->

# B-back-1 · 用户偏好

**类型**: extend
**周**: W2
**关联前端**: P21
**migration**: `migrations/versions/20260420_01_add_user_preferences.py`

## 接口

- `GET  /api/v1/users/me/preferences`
- `PUT  /api/v1/users/me/preferences`（部分字段 merge，不覆盖）

## 字段

`theme` / `default_landing` / `list_page_size` / `table_density` / `extra` (JSON)

## 验收

- [ ] GET 未配置返回默认值，不 404
- [ ] PUT 部分字段 merge 而非覆盖
- [ ] PUT `theme=invalid` → 422
- [ ] 集成测试 `tests/integration/users/test_preferences.py` `@pytest.mark.redesign`
- [ ] OpenAPI 同步

详见 [02 §2](../02-backend-workstream.md#2-b-back-1--用户偏好)
