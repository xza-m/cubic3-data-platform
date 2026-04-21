<!-- B-back-9: SemanticDiagnoseRun -->

# B-back-9 · SemanticDiagnoseRun (new-backend)

**类型**: new
**周**: W3 ~ W4
**关联前端**: Diag-history
**migration**: `migrations/versions/20260420_04_add_diagnose_runs.py`

## 接口

```http
POST /api/v1/semantic/diagnose             # 同步诊断 + 落库
GET  /api/v1/semantic/diagnose/runs        # 列表
GET  /api/v1/semantic/diagnose/runs/:id    # 详情
```

## 实现

- 改造现有 `POST /semantic/diagnose` 在调用结束后落 `semantic_diagnose_runs`
- 30 天保留期：`scripts/cleanup_diagnose_runs.py` 周清理

## 验收

- [ ] 诊断成功/失败均落库
- [ ] 列表分页
- [ ] 详情幂等读取
- [ ] 集成测试 `tests/integration/semantic/test_diagnose_runs.py` `@pytest.mark.redesign`

详见 [02 §10](../02-backend-workstream.md#10-b-back-9--semanticdiagnoserunnew-backend)
