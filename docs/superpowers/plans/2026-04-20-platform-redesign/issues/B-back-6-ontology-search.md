<!-- B-back-6: 本体对象搜索 -->

# B-back-6 · 本体对象搜索

**类型**: extend
**周**: W2
**关联前端**: P19
**migration**: 无

## 接口

- `GET /api/v1/ontology/objects?q=<keyword>&field=name|description|metric_name`

`q` 走 ILIKE；`field` 默认 `name`，可多值。
限速：1 用户 30 req / min。

## 验收

- [ ] 含中文 / 大小写不敏感
- [ ] 多字段组合
- [ ] 集成测试 `tests/integration/ontology/test_object_search.py` `@pytest.mark.redesign`

详见 [02 §7](../02-backend-workstream.md#7-b-back-6--本体对象搜索)
