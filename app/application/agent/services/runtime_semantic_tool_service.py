"""Agent 语义工具的运行时门面。

Cube 定义统一来自 active runtime snapshot manifest（`RuntimeSemanticCatalog`），
不再读取 YAML 仓储；执行仍经 `SemanticRuntimeBindingService` 解析真实数据源。
查询与目录结果统一携带 `release_id / snapshot_id`，作为 evidence 的 release pin 最小落点。
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.application.semantic.runtime_manifest_catalog import RuntimeSemanticCatalog
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class RuntimeSemanticToolService:
    """面向 Agent 工具集（list_cubes / describe_cube / query）的运行时查询门面。"""

    def __init__(
        self,
        *,
        runtime_snapshot_service: Any,
        runtime_binding_service: Any = None,
        domain_repo: Any = None,
        namespace: str = "default",
        pin_config_provider: Any = None,
    ):
        self._runtime_snapshot_service = runtime_snapshot_service
        self._runtime_binding_service = runtime_binding_service
        self._domain_repo = domain_repo
        self._namespace = namespace
        # §6.1 消费方 pin：返回 {"semantic_pin": {"pin_policy", "release_id"}} 或
        # 直接返回 pin dict 的 callable（data_agent 实例 config 落点）
        self._pin_config_provider = pin_config_provider

    # ── 目录工具 ──

    def list_cubes(self) -> List[Dict[str, Any]]:
        catalog, manifest, error = self._load_catalog()
        if error is not None:
            # ToolExecutor._handle_list_cubes 期望 list；错误经异常路径返回
            raise RuntimeError(error["error"])
        runtime = self._runtime_metadata(catalog, manifest)
        cubes = []
        for cube in catalog.cube_repository.list_all():
            cubes.append(
                {
                    "name": cube.name,
                    "title": cube.title,
                    "description": cube.description,
                    "status": cube.status,
                    "dimensions": [
                        {"name": name, "title": dim.title, "type": dim.type}
                        for name, dim in cube.dimensions.items()
                    ],
                    "measures": [
                        {"name": name, "title": measure.title, "type": measure.type}
                        for name, measure in cube.measures.items()
                    ],
                    "runtime": runtime,
                }
            )
        return cubes

    def describe_cube(self, cube_name: str) -> Dict[str, Any]:
        catalog, manifest, error = self._load_catalog()
        if error is not None:
            return error
        cube = catalog.cube_repository.get(cube_name)
        if cube is None:
            available = [item.name for item in catalog.cube_repository.list_all()]
            return {
                "error": f"未找到 Cube: {cube_name}",
                "error_code": "cube_not_found",
                "available_cubes": available,
            }
        payload = cube.model_dump(mode="json")
        payload["runtime"] = self._runtime_metadata(catalog, manifest)
        return payload

    # ── 查询工具 ──

    def compile_and_execute(self, dsl_dict: Dict[str, Any], adapter: Any = None) -> Dict[str, Any]:
        catalog, manifest, error = self._load_catalog()
        if error is not None:
            return error
        from app.application.semantic.semantic_query_service import SemanticQueryService

        query_service = SemanticQueryService(
            cube_repo=catalog.cube_repository,
            runtime_binding_service=self._runtime_binding_service,
            domain_repo=self._domain_repo,
        )
        result = query_service.query(dsl_dict, adapter)
        if isinstance(result, dict):
            result["runtime"] = self._runtime_metadata(catalog, manifest)
        return result

    def query(self, dsl_dict: Dict[str, Any], adapter: Any = None) -> Dict[str, Any]:
        return self.compile_and_execute(dsl_dict, adapter)

    # ── 内部 ──

    def _resolve_pinned_release_id(self) -> Optional[str]:
        """解析消费方 pin 配置：pin_policy=pinned 时返回 release_id，否则 None。"""
        provider = self._pin_config_provider
        if not callable(provider):
            return None
        try:
            config = provider() or {}
        except Exception as exc:  # pin 配置读取失败时退回 track_active，不阻断查询
            logger.warning("runtime_semantic_tool_pin_config_failed", error=str(exc))
            return None
        if not isinstance(config, dict):
            return None
        pin = config.get("semantic_pin") if "semantic_pin" in config else config
        if not isinstance(pin, dict):
            return None
        if str(pin.get("pin_policy") or "track_active") != "pinned":
            return None
        release_id = str(pin.get("release_id") or "").strip()
        return release_id or None

    def _load_catalog(
        self,
    ) -> tuple[Optional[RuntimeSemanticCatalog], Dict[str, Any], Optional[Dict[str, Any]]]:
        pinned_release_id = self._resolve_pinned_release_id()
        if pinned_release_id:
            # 求值与编译同 release：pinned 消费方经不可变 release_id 解析 manifest
            manifest = self._runtime_snapshot_service.get_manifest_for_release(pinned_release_id)
        else:
            manifest = self._runtime_snapshot_service.get_active_manifest(self._namespace)
        if not manifest.get("ok"):
            error_code = str(manifest.get("error_code") or "semantic_runtime_not_ready")
            logger.warning("runtime_semantic_tool_manifest_unavailable", error_code=error_code)
            if error_code == "release_revoked":
                return None, manifest, {
                    "error": "当前语义发布已被撤销（口径召回），请回滚到健康 release 后重试。",
                    "error_code": error_code,
                    "status_reason": manifest.get("status_reason"),
                    "release_id": manifest.get("release_id"),
                    "retryable": False,
                }
            return None, manifest, {
                "error": "语义层运行时尚未就绪：没有可用的 active manifest，请先发布语义资产。",
                "error_code": error_code,
                "retryable": False,
            }
        try:
            catalog = RuntimeSemanticCatalog.from_manifest(manifest)
        except ValueError as exc:
            logger.error("runtime_semantic_tool_manifest_invalid", error=str(exc))
            return None, manifest, {
                "error": f"语义层 manifest 不可用: {exc}",
                "error_code": "semantic_runtime_manifest_invalid",
                "retryable": False,
            }
        return catalog, manifest, None

    @staticmethod
    def _runtime_metadata(
        catalog: RuntimeSemanticCatalog,
        manifest: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        metadata = {
            "release_id": catalog.binding_metadata.get("runtime_release_id"),
            "snapshot_id": catalog.binding_metadata.get("runtime_snapshot_id"),
            "release_no": catalog.binding_metadata.get("runtime_release_no"),
            "catalog_source": "runtime_manifest",
        }
        if manifest:
            metadata["release_status"] = manifest.get("release_status")
            if manifest.get("warnings"):
                metadata["warnings"] = list(manifest["warnings"])
        return metadata
