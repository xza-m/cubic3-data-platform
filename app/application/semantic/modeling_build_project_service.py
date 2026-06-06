"""语义建设 Build Project 应用服务。"""
from __future__ import annotations

import hashlib
from copy import deepcopy
from typing import Any, Dict, Protocol

from app.domain.semantic.modeling_build_project import (
    FieldCandidate,
    ModelingAssetPackage,
    ModelingBuildProject,
    RiskLevel,
    create_asset_package_id,
    normalize_build_project_id,
    refresh_package_review_state,
)


class IModelingBuildProjectRepository(Protocol):
    """Build Project 仓储协议，避免工作台服务运行时依赖外部 port 文件。"""

    def get_project(self, project_id: str) -> ModelingBuildProject | None: ...

    def save_project(self, project: ModelingBuildProject) -> None: ...

    def list_projects(
        self,
        principal_id: str | None = None,
        *,
        limit: int = 50,
    ) -> list[ModelingBuildProject]: ...

    def get_package(self, package_id: str) -> ModelingAssetPackage | None: ...

    def list_packages(self, project_id: str) -> list[ModelingAssetPackage]: ...

    def save_package(self, package: ModelingAssetPackage) -> None: ...

    def save_scan_result(
        self,
        project: ModelingBuildProject,
        packages: list[ModelingAssetPackage],
    ) -> None: ...


