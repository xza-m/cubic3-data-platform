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
