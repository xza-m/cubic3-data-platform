"""语义层 API 共享工具与日志器。

`logger` 必须全包共享同一个实例：单测会通过 ``semantic_api.logger`` 打补丁。
"""
import os

from app.shared.utils.logger import get_logger

logger = get_logger('app.interfaces.api.v1.semantic')


def _json_scalar(value):
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return None


def _extract_view_cube_name(ref):
    """兼容 ViewCubeRef 和旧测试里的字符串引用。"""
    if isinstance(ref, str):
        return ref.strip() or None
    join_path = getattr(ref, "join_path", None)
    if not isinstance(join_path, str) or not join_path.strip():
        return None
    return join_path.split(">", 1)[0].split(".", 1)[0].strip() or None


def _default_query_adapter_getter():
    from app.executors.schema_drift_executor import SchemaDriftExecutor

    return SchemaDriftExecutor._get_maxcompute_adapter()


def _semantic_base():
    # _shared.py 位于 app/interfaces/api/v1/semantic/，向上回到 app/ 后定位语义文件仓储
    app_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
    return os.path.join(app_root, "infrastructure", "semantic")
