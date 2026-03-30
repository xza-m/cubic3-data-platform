"""
应用执行器抽象测试
"""
from app.domain.app_center.execution_context import (
    ExecutionContext,
    ExecutionResult,
    ExecutionStatus,
    TriggerType,
    ValidationResult,
)
from app.domain.app_center.executor import AppExecutor, ExecutorFactory, register_executor


class SampleExecutor(AppExecutor):
    def execute(self, context: ExecutionContext) -> ExecutionResult:
        return ExecutionResult(status=ExecutionStatus.SUCCESS, output={"instance_id": context.instance_id})

    def validate_config(self, config):
        return ValidationResult(is_valid=bool(config))

    def get_config_schema(self):
        return {"type": "object"}


class CustomCodeExecutor(AppExecutor):
    def execute(self, context: ExecutionContext) -> ExecutionResult:
        return ExecutionResult(status=ExecutionStatus.SUCCESS)

    def validate_config(self, config):
        return ValidationResult(is_valid=True)

    def get_config_schema(self):
        return {"type": "object"}

    def get_app_code(self) -> str:
        return "custom-code"


class TestAppExecutor:
    def test_default_contract_methods(self):
        executor = SampleExecutor()
        context = ExecutionContext(
            execution_id=1,
            instance_id=2,
            app_code="sample",
            instance_name="示例",
            config={"enabled": True},
            trigger_type=TriggerType.MANUAL,
        )

        result = executor.execute(context)
        validation = executor.validate_config({"enabled": True})

        assert executor.get_app_code() == "sample"
        assert executor.get_config_schema() == {"type": "object"}
        assert result.output == {"instance_id": 2}
        assert validation.is_valid is True
        assert executor.supports_event_trigger() is False
        assert executor.get_supported_events() == []

    def test_custom_app_code_override(self):
        assert CustomCodeExecutor().get_app_code() == "custom-code"


class TestExecutorFactory:
    def test_register_create_and_query_registered_apps(self):
        original = ExecutorFactory._executors.copy()
        try:
            ExecutorFactory._executors.clear()
            ExecutorFactory.register("sample", SampleExecutor)

            executor = ExecutorFactory.create("sample")

            assert isinstance(executor, SampleExecutor)
            assert ExecutorFactory.get_registered_apps() == ["sample"]
            assert ExecutorFactory.is_registered("sample") is True
            assert ExecutorFactory.is_registered("missing") is False
            assert ExecutorFactory.create("missing") is None
        finally:
            ExecutorFactory._executors = original

    def test_register_executor_decorator(self):
        original = ExecutorFactory._executors.copy()
        try:
            ExecutorFactory._executors.clear()

            @register_executor("decorated")
            class DecoratedExecutor(SampleExecutor):
                pass

            assert ExecutorFactory.is_registered("decorated") is True
            assert isinstance(ExecutorFactory.create("decorated"), DecoratedExecutor)
        finally:
            ExecutorFactory._executors = original
