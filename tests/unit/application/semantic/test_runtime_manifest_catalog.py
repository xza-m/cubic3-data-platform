"""RuntimeSemanticCatalog 装载合约回归。

回归背景（2026-06-11 正式链路验收发现）：
- Modeling Copilot 发布的 spec 用单数 ontology.object / ontology.metric，
  catalog 此前只读复数 objects / metrics，导致发布后业务对象在 runtime 丢失。
- 发布快照内残留 draft 状态的 ontology 资产会让问数路由匹配不到 metric。
"""
from app.application.semantic.runtime_manifest_catalog import RuntimeSemanticCatalog


def _manifest(spec: dict) -> dict:
    return {
        "snapshot_id": "snap_test",
        "release_id": "rel_test",
        "asset_manifest_json": {
            "schema_version": "v1",
            "assets": [
                {
                    "asset_id": "asset_1",
                    "asset_type": "cube",
                    "asset_key": "cube:test",
                    "revision_id": "rev_1",
                    "status": "published",
                    "spec": spec,
                }
            ],
        },
    }


def _copilot_spec() -> dict:
    return {
        "cube": {
            "name": "comment_reports",
            "title": "学生评论举报",
            "table": "dwd_interaction_comment_reports_df",
            "status": "draft",
            "dimensions": {
                "report_type_name": {"title": "举报类型", "type": "string", "sql": "report_type_name"},
            },
            "measures": {
                "total_count": {"title": "总数", "type": "count", "sql": "comment_id"},
            },
        },
        "ontology": {
            "object": {
                "name": "student_comment",
                "title": "学生评论",
                "status": "draft",
            },
            "metrics": [
                {
                    "name": "student_comment_total_count",
                    "title": "学生评论总数",
                    "object_name": "student_comment",
                    "semantic_formula": "COUNT(comment_id)",
                    "status": "draft",
                    "measure_refs": ["comment_reports.total_count"],
                }
            ],
        },
    }


class TestRuntimeManifestCatalogContract:
    def test_singular_ontology_object_is_loaded(self):
        """copilot 发布 spec 的单数 ontology.object 必须进入 runtime catalog。"""
        catalog = RuntimeSemanticCatalog.from_manifest(_manifest(_copilot_spec()))
        objects = catalog.object_repository.list_all()
        assert [o.name for o in objects] == ["student_comment"]

    def test_published_ontology_assets_promoted_to_active(self):
        """published manifest 内残留 draft 的 object/metric 统一提升为 active。"""
        catalog = RuntimeSemanticCatalog.from_manifest(_manifest(_copilot_spec()))
        obj = catalog.object_repository.get("student_comment")
        metric = catalog.metric_repository.get("student_comment_total_count")
        assert obj is not None and obj.status == "active"
        assert metric is not None and metric.status == "active"

    def test_published_cube_promoted_to_active(self):
        """cube 的 draft 状态同样提升为 active（既有行为不回退）。"""
        catalog = RuntimeSemanticCatalog.from_manifest(_manifest(_copilot_spec()))
        cube = catalog.cube_repository.get("comment_reports")
        assert cube is not None and cube.status == "active"

    def test_plural_ontology_objects_still_supported(self):
        """旧格式复数 ontology.objects 仍然兼容。"""
        spec = _copilot_spec()
        spec["ontology"]["objects"] = [spec["ontology"].pop("object")]
        catalog = RuntimeSemanticCatalog.from_manifest(_manifest(spec))
        assert catalog.object_repository.get("student_comment") is not None
