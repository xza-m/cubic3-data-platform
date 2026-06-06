export interface ReleasePreview {
  target: "semantic_center";
  compiledSql: string;
  releaseDiff: ReleasePreviewDiff;
  impactSummary: ReleasePreviewImpactSummary;
  semanticCompile: ReleasePreviewValidation;
  gatewayValidation: ReleasePreviewValidation;
  consumerValidation: ReleasePreviewConsumerValidation;
}

export interface ReleasePreviewDiff {
  added: string[];
  changed: string[];
  removed: string[];
}

export interface ReleasePreviewImpactSummary {
  affectedAssets: string[];
  affectedConsumers: string[];
  riskLevel: ReleasePreviewRiskLevel;
}

export interface ReleasePreviewValidation {
  status: ReleasePreviewValidationStatus;
  message?: string;
  [key: string]: unknown;
}

export interface ReleasePreviewConsumerValidation {
  status: ReleasePreviewValidationStatus;
  samples: ReleasePreviewConsumerSample[];
}

export interface ReleasePreviewConsumerSample {
  question: string;
  consumer: string;
  status: ReleasePreviewValidationStatus;
  message?: string;
}

export type ReleasePreviewRiskLevel =
  | "low"
  | "medium"
  | "high"
  | "unknown"
  | (string & Record<never, never>);
export type ReleasePreviewValidationStatus =
  | "passed"
  | "failed"
  | "not_configured"
  | "pending"
  | "pending_gateway_validation"
  | "unknown"
  | (string & Record<never, never>);

export function extractReleasePreview(
  workbenchState: unknown,
): ReleasePreview | null {
  if (!isRecord(workbenchState)) return null;

  const releasePreview = workbenchState.release_preview;
  if (!isRecord(releasePreview)) return null;
  if (releasePreview.target !== "semantic_center") return null;

  return {
    target: "semantic_center",
    compiledSql: toStringValue(releasePreview.compiled_sql),
    releaseDiff: parseReleaseDiff(releasePreview.release_diff),
    impactSummary: parseImpactSummary(releasePreview.impact_summary),
    semanticCompile: parseValidation(releasePreview.semantic_compile),
    gatewayValidation: parseGatewayValidation(
      releasePreview.gateway_validation,
    ),
    consumerValidation: parseConsumerValidation(
      releasePreview.consumer_validation,
    ),
  };
}

export function releasePreviewStatusLabel(status: string | undefined): string {
  if (status === "passed") return "已通过";
  if (status === "failed") return "未通过";
  if (status === "not_configured") return "未配置";
  return "待校验";
}

function parseReleaseDiff(value: unknown): ReleasePreviewDiff {
  const releaseDiff = isRecord(value) ? value : {};

  return {
    added: toStringArray(releaseDiff.added),
    changed: toStringArray(releaseDiff.changed),
    removed: toStringArray(releaseDiff.removed),
  };
}

function parseImpactSummary(value: unknown): ReleasePreviewImpactSummary {
  const impactSummary = isRecord(value) ? value : {};

  return {
    affectedAssets: toStringArray(impactSummary.affected_assets),
    affectedConsumers: toStringArray(impactSummary.affected_consumers),
    riskLevel: toStringValue(
      impactSummary.risk_level,
      "unknown",
    ) as ReleasePreviewRiskLevel,
  };
}

function parseGatewayValidation(value: unknown): ReleasePreviewValidation {
  return parseValidation(value);
}

function parseValidation(value: unknown): ReleasePreviewValidation {
  const validation = isRecord(value) ? value : {};
  const { status: rawStatus, message: rawMessage, ...rest } = validation;
  const message = optionalString(rawMessage);

  return {
    ...rest,
    status: toStringValue(
      rawStatus,
      "unknown",
    ) as ReleasePreviewValidationStatus,
    ...(message === undefined ? {} : { message }),
  };
}

function parseConsumerValidation(
  value: unknown,
): ReleasePreviewConsumerValidation {
  if (!isRecord(value)) {
    return {
      status: "pending",
      samples: [],
    };
  }

  return {
    status: toStringValue(
      value.status,
      "pending",
    ) as ReleasePreviewValidationStatus,
    samples: Array.isArray(value.samples)
      ? value.samples.map(parseConsumerSample)
      : [],
  };
}

function parseConsumerSample(value: unknown): ReleasePreviewConsumerSample {
  const sample = isRecord(value) ? value : {};
  const message = optionalString(sample.message);

  return {
    question: toStringValue(sample.question),
    consumer: toStringValue(sample.consumer),
    status: toStringValue(
      sample.status,
      "unknown",
    ) as ReleasePreviewValidationStatus,
    ...(message === undefined ? {} : { message }),
  };
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item) => ["string", "number", "boolean"].includes(typeof item))
        .map(String)
    : [];
}

function toStringValue(value: unknown, fallback = ""): string {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
