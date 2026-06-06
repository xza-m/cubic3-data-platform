import type { ReleasePreview } from "./releasePreview";

export interface ReleaseValidationGroup {
  title: string;
  statusLabel: string;
  description: string;
}

export interface ReleaseValidationGroups {
  semanticCenter: ReleaseValidationGroup;
  semanticCompile: ReleaseValidationGroup;
  gateway: ReleaseValidationGroup;
  consumer: ReleaseValidationGroup;
}

export type PublishCheckStatus =
  | "passed"
  | "failed"
  | "pending"
  | "not_configured";

export interface PublishCheckInput {
  status: PublishCheckStatus;
  message: string;
}

export interface PublishCheckGroupsInput {
  draftCompleteness: PublishCheckInput;
  semanticCompile: PublishCheckInput;
  executionValidation: PublishCheckInput;
  consumerValidation: PublishCheckInput;
}

export function buildPublishCheckGroups(input: PublishCheckGroupsInput) {
  return [
    {
      id: "draft-completeness",
      title: "语义草案完整性",
      status: input.draftCompleteness.status,
      detail: input.draftCompleteness.message,
    },
    {
      id: "semantic-compile",
      title: "语义编译",
      status: input.semanticCompile.status,
      detail: input.semanticCompile.message,
    },
    {
      id: "execution-validation",
      title: "执行验证",
      status: input.executionValidation.status,
      detail: input.executionValidation.message,
    },
    {
      id: "consumer-validation",
      title: "消费者可用性",
      status: input.consumerValidation.status,
      detail: input.consumerValidation.message,
    },
  ] as const;
}

export function buildReleaseValidationGroups(
  preview: ReleasePreview,
): ReleaseValidationGroups {
  const gatewayDisconnected = isGatewayExecutionDisconnected(preview);

  return {
    semanticCenter: {
      title: "语义中心发布",
      statusLabel:
        preview.semanticCompile.status === "passed"
          ? "语义中心可发布"
          : "待修复",
      description:
        "发布目标是语义中心；Data Agent、BI、数据分析只消费发布快照。",
    },
    semanticCompile: {
      title: "语义编译",
      statusLabel: statusLabel(preview.semanticCompile.status),
      description:
        preview.semanticCompile.message || "语义中心编译预演状态。",
    },
    gateway: {
      title: "Gateway 执行面验证",
      statusLabel: gatewayDisconnected
        ? "执行面未接通"
        : statusLabel(preview.gatewayValidation.status),
      description: gatewayDisconnected
        ? "Gateway SQL dry-run 当前未接通，不影响语义中心发布结果；当前 SQL 尚未完成物理执行验证。"
        : preview.gatewayValidation.message || "Gateway SQL dry-run 状态。",
    },
    consumer: {
      title: "消费者验证",
      statusLabel:
        preview.consumerValidation.status === "pending" &&
        preview.gatewayValidation.status !== "passed"
          ? "等待执行面验证"
          : statusLabel(preview.consumerValidation.status),
      description:
        "消费者验证基于语义中心发布快照和执行面验证结果。",
    },
  };
}

export function isGatewayExecutionDisconnected(
  preview: ReleasePreview,
): boolean {
  const gatewayMessage = preview.gatewayValidation.message || "";
  return (
    preview.gatewayValidation.status === "not_configured" ||
    /405|method not allowed|not configured|未配置|未接通/i.test(gatewayMessage)
  );
}

function statusLabel(status: string): string {
  if (status === "passed") return "已通过";
  if (status === "failed") return "未通过";
  if (status === "not_configured") return "未配置";
  return "待校验";
}
