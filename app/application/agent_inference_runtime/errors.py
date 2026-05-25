"""Agent 推理 Runtime 错误。"""


class AgentInferenceRuntimeError(RuntimeError):
    def __init__(self, message: str, *, code: str, details: dict | None = None):
        super().__init__(message)
        self.code = code
        self.details = details or {}