class ModelingBuildProjectService:
    """语义中心冷启动建设项目服务。"""

    def __init__(self, repository: IModelingBuildProjectRepository):
        self.repository = repository

    def create_project(
        self,
        payload: Dict[str, Any],
        *,
        principal_id: str | None = None,
    ) -> Dict[str, Any]:
        name = self._required_text(payload, "name", fallback=payload.get("business_domain"))
        business_domain = self._required_text(payload, "business_domain", fallback=name)
        scope = dict(payload.get("scope") or {})
        project_id = normalize_build_project_id(str(payload.get("id") or name))
        batch_run_id = self._normalize_batch_run_id(scope.get("batch_run_id"))
        if batch_run_id and not payload.get("id"):
            project_id = f"{project_id}-{batch_run_id}"
        existing = self.repository.get_project(project_id)
        if existing is not None:
            if existing.created_by and existing.created_by != principal_id:
                raise PermissionError("Build Project ID 已被其他用户占用")
            return self._dump_project(existing)
        project = ModelingBuildProject(
            id=project_id,
            name=name,
            business_domain=business_domain,
            created_by=principal_id,
            scope=scope,
        )
        self.repository.save_project(project)
        return self._dump_project(project)

    def list_projects(
        self,
        *,
        principal_id: str | None = None,
        limit: int = 50,
    ) -> Dict[str, Any]:
        if limit < 1 or limit > 100:
            raise ValueError("limit 必须在 1 到 100 之间")
        items = [
            self._dump_project(item)
            for item in self.repository.list_projects(principal_id, limit=limit)
        ]
        return {"items": items, "total": len(items), "limit": limit}

    def get_project(
        self,
        project_id: str,
        *,
        principal_id: str | None = None,
    ) -> Dict[str, Any]:
        project = self._require_project(project_id, principal_id)
        packages = self.repository.list_packages(project.id)
        result = self._dump_project(self._with_package_summary(project, packages))
        result["asset_packages"] = [package.model_dump(mode="json") for package in packages]
        return result

    def scan_project(
        self,
        project_id: str,
        payload: Dict[str, Any] | None = None,
        *,
        principal_id: str | None = None,
    ) -> Dict[str, Any]:
        project = self._require_project(project_id, principal_id)
        scope = dict(project.scope or {})
        strategy = str((payload or {}).get("strategy") or scope.get("strategy") or "balanced")
        existing_packages = {
            package.id: package for package in self.repository.list_packages(project.id)
        }
        if scope.get("recommendation_empty"):
            packages = [
                self._preserve_review_fields(package, existing_packages.get(package.id))
                for package in self._fallback_packages_from_scope(project, strategy)
            ]
        else:
            packages = [
                self._preserve_review_fields(package, existing_packages.get(package.id))
                for package in self._deterministic_packages(project, strategy)
            ]
        project.status = "scanned"
        self.repository.save_scan_result(self._with_package_summary(project, packages), packages)
        return self.get_project(project.id, principal_id=principal_id)

    def get_asset_package(
        self,
        project_id: str,
        package_id: str,
        *,
        principal_id: str | None = None,
    ) -> Dict[str, Any]:
        project = self._require_project(project_id, principal_id)
        package = self._require_package(project.id, package_id)
        return package.model_dump(mode="json")

    def get_package_proposal_readiness(
        self,
        project_id: str,
        package_id: str,
        *,
        principal_id: str | None = None,
    ) -> Dict[str, Any]:
        project = self._require_project(project_id, principal_id)
        package = self._require_package(project.id, package_id)
        package = refresh_package_review_state(package)
        self.repository.save_package(package)
        return package.proposal_readiness.model_dump(mode="json")

    def update_asset_package(
        self,
        project_id: str,
        package_id: str,
        payload: Dict[str, Any],
        *,
        principal_id: str | None = None,
    ) -> Dict[str, Any]:
        project = self._require_project(project_id, principal_id)
        package = self._require_package(project.id, package_id)
        next_payload = package.model_dump(mode="json")
        allowed_fields = {
            "status",
            "risk",
            "evidence",
            "ontology_suggestions",
            "cube_suggestions",
        }
        for field in allowed_fields:
            if field in payload:
                next_payload[field] = deepcopy(payload[field])
        updated = refresh_package_review_state(ModelingAssetPackage(**next_payload))
        self.repository.save_package(updated)

        packages = self.repository.list_packages(project.id)
        project = self._with_package_summary(project, packages)
        if updated.status == "in_review" and project.status in {"draft", "scanned"}:
            project.status = "in_review"
        self.repository.save_project(project)
        return updated.model_dump(mode="json")

    def apply_asset_package_action(
        self,
        project_id: str,
        package_id: str,
        payload: Dict[str, Any],
        *,
        principal_id: str | None = None,
    ) -> Dict[str, Any]:
        project = self._require_project(project_id, principal_id)
        package = self._require_package(project.id, package_id)
        action = str(payload.get("action") or "").strip()
        reason = str(payload.get("reason") or "").strip()
        if action not in {"defer", "mark_duplicate", "regenerate", "split", "merge"}:
            raise ValueError("action 必须是 defer、mark_duplicate、regenerate、split 或 merge")
        if action == "defer":
            package.status = "deferred"
            self._record_operation(package, action, reason)
            self.repository.save_package(package)
            return package.model_dump(mode="json")
        if action == "mark_duplicate":
            package.status = "duplicate_candidate"
            self._record_operation(package, action, reason)
            self.repository.save_package(package)
            return package.model_dump(mode="json")
        if action == "regenerate":
            package.status = "needs_scope"
            package.risk = "medium"
            package.evidence = ["已退回重生成，等待重新扫描候选证据。"]
            self._record_operation(package, action, reason)
            package = refresh_package_review_state(package)
            self.repository.save_package(package)
            packages = self.repository.list_packages(project.id)
            self.repository.save_project(self._with_package_summary(project, packages))
            return package.model_dump(mode="json")
        if action == "split":
            return self._split_package(project, package, payload, reason)
        return self._merge_package(project, package, payload, reason)

    def _deterministic_packages(
        self,
        project: ModelingBuildProject,
        strategy: str,
    ) -> list[ModelingAssetPackage]:
        risk: RiskLevel = "medium" if strategy == "exploratory" else "low"
        domain = project.business_domain
        packages = [
            ModelingAssetPackage(
                id=create_asset_package_id(project.id, "dwd_learning_activity_df", "fact"),
                project_id=project.id,
                title=f"{domain}事实主题候选",
                package_type="fact",
                source="dwd_learning_activity_df",
                grain="一条学习行为事件",
                confidence=0.88,
                risk=risk,
                evidence=[
                    "表画像显示行为时间、学生、课程和学校字段完整。",
                    "血缘使用中已被学情报表消费。",
                ],
                modeling_source=self._modeling_source(
                    "dwd_learning_activity_df",
                    title=f"{domain}事实主题候选",
                    columns=[
                        {"name": "activity_id", "type": "string", "comment": "学习行为 ID"},
                        {"name": "student_id", "type": "string", "comment": "学生 ID"},
                        {"name": "school_id", "type": "string", "comment": "学校 ID"},
                        {"name": "course_id", "type": "string", "comment": "课程 ID"},
                        {"name": "activity_type", "type": "string", "comment": "学习行为类型"},
                        {"name": "activity_time", "type": "datetime", "comment": "行为发生时间"},
                        {"name": "duration_sec", "type": "bigint", "comment": "学习时长秒数"},
                        {"name": "ds", "type": "string", "comment": "分区日期", "is_partition": True},
                    ],
                ),
                ontology_suggestions=[
                    {"type": "object", "name": "learning_activity", "title": "学习行为"}
                ],
                cube_suggestions={
                    "dimensions": ["student_id", "school_id", "course_id"],
                    "measures": ["activity_count"],
                },
            ),
            ModelingAssetPackage(
                id=create_asset_package_id(project.id, "dim_school_df", "dimension"),
                project_id=project.id,
                title=f"{domain}学校维度候选",
                package_type="dimension",
                source="dim_school_df",
                grain="一所学校",
                confidence=0.91,
                risk="low",
                evidence=[
                    "维表主键稳定，字段中文名与业务术语一致。",
                    "已有语义中心对象可作为复用参考。",
                ],
                modeling_source=self._modeling_source(
                    "dim_school_df",
                    title=f"{domain}学校维度候选",
                    columns=[
                        {"name": "school_id", "type": "string", "comment": "学校 ID"},
                        {"name": "school_name", "type": "string", "comment": "学校名称"},
                        {"name": "province", "type": "string", "comment": "省份"},
                        {"name": "city", "type": "string", "comment": "城市"},
                        {"name": "ds", "type": "string", "comment": "分区日期", "is_partition": True},
                    ],
                ),
                ontology_suggestions=[
                    {"type": "object", "name": "school", "title": "学校"}
                ],
                cube_suggestions={
                    "dimensions": ["school_id", "school_name"],
                    "measures": [],
                },
            ),
            ModelingAssetPackage(
                id=create_asset_package_id(
                    project.id,
                    "dws_learning_student_activity_di",
                    "metric",
                ),
                project_id=project.id,
                title=f"{domain}活跃学生指标候选",
                package_type="metric",
                source="dws_learning_student_activity_di",
                grain="按天、学生聚合",
                confidence=0.79,
                risk="medium",
                status="needs_scope",
                evidence=[
                    "存在多种活跃口径，需要业务 owner 确认。",
                    "可从最近 7 天查询需求回推时间过滤口径。",
                ],
                modeling_source=self._modeling_source(
                    "dws_learning_student_activity_di",
                    title=f"{domain}活跃学生指标候选",
                    columns=[
                        {"name": "ds", "type": "string", "comment": "统计日期", "is_partition": True},
                        {"name": "student_id", "type": "string", "comment": "学生 ID"},
                        {"name": "school_id", "type": "string", "comment": "学校 ID"},
                        {"name": "active_days", "type": "bigint", "comment": "活跃天数"},
                        {"name": "activity_count", "type": "bigint", "comment": "学习行为次数"},
                    ],
                ),
                ontology_suggestions=[
                    {
                        "type": "metric",
                        "name": "active_student_count",
                        "title": "活跃学生数",
                    }
                ],
                cube_suggestions={
                    "dimensions": ["dt", "student_id"],
                    "measures": ["active_student_count"],
                },
            ),
        ]
        return [refresh_package_review_state(package) for package in packages]

    @staticmethod
    def _modeling_source(
        table: str,
        *,
        title: str,
        columns: list[Dict[str, Any]],
        source_id: int = 1,
        database: str = "dw",
        schema: str | None = None,
    ) -> Dict[str, Any]:
        """生成候选包进入单资产 builder 所需的最小建模源证据。"""

        return {
            "source_kind": "physical_table",
            "source_id": source_id,
            "database": database,
            "schema": schema,
            "table": table,
            "name": table,
            "title": title,
            "asset_ref": {
                "kind": "physical_table",
                "source_id": source_id,
                "database": database,
                "schema": schema,
                "table": table,
            },
            "evidence_bundle": {
                "schema_snapshot": {
                    "snapshot_id": f"workbench:{database}:{table}",
                    "database": database,
                    "schema": schema,
                    "table": table,
                    "title": title,
                    "columns": columns,
                    "partitions": [
                        column["name"]
                        for column in columns
                        if column.get("is_partition") or column.get("partition")
                    ],
                }
            },
        }

    def _fallback_packages_from_scope(
        self,
        project: ModelingBuildProject,
        strategy: str,
    ) -> list[ModelingAssetPackage]:
        selected_sources = [
            str(source).strip()
            for source in list(project.scope.get("selected_sources") or [])
            if str(source).strip()
        ]
        if not selected_sources:
            manual_source = str(project.scope.get("manual_selected_source") or "").strip()
            selected_sources = [manual_source or "manual_selected_source"]
        risk: RiskLevel = "medium" if strategy != "exploratory" else "high"
        packages: list[ModelingAssetPackage] = []
        for source in selected_sources:
            source_name = source or "manual_selected_source"
            packages.append(
                ModelingAssetPackage(
                    id=create_asset_package_id(project.id, source_name, "fact"),
                    project_id=project.id,
                    title=f"{project.business_domain}{source_name}最小候选",
                    package_type="fact",
                    source=source_name,
                    grain="待确认粒度",
                    confidence=0.45,
                    risk=risk,
                    status="needs_scope",
                    evidence=[
                        "自动推荐证据不足，已按手动选择源表生成最小候选。",
                        "需要补充字段画像、业务对象和主时间字段。",
                    ],
                    field_candidates=[
                        FieldCandidate(
                            id=f"{source_name}_field_placeholder",
                            field="待选择字段",
                            label="待补字段",
                            role=None,
                            risk="medium",
                            action="pending",
                            evidence=["推荐为空时的手动字段选择默认项。"],
                        )
                    ],
                )
            )
        return [refresh_package_review_state(package) for package in packages]

    def _record_operation(self, package: ModelingAssetPackage, action: str, reason: str) -> None:
        package.operation_history.append(
            {
                "action": action,
                "reason": reason or "未填写原因",
                "at": package.updated_at,
            }
        )

    def _split_package(
        self,
        project: ModelingBuildProject,
        package: ModelingAssetPackage,
        payload: Dict[str, Any],
        reason: str,
    ) -> Dict[str, Any]:
        field_ids = {str(item) for item in payload.get("field_candidate_ids") or []}
        if not field_ids:
            raise ValueError("split 需要 field_candidate_ids")
        moved = [item for item in package.field_candidates if item.id in field_ids]
        if not moved:
            raise ValueError("split 未匹配到字段候选")
        package.field_candidates = [item for item in package.field_candidates if item.id not in field_ids]
        self._record_operation(package, "split_source", reason)
        package = refresh_package_review_state(package)
        new_type = str(payload.get("package_type") or package.package_type)
        new_title = str(payload.get("title") or f"{package.title}拆分候选")
        field_fingerprint = _field_group_fingerprint(field_ids)
        new_source = f"{package.source}_{new_type}_fg_{field_fingerprint}_split"
        created = ModelingAssetPackage(
            id=create_asset_package_id(project.id, new_source, new_type),
            project_id=project.id,
            title=new_title,
            package_type=new_type,
            source=package.source,
            grain=package.grain,
            confidence=package.confidence,
            risk="medium",
            status="ready_for_review",
            evidence=[f"从 {package.title} 拆分：{reason or '字段粒度独立'}"],
            field_candidates=moved,
            split_from_package_id=package.id,
        )
        self._record_operation(created, "split_created", reason)
        created = refresh_package_review_state(created)
        self._save_package_batch(project, replacements=[package], additions=[created])
        return {
            "source_package": package.model_dump(mode="json"),
            "created_package": created.model_dump(mode="json"),
        }

    def _merge_package(
        self,
        project: ModelingBuildProject,
        package: ModelingAssetPackage,
        payload: Dict[str, Any],
        reason: str,
    ) -> Dict[str, Any]:
        target_id = str(payload.get("target_package_id") or "").strip()
        if not target_id:
            raise ValueError("merge 需要 target_package_id")
        if target_id == package.id:
            raise ValueError("merge 目标不能是当前包")
        target = self._require_package(project.id, target_id)
        target.field_candidates.extend(package.field_candidates)
        target.evidence.extend([f"合并 {package.title}: {reason or '候选重复'}"])
        target.merged_from_package_ids.append(package.id)
        self._record_operation(target, "merge_target", reason)
        package.status = "duplicate_candidate"
        self._record_operation(package, "merge_source", reason)
        target = refresh_package_review_state(target)
        package = refresh_package_review_state(package)
        self._save_package_batch(project, replacements=[target, package])
        return {
            "target_package": target.model_dump(mode="json"),
            "source_package": package.model_dump(mode="json"),
        }

    def _require_project(
        self,
        project_id: str,
        principal_id: str | None,
    ) -> ModelingBuildProject:
        project = self.repository.get_project(project_id)
        if project is None:
            raise LookupError(f"语义建设项目不存在: {project_id}")
        if principal_id is not None and project.created_by not in {None, principal_id}:
            raise PermissionError("无权访问语义建设项目")
        return project

    def _require_package(
        self,
        project_id: str,
        package_id: str,
    ) -> ModelingAssetPackage:
        package = self.repository.get_package(package_id)
        if package is None or package.project_id != project_id:
            raise LookupError(f"语义候选资产不存在: {package_id}")
        return package

    def _with_package_summary(
        self,
        project: ModelingBuildProject,
        packages: list[ModelingAssetPackage],
    ) -> ModelingBuildProject:
        risk_summary = {"low": 0, "medium": 0, "high": 0}
        for package in packages:
            risk_summary[package.risk] += 1
        project.asset_package_ids = [package.id for package in packages]
        project.asset_package_count = len(packages)
        project.risk_summary = risk_summary
        return project

    def _dump_project(self, project: ModelingBuildProject) -> Dict[str, Any]:
        return project.model_dump(mode="json")

    def _preserve_review_fields(
        self,
        package: ModelingAssetPackage,
        existing: ModelingAssetPackage | None,
    ) -> ModelingAssetPackage:
        if existing is None:
            return package
        next_payload = package.model_dump(mode="json")
        if existing.operation_history and existing.operation_history[-1].get("action") == "regenerate":
            next_payload["created_at"] = deepcopy(existing.created_at)
            next_payload["operation_history"] = deepcopy(existing.operation_history)
            return ModelingAssetPackage(**next_payload)
        for field in (
            "status",
            "risk",
            "evidence",
            "ontology_suggestions",
            "cube_suggestions",
            "created_at",
        ):
            next_payload[field] = deepcopy(getattr(existing, field))
        return ModelingAssetPackage(**next_payload)

    def _save_package_batch(
        self,
        project: ModelingBuildProject,
        *,
        replacements: list[ModelingAssetPackage],
        additions: list[ModelingAssetPackage] | None = None,
    ) -> None:
        replacement_by_id = {package.id: package for package in replacements}
        packages: list[ModelingAssetPackage] = []
        seen_ids: set[str] = set()
        for current in self.repository.list_packages(project.id):
            package = replacement_by_id.pop(current.id, current)
            packages.append(package)
            seen_ids.add(package.id)
        for package in replacement_by_id.values():
            if package.id not in seen_ids:
                packages.append(package)
                seen_ids.add(package.id)
        for package in additions or []:
            if package.id in seen_ids:
                packages = [package if item.id == package.id else item for item in packages]
            else:
                packages.append(package)
                seen_ids.add(package.id)
        self.repository.save_scan_result(self._with_package_summary(project, packages), packages)

    def _required_text(
        self,
        payload: Dict[str, Any],
        field: str,
        *,
        fallback: Any = None,
    ) -> str:
        value = payload.get(field, fallback)
        text = str(value or "").strip()
        if not text:
            raise ValueError(f"{field} 不能为空")
        return text

    def _normalize_batch_run_id(self, value: Any) -> str | None:
        text = str(value or "").strip()
        if not text:
            return None
        normalized = normalize_build_project_id(text)
        if normalized.startswith("build-"):
            normalized = normalized[len("build-") :]
        return normalized[:64] or None


def _field_group_fingerprint(field_ids: set[str]) -> str:
    joined = "\0".join(sorted(field_ids))
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()[:10]
