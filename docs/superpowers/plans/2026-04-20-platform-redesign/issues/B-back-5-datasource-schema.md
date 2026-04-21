<!-- B-back-5: 数据源 schema 浏览 -->

# B-back-5 · 数据源 schema 浏览

**类型**: extend
**周**: W2
**关联前端**: P16
**migration**: 无

## 接口

- `GET /api/v1/datasources/:id/schema`
- `GET /api/v1/datasources/:id/schema/:database`
- `GET /api/v1/datasources/:id/schema/:database/:table`

支持 `?refresh=1` 强制重拉；服务端缓存 5 分钟。

## 验收

- [ ] mock connector 返回 schema
- [ ] 冷调用与命中缓存差异
- [ ] 集成测试 `tests/integration/datasources/test_schema.py` `@pytest.mark.redesign`

详见 [02 §6](../02-backend-workstream.md#6-b-back-5--数据源-schema-浏览)
