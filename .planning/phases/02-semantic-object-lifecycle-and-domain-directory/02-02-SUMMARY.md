# 02-02 Summary

## Outcome

- `SemanticDefinitionService` 为 `Cube` 列表与详情补齐 `domain_ids`、`domains`、`domain_count`，同时保留兼容投影字段 `domain_id / domain_name`。
- `Cube.domain_id` 的兼容投影规则被固定为确定性逻辑：优先使用可解析的原字段，否则按领域 `code` 升序选取第一个相关领域。
- `View` 列表摘要新增 `status / state_summary / publish_summary / cubes`，`Recipe` 列表摘要新增 `state_summary / related_cubes`，语义对象的轻量治理信息开始统一出口。
- `/semantic/views` 与 `/semantic/recipes` API 优先走语义定义服务的摘要方法，对前端暴露稳定的统一摘要契约。

## Key Files

- `app/application/semantic/semantic_definition_service.py`
- `app/interfaces/api/v1/semantic.py`
- `tests/unit/application/semantic/test_semantic_definition_service.py`
- `tests/unit/application/semantic/test_view_publish_service.py`
- `tests/integration/test_semantic_api.py`

## Verification

- `PYTHONPATH=. python -m pytest --no-cov tests/unit/application/semantic/test_semantic_definition_service.py`
- `PYTHONPATH=. python -m pytest --no-cov tests/unit/application/semantic/test_view_publish_service.py`
- `PYTHONPATH=. python -m pytest --no-cov tests/integration/test_semantic_api.py`
- `PYTHONPATH=. python -m pytest --no-cov tests/unit/application/semantic/test_semantic_definition_service.py tests/unit/application/semantic/test_view_publish_service.py tests/integration/test_semantic_api.py`

## Notes

- `View` 与 `Recipe` 在 Phase 2 仍然保持轻量治理对象定位，没有引入新的重型编辑工作流。
