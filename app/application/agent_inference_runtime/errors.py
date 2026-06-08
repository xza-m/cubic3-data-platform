"""Agent 推理 Runtime 错误。"""


class AgentInferenceRuntimeError(RuntimeError):
    def __init__(self, message: str, *, code: str, details: dict | None = None):
        super().__init__(message)
        self.code = code
        self.details = details or {}


class RuntimeProviderOperationError(Exception):
    """平台 runtime provider 管理操作失败。"""

    def __init__(
        self,
        message: str,
        *,
        code: str,
        status_code: int = 400,
        details: dict | None = None,
    ):
        super().__init__(message)
        self.code = code
        self.status_code = status_code
        self.details = details or {}
