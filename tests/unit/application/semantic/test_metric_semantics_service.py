from types import SimpleNamespace

from app.application.semantic.metric_semantics_service import MetricSemanticsService


def test_build_metric_info_returns_standardized_fields():
    service = MetricSemanticsService()

    info = service.build_metric_info(
        "total_amount",
        SimpleNamespace(
            title="总金额",
            type="sum",
            description="已支付订单金额汇总",
            certified=True,
            format="currency",
            unit="yuan",
            non_additive=False,
        ),
    )

    assert info == {
        "name": "total_amount",
        "title": "总金额",
        "type": "sum",
        "description": "已支付订单金额汇总",
        "certified": True,
        "format": "currency",
        "unit": "yuan",
    }


def test_build_metric_info_and_map_cover_non_additive_and_defaults():
    service = MetricSemanticsService()

    info = service.build_metric_info(
        "retention",
        SimpleNamespace(
            title="留存率",
            type="number",
            description=None,
            certified=False,
            format=None,
            unit=None,
            non_additive=True,
        ),
    )
    metric_map = service.build_metric_map(
        {
            "retention": SimpleNamespace(
                title="留存率",
                type="number",
                description=None,
                certified=False,
                format=None,
                unit=None,
                non_additive=True,
            )
        }
    )

    assert info == {
        "name": "retention",
        "title": "留存率",
        "type": "number",
        "description": None,
        "certified": False,
        "non_additive": True,
    }
    assert metric_map["retention"]["non_additive"] is True
