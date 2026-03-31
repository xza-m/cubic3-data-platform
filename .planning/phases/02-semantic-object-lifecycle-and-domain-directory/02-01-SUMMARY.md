# 02-01 Summary

## Outcome

- `Domain.cubes[]` 与领域画布被正式收敛为 `Cube` 归属关系的唯一真相，`Cube.domain_id` 不再参与反向写回。
- `DomainModelingService` 统一引入保序去重规则，同一领域内重复引用同一个 `Cube` 会在发布前得到明确错误提示。
- 领域详情与领域画布统一输出 `governance_summary`，并为库中 `Cube` 补齐 `related_domain_ids`、`related_domain_names`、`domain_count` 多领域投影。
- 多领域投影采用单次聚合索引生成，避免按 `Cube` 逐个重复扫描全部领域。

## Key Files

- `app/application/semantic/domain_modeling_service.py`
- `app/application/semantic/domain_canvas_service.py`
- `tests/unit/application/semantic/test_domain_modeling_service.py`
- `tests/unit/application/semantic/test_domain_canvas_service.py`

## Verification

- `PYTHONPATH=. python -m pytest --no-cov tests/unit/application/semantic/test_domain_modeling_service.py`
- `PYTHONPATH=. python -m pytest --no-cov tests/unit/application/semantic/test_domain_canvas_service.py`
- `PYTHONPATH=. python -m pytest --no-cov tests/unit/application/semantic/test_domain_modeling_service.py tests/unit/application/semantic/test_domain_canvas_service.py`

## Notes

- Phase 2 仍然只支持跨领域复用同一个 `Cube`，没有引入“同一领域内重复实例化同一个 `Cube` 且使用不同 Join 条件”的高级建模能力。
