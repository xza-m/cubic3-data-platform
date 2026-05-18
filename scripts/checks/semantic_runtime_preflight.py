#!/usr/bin/env python
"""Agent-first Runtime 真实环境语义资产预检。

该脚本只读取 Cube / Ontology 资产，不访问外部数仓，不执行 SQL。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from app.application.agent.runtime_preflight_service import SemanticRuntimePreflightService
from app.infrastructure.ontology.yaml_metric_repository import YamlBusinessMetricRepository
from app.infrastructure.ontology.yaml_object_repository import YamlBusinessObjectRepository
from app.infrastructure.semantic.yaml_cube_repository import YamlCubeRepository


ROOT = Path(__file__).resolve().parents[2]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--object-name", default="StudentComment")
    parser.add_argument("--metric-name", default="comment_count")
    parser.add_argument("--cube-name", default="student_comment_cube")
    parser.add_argument("--measure-name", default="comment_count")
    parser.add_argument("--expected-table", default="df_cb_258187.dwd_interaction_comment_reports_df")
    parser.add_argument("--cubes-dir", default=str(ROOT / "app/infrastructure/semantic/cubes"))
    parser.add_argument("--objects-dir", default=str(ROOT / "app/infrastructure/ontology/objects"))
    parser.add_argument("--metrics-dir", default=str(ROOT / "app/infrastructure/ontology/metrics"))
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    service = SemanticRuntimePreflightService(
        object_repository=YamlBusinessObjectRepository(args.objects_dir),
        metric_repository=YamlBusinessMetricRepository(args.metrics_dir),
        cube_repository=YamlCubeRepository(args.cubes_dir),
    )
    result = service.check(
        object_name=args.object_name,
        metric_name=args.metric_name,
        cube_name=args.cube_name,
        measure_name=args.measure_name,
        expected_table=args.expected_table,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if result["status"] == "passed" else 1


if __name__ == "__main__":
    sys.exit(main())
