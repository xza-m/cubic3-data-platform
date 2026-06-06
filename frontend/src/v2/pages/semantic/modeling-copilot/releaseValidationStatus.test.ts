import { describe, expect, it } from "vitest";
import type { ReleasePreview } from "./releasePreview";
import {
  buildPublishCheckGroups,
  buildReleaseValidationGroups,
} from "./releaseValidationStatus";

const basePreview: ReleasePreview = {
  target: "semantic_center",
  compiledSql: "SELECT 1",
  releaseDiff: {
    added: ["cube.student_comment"],
    changed: [],
    removed: [],
  },
  impactSummary: {
    affectedAssets: ["cube.student_comment"],
    affectedConsumers: ["Data Agent", "BI"],
    riskLevel: "low",
  },
  semanticCompile: {
    status: "passed",
    message: "语义中心编译预演通过。",
  },
  gatewayValidation: {
    status: "failed",
    message: "Gateway SQL dry-run 调用失败：gateway SQL dry-run failed: 405",
  },
  consumerValidation: {
    status: "pending",
    samples: [],
  },
};

describe("buildReleaseValidationGroups", () => {
  it("把 Gateway 405 表达为执行面未接通，不污染语义编译状态", () => {
    const groups = buildReleaseValidationGroups(basePreview);

    expect(groups.semanticCenter.statusLabel).toBe("语义中心可发布");
    expect(groups.semanticCompile.statusLabel).toBe("已通过");
    expect(groups.gateway.statusLabel).toBe("执行面未接通");
    expect(groups.gateway.description).toContain("不影响语义中心发布结果");
    expect(groups.consumer.statusLabel).toBe("等待执行面验证");
  });

  it("Gateway 未配置时同样表达为待接入执行面", () => {
    const groups = buildReleaseValidationGroups({
      ...basePreview,
      gatewayValidation: {
        status: "not_configured",
        message: "等待语义中心返回物理 SQL，未调用 gateway SQL dry-run。",
      },
    });

    expect(groups.gateway.statusLabel).toBe("执行面未接通");
    expect(groups.gateway.description).toContain("当前 SQL 尚未完成物理执行验证");
  });

  it("Gateway 通过后消费者验证状态独立展示", () => {
    const groups = buildReleaseValidationGroups({
      ...basePreview,
      gatewayValidation: { status: "passed", message: "dry-run passed" },
      consumerValidation: { status: "passed", samples: [] },
    });

    expect(groups.gateway.statusLabel).toBe("已通过");
    expect(groups.consumer.statusLabel).toBe("已通过");
  });
});

it("把发布检查表达为用户可理解的四类状态", () => {
  const groups = buildPublishCheckGroups({
    draftCompleteness: { status: "passed", message: "Cube、本体和 Binding 已完整。" },
    semanticCompile: { status: "passed", message: "语义中心编译通过。" },
    executionValidation: { status: "not_configured", message: "Gateway 未配置，本次未执行物理 SQL dry-run。" },
    consumerValidation: { status: "pending", message: "等待样例问题验证。" },
  });

  expect(groups.map((item) => item.title)).toEqual([
    "语义草案完整性",
    "语义编译",
    "执行验证",
    "消费者可用性",
  ]);
  expect(groups[2].detail).toContain("Gateway 未配置");
});
