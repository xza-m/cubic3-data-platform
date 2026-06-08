import { describe, expect, it } from "vitest";

import {
  extractReleasePreview,
  releasePreviewStatusLabel,
} from "./releasePreview";

describe("releasePreview", () => {
  it("提取完整 release preview payload 并转换为前端字段", () => {
    const preview = extractReleasePreview({
      release_preview: {
        target: "semantic_center",
        compiled_sql:
          "select student_id, count(*) from dwd_learning_activity group by student_id",
        release_diff: {
          added: ["metric.active_student"],
          changed: ["cube.learning_activity"],
          removed: ["legacy.metric"],
        },
        impact_summary: {
          affected_assets: ["cube.learning_activity"],
          affected_consumers: ["BI 日报", "Data Agent"],
          risk_level: "medium",
        },
        semantic_compile: {
          status: "passed",
          message: "语义中心编译通过",
        },
        gateway_validation: {
          status: "passed",
          message: "SQL guard passed",
          checked_at: "2026-06-04T10:00:00+08:00",
        },
        consumer_validation: {
          status: "failed",
          samples: [
            {
              question: "最近 7 天活跃学生数是多少？",
              consumer: "BI Copilot",
              status: "failed",
              message: "缺少时间过滤条件",
            },
          ],
        },
        semantic_spec: { ignored: true },
        session_id: "session-001",
        namespace: "semantic",
      },
    });

    expect(preview?.target).toBe("semantic_center");
    expect(preview?.compiledSql).toBe(
      "select student_id, count(*) from dwd_learning_activity group by student_id",
    );
    expect(preview?.releaseDiff.added).toEqual(["metric.active_student"]);
    expect(preview?.impactSummary.affectedConsumers).toEqual([
      "BI 日报",
      "Data Agent",
    ]);
    expect(preview?.consumerValidation.samples).toEqual([
      {
        question: "最近 7 天活跃学生数是多少？",
        consumer: "BI Copilot",
        status: "failed",
        message: "缺少时间过滤条件",
      },
    ]);
    expect(preview?.semanticCompile).toEqual({
      status: "passed",
      message: "语义中心编译通过",
    });
    expect(releasePreviewStatusLabel(preview?.gatewayValidation.status)).toBe(
      "已通过",
    );
    expect(releasePreviewStatusLabel(preview?.consumerValidation.status)).toBe(
      "未通过",
    );
  });

  it("缺少 release_preview、非 object 或 target 非 semantic_center 时返回 null", () => {
    expect(extractReleasePreview({})).toBeNull();
    expect(extractReleasePreview(null)).toBeNull();
    expect(extractReleasePreview("invalid")).toBeNull();
    expect(extractReleasePreview([])).toBeNull();
    expect(
      extractReleasePreview({
        release_preview: {
          target: "data_agent",
          compiled_sql: "select 1",
        },
      }),
    ).toBeNull();
  });

  it("缺 consumer_validation 或 gateway_validation 时提供稳定默认值", () => {
    const preview = extractReleasePreview({
      release_preview: {
        target: "semantic_center",
        compiled_sql: "select 1",
        release_diff: {
          added: [],
          changed: [],
          removed: [],
        },
        impact_summary: {
          affected_assets: [],
          affected_consumers: [],
          risk_level: "low",
        },
      },
    });

    expect(preview?.gatewayValidation).toEqual({ status: "unknown" });
    expect(preview?.consumerValidation).toEqual({
      status: "pending",
      samples: [],
    });
    expect(releasePreviewStatusLabel(preview?.gatewayValidation.status)).toBe(
      "待校验",
    );
    expect(releasePreviewStatusLabel(undefined)).toBe("待校验");
    expect(releasePreviewStatusLabel("not_configured")).toBe("未配置");
  });

  it("consumer_validation 存在但 status 缺失时仍默认 pending", () => {
    const preview = extractReleasePreview({
      release_preview: {
        target: "semantic_center",
        compiled_sql: "select 1",
        consumer_validation: {
          samples: [
            {
              question: "最近 7 天活跃学生数是多少？",
              consumer: "Data Agent",
              status: "pending_gateway_validation",
            },
          ],
        },
      },
    });

    expect(preview?.consumerValidation.status).toBe("pending");
    expect(preview?.consumerValidation.samples[0]?.status).toBe(
      "pending_gateway_validation",
    );
  });

  it("数组中的数字和布尔值会安全转换为 string，并过滤 malformed 值", () => {
    const preview = extractReleasePreview({
      release_preview: {
        target: "semantic_center",
        compiled_sql: 42,
        release_diff: {
          added: ["metric.active_student", 7],
          changed: [101],
          removed: [null, undefined, { id: "bad" }, false],
        },
        impact_summary: {
          affected_assets: ["cube.learning_activity", 2026],
          affected_consumers: ["BI 日报", 3],
          risk_level: 1,
        },
        gateway_validation: {
          status: 0,
        },
        consumer_validation: {
          status: "passed",
          samples: [
            {
              question: 123,
              consumer: 456,
              status: true,
            },
          ],
        },
      },
    });

    expect(preview?.compiledSql).toBe("42");
    expect(preview?.releaseDiff.added).toEqual(["metric.active_student", "7"]);
    expect(preview?.releaseDiff.changed).toEqual(["101"]);
    expect(preview?.releaseDiff.removed).toEqual(["false"]);
    expect(preview?.impactSummary.affectedAssets).toEqual([
      "cube.learning_activity",
      "2026",
    ]);
    expect(preview?.impactSummary.affectedConsumers).toEqual(["BI 日报", "3"]);
    expect(preview?.impactSummary.riskLevel).toBe("1");
    expect(preview?.gatewayValidation.status).toBe("0");
    expect(preview?.consumerValidation.samples).toEqual([
      {
        question: "123",
        consumer: "456",
        status: "true",
      },
    ]);
  });
});
