import type { ReleasePreview } from "./releasePreview";
import { t } from "@v2/i18n";

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
      title: t(
        "semanticModeling.releaseValidation.draftCompleteness.title",
        "语义草案完整性",
      ),
      status: input.draftCompleteness.status,
      detail: input.draftCompleteness.message,
    },
    {
      id: "semantic-compile",
      title: t(
        "semanticModeling.releaseValidation.semanticCompile.title",
        "语义编译",
      ),
      status: input.semanticCompile.status,
      detail: input.semanticCompile.message,
    },
    {
      id: "execution-validation",
      title: t(
        "semanticModeling.releaseValidation.executionValidation.title",
        "执行验证",
      ),
      status: input.executionValidation.status,
      detail: input.executionValidation.message,
    },
    {
      id: "consumer-validation",
      title: t(
        "semanticModeling.releaseValidation.consumerValidation.title",
        "消费者可用性",
      ),
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
      title: t(
        "semanticModeling.releaseValidation.semanticCenter.title",
        "语义中心发布",
      ),
      statusLabel:
        preview.semanticCompile.status === "passed"
          ? t(
              "semanticModeling.releaseValidation.semanticCenter.ready",
              "语义中心可发布",
            )
          : t(
              "semanticModeling.releaseValidation.semanticCenter.needsFix",
              "待修复",
            ),
      description:
        t(
          "semanticModeling.releaseValidation.semanticCenter.description",
          "发布目标是语义中心；Data Agent、BI、数据分析只消费发布快照。",
        ),
    },
    semanticCompile: {
      title: t(
        "semanticModeling.releaseValidation.semanticCompile.title",
        "语义编译",
      ),
      statusLabel: statusLabel(preview.semanticCompile.status),
      description:
        preview.semanticCompile.message ||
        t(
          "semanticModeling.releaseValidation.semanticCompile.description",
          "语义中心编译预演状态。",
        ),
    },
    gateway: {
      title: t(
        "semanticModeling.releaseValidation.gateway.title",
        "Gateway 执行面验证",
      ),
      statusLabel: gatewayDisconnected
        ? t(
            "semanticModeling.releaseValidation.gateway.disconnected",
            "执行面未接通",
          )
        : statusLabel(preview.gatewayValidation.status),
      description: gatewayDisconnected
        ? t(
            "semanticModeling.releaseValidation.gateway.disconnectedDescription",
            "Gateway SQL dry-run 当前未接通，不影响语义中心发布结果；当前 SQL 尚未完成物理执行验证。",
          )
        : preview.gatewayValidation.message ||
          t(
            "semanticModeling.releaseValidation.gateway.description",
            "Gateway SQL dry-run 状态。",
          ),
    },
    consumer: {
      title: t(
        "semanticModeling.releaseValidation.consumer.title",
        "消费者验证",
      ),
      statusLabel:
        preview.consumerValidation.status === "pending" &&
        preview.gatewayValidation.status !== "passed"
          ? t(
              "semanticModeling.releaseValidation.consumer.waitingExecution",
              "等待执行面验证",
            )
          : statusLabel(preview.consumerValidation.status),
      description:
        t(
          "semanticModeling.releaseValidation.consumer.description",
          "消费者验证基于语义中心发布快照和执行面验证结果。",
        ),
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
  if (status === "passed") {
    return t("semanticModeling.releaseValidation.status.passed", "已通过");
  }
  if (status === "failed") {
    return t("semanticModeling.releaseValidation.status.failed", "未通过");
  }
  if (status === "not_configured") {
    return t(
      "semanticModeling.releaseValidation.status.notConfigured",
      "未配置",
    );
  }
  return t("semanticModeling.releaseValidation.status.pending", "待校验");
}
