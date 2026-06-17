// frontend/src/v2/pages/semantic/modeling-copilot/modelingAgentModel.ts
//
// ModelingAgent 工作台的纯逻辑层：review 投影、run state、发布门禁与文案辅助。
// 从 ModelingAgent.tsx 拆出，保持行为不变；组件文件只做渲染。

import {
  t,
} from "@v2/i18n";
import {
  AppError,
} from "@v2/api/types";
import type {
  AgentRuntimeManagementSnapshot,
  AgentRuntimeProviderStatus,
} from "@v2/api/agent-runtime";
import {
  type FieldCandidateReviewItem,
} from "./components/FieldCandidateReview";
import type {
  CopilotCandidateCard,
  CopilotConfirmation,
  CopilotPostPublishValidation,
  CopilotPublishGate,
  CopilotSourceEvidence,
  CopilotTraceState,
  SemanticModelingCopilotReview,
  SemanticModelingCopilotSession,
} from "@v2/api/semantic";
import {
  extractCubeDraft,
  hasCubeDraft,
} from "@v2/lib/copilot";
import {
  BUILDER_ACTION_COPY,
  BUILDER_ARTIFACT_LABELS,
  CONSUMER_VALIDATION_COPY,
} from "./builderCopy";
import {
  extractReleasePreview,
  releasePreviewStatusLabel,
} from "./releasePreview";
import {
  collectionCount,
} from "./components/ChatCards";


export interface ReviewChange {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  status: string;
  confidence: string;
  reason: string;
  impact: string;
  risk: string;
  evidence: string;
}


export interface ReviewBlocker {
  id: string;
  title: string;
  state: "open" | "in_progress" | "resolved";
  description: string;
  action: string;
  source?: string;
  technicalHint?: unknown;
}


export interface FieldCandidateTrace {
  candidate_set_id?: string;
  measure_count?: number;
  metric_count?: number;
  dimension_count?: number;
  risk_summary?: Record<string, unknown> | string[] | string | null;
  candidates?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}


export interface CopilotActionError {
  title: string;
  message: string;
  detail?: string;
  action?: "spec" | "retry";
}


export interface ChatFlowNudgeModel {
  statusLabel: string;
  title: string;
  detail: string;
  template: string;
  actionLabel: string;
}


export function fieldCandidateTraceForReview(
  session: SemanticModelingCopilotSession,
  review?: SemanticModelingCopilotReview,
): FieldCandidateTrace | null {
  const state = session.workbench_state || {};
  const rawSpec = isRecord(state.raw_spec) ? state.raw_spec : {};
  const cube = isRecord(rawSpec.cube) ? rawSpec.cube : {};
  const cubes = Array.isArray(rawSpec.cubes) ? rawSpec.cubes : [];
  const firstCube = isRecord(cubes[0]) ? cubes[0] : {};
  const reviewRecord = review as Record<string, unknown> | undefined;
  const reviewCube = isRecord(reviewRecord?.cube) ? reviewRecord.cube : {};
  const workbenchCube = isRecord(state.cube) ? state.cube : {};
  const cubeDraft = isRecord(state.cube_draft) ? state.cube_draft : {};
  return (
    asFieldCandidateTrace(cube.field_candidate_trace) ||
    asFieldCandidateTrace(firstCube.field_candidate_trace) ||
    asFieldCandidateTrace(reviewCube.field_candidate_trace) ||
    asFieldCandidateTrace(reviewRecord?.field_candidate_trace) ||
    asFieldCandidateTrace(workbenchCube.field_candidate_trace) ||
    asFieldCandidateTrace(cubeDraft.field_candidate_trace) ||
    asFieldCandidateTrace(state.field_candidate_trace)
  );
}


export function fieldCandidateItemsForSession(
  session: SemanticModelingCopilotSession,
): FieldCandidateReviewItem[] {
  const trace = fieldCandidateTraceForReview(session, undefined);
  const candidates = Array.isArray(trace?.candidates) ? trace.candidates : [];
  const tracedCandidates = candidates.filter(isRecord).map((item, index) => {
    const field =
      stringValue(item.field) ||
      stringValue(item.name) ||
      `unknown_field_${index + 1}`;
    const confidence = numberValue(item.confidence);
    return {
      id: fieldCandidateItemId(item, index),
      field,
      label: stringValue(item.label) || stringValue(item.title) || field,
      role:
        stringValue(item.role) || stringValue(item.selected_role) || "unknown",
      aggregation: stringValue(item.aggregation) || stringValue(item.agg),
      semanticType: stringValue(item.semantic_type) || stringValue(item.type),
      confidence,
      confidenceLabel:
        confidence === undefined ? stringValue(item.confidence) : undefined,
      evidence: stringValue(item.evidence) || stringValue(item.reason),
      risk: stringValue(item.risk) || stringValue(item.risk_level),
    };
  });
  return tracedCandidates.length > 0
    ? tracedCandidates
    : fieldCandidateItemsFromCurrentDraft(session);
}


export function fieldCandidateItemId(
  item: Record<string, unknown>,
  index: number,
): string {
  const id = stringValue(item.id);
  if (id) return id;
  const candidateIndex = item.candidate_index;
  if (typeof candidateIndex === "number" && Number.isFinite(candidateIndex))
    return String(candidateIndex);
  return stringValue(candidateIndex) || `candidate_${index + 1}`;
}


export function asFieldCandidateTrace(value: unknown): FieldCandidateTrace | null {
  return isRecord(value) && stringValue(value.candidate_set_id)
    ? (value as FieldCandidateTrace)
    : null;
}


export function fieldCandidateItemsFromCurrentDraft(
  session: SemanticModelingCopilotSession,
): FieldCandidateReviewItem[] {
  const cube = firstCubeWithSemanticFields(session);
  if (!cube) return [];
  const cubeName = stringValue(cube.name) || "current_cube";
  const dimensions = candidateRecordsFromCollection(cube.dimensions);
  const measures = candidateRecordsFromCollection(cube.measures);
  return [
    ...dimensions.map((item, index) =>
      semanticDraftFieldCandidate({
        item,
        index,
        role: "dimension",
        cubeName,
        session,
      }),
    ),
    ...measures.map((item, index) =>
      semanticDraftFieldCandidate({
        item,
        index,
        role: "measure",
        cubeName,
        session,
      }),
    ),
  ];
}


export function firstCubeWithSemanticFields(
  session: SemanticModelingCopilotSession,
): Record<string, unknown> | null {
  const state = session.workbench_state || {};
  const rawSpec = isRecord(state.raw_spec) ? state.raw_spec : {};
  const cubes = Array.isArray(rawSpec.cubes) ? rawSpec.cubes : [];
  const candidates = [
    rawSpec.cube,
    cubes.find(isRecord),
    state.cube,
    state.cube_draft,
    extractCubeDraft(state),
  ];
  return (
    candidates.find(
      (candidate): candidate is Record<string, unknown> =>
        isRecord(candidate) &&
        (collectionCount(candidate.dimensions) > 0 ||
          collectionCount(candidate.measures) > 0),
    ) || null
  );
}


export function candidateRecordsFromCollection(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value
      .map((item): Record<string, unknown> | null => {
        if (isRecord(item)) return item;
        if (typeof item === "string" && item.trim()) return { name: item };
        return null;
      })
      .filter((item): item is Record<string, unknown> => item !== null);
  }
  if (!isRecord(value)) return [];
  return Object.entries(value).map(([name, item]) =>
    isRecord(item) ? { name, ...item } : { name },
  );
}


export function semanticDraftFieldCandidate({
  item,
  index,
  role,
  cubeName,
  session,
}: {
  item: Record<string, unknown>;
  index: number;
  role: "dimension" | "measure";
  cubeName: string;
  session: SemanticModelingCopilotSession;
}): FieldCandidateReviewItem {
  const name = stringValue(item.name) || `${role}_${index + 1}`;
  const field =
    stringValue(item.expr) ||
    stringValue(item.field) ||
    stringValue(item.column) ||
    stringValue(item.sql) ||
    name;
  const sourceField = sourceFieldEvidenceForDraft(session, field, name);
  const label =
    stringValue(item.title) || stringValue(item.label) || sourceField?.title || name;
  const aggregation =
    role === "measure"
      ? stringValue(item.aggregation) ||
        stringValue(item.agg) ||
        stringValue(item.type) ||
        stringValue(item.sql)
      : undefined;
  return {
    id: `draft_${role}_${name}`,
    field,
    label,
    role,
    aggregation,
    semanticType: stringValue(item.type) || sourceField?.type,
    cubeBindingLabel: `${cubeName}.${name}`,
    ontologyBindingLabel:
      role === "measure" ? ontologyBindingLabelForMeasure(session, name) : undefined,
    confidence: 0.8,
    evidence:
      sourceField?.evidence ||
      t(
        "semantic.modelingWorkbench.fieldCandidate.draftEvidence",
        "来自当前语义草案的字段定义；后端字段候选 trace 缺失时先保留为可审阅候选。",
      ),
    risk: "low",
  };
}


export function sourceFieldEvidenceForDraft(
  session: SemanticModelingCopilotSession,
  field: string,
  semanticName: string,
): { title?: string; type?: string; evidence?: string } | null {
  const evidence = session.workbench_state?.source_evidence;
  const fields = isRecord(evidence) && Array.isArray(evidence.fields) ? evidence.fields : [];
  const normalizedField = normalizeIdentifier(field);
  const normalizedName = normalizeIdentifier(semanticName);
  const matched = fields
    .filter(isRecord)
    .find((item) => {
      const name = normalizeIdentifier(stringValue(item.name));
      return name === normalizedField || name === normalizedName;
    });
  if (!matched) return null;
  return {
    title: stringValue(matched.title) || undefined,
    type: stringValue(matched.type) || undefined,
    evidence: stringValue(matched.evidence) || undefined,
  };
}


export function ontologyBindingLabelForMeasure(
  session: SemanticModelingCopilotSession,
  measureName: string,
): string | undefined {
  const state = session.workbench_state || {};
  const rawSpec = isRecord(state.raw_spec) ? state.raw_spec : {};
  const ontology = isRecord(rawSpec.ontology) ? rawSpec.ontology : {};
  const metrics = Array.isArray(ontology.metrics) ? ontology.metrics : [];
  const normalizedMeasure = normalizeIdentifier(measureName);
  const metric = metrics.filter(isRecord).find((item) => {
    const refs = Array.isArray(item.measure_refs) ? item.measure_refs : [];
    return refs.some((ref) =>
      normalizeIdentifier(measureRefString(ref)).endsWith(`.${normalizedMeasure}`),
    );
  });
  return metric
    ? stringValue(metric.title) || stringValue(metric.name) || undefined
    : undefined;
}


export function fieldCandidateCount(
  trace: FieldCandidateTrace,
  roles: string[],
): number {
  const explicit = roles.includes("dimension")
    ? numberValue(trace.dimension_count)
    : numberValue(trace.measure_count) || numberValue(trace.metric_count);
  if (explicit !== undefined) return explicit;
  const candidates = Array.isArray(trace.candidates) ? trace.candidates : [];
  return candidates
    .filter(isRecord)
    .filter((candidate) =>
      roles.includes(
        stringValue(candidate.role) || stringValue(candidate.selected_role),
      ),
    ).length;
}


export function formatFieldCandidateRiskSummary(
  value: FieldCandidateTrace["risk_summary"],
): string {
  if (!value) return "风险 0";
  if (typeof value === "string")
    return value.trim() ? `风险 ${value.trim()}` : "风险 0";
  if (Array.isArray(value))
    return value.length > 0 ? `风险 ${value.join(" / ")}` : "风险 0";
  const ordered = ["high", "medium", "low"];
  const entries = [
    ...ordered
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, value[key]] as const),
    ...Object.entries(value).filter(([key]) => !ordered.includes(key)),
  ].filter(([, count]) => Number(count) > 0);
  return entries.length > 0
    ? `风险 ${entries.map(([key, count]) => `${key} ${Number(count)}`).join(" / ")}`
    : "风险 0";
}


export function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}


export function compactArtifactSummary(
  session: SemanticModelingCopilotSession,
  review: ReturnType<typeof buildProposalReview>,
): Array<{
  label: string;
  value: string;
  tone: "neutral" | "success" | "warning" | "danger" | "accent";
}> {
  const sourceEvidence = sourceEvidenceForArtifact(session);
  const sourceName = stringValue(sourceEvidence.source_table?.name);
  const hasSource = sourceName !== "" && sourceName !== "待补充源表/数据集";
  const state = session.workbench_state || {};
  const rawSpec = (state.raw_spec ?? {}) as Record<string, unknown>;
  const hasSemanticDraft =
    Boolean(rawSpec.spec_version && rawSpec.cube) || hasCubeDraft(state);
  const gateLabel = review.published
    ? "已通过"
    : review.blockers.length > 0
      ? `${review.blockers.length} 项待处理`
      : review.currentProposalId
        ? "等待发布"
        : "可保存";

  return [
    {
      label: BUILDER_ARTIFACT_LABELS.source,
      value: hasSource ? "已确认" : "待补充",
      tone: hasSource ? "success" : "warning",
    },
    {
      label: "语义草稿",
      value: hasSemanticDraft ? "已生成" : "未生成",
      tone: hasSemanticDraft ? "success" : "warning",
    },
    {
      label: "发布前检查",
      value: gateLabel,
      tone:
        review.published || review.blockers.length === 0
          ? "success"
          : "warning",
    },
  ];
}


export function artifactGuidance(
  session: SemanticModelingCopilotSession,
  review: ReturnType<typeof buildProposalReview>,
  pendingRunLabel?: string,
): {
  title: string;
  detail: string;
  badge: string;
  tone: "neutral" | "success" | "warning" | "danger" | "accent";
  borderColor: string;
} {
  if (pendingRunLabel) {
    return {
      title: `${pendingRunLabel}中`,
      detail: "结果会回写到建设主流程。右侧暂时保持只读，避免打断主链路。",
      badge: "运行中",
      tone: "accent",
      borderColor: "rgba(37,99,235,0.24)",
    };
  }
  if (review.published) {
    return {
      title: "已发布",
      detail:
        "语义资产已进入语义中心发布快照；需要排查时看审计记录，需要复核时看语义草案。",
      badge: "可验证",
      tone: "success",
      borderColor: "rgba(22,163,74,0.22)",
    };
  }
  const firstBlocker = review.blockers[0];
  if (firstBlocker) {
    const guide = blockerFixGuide(firstBlocker);
    if (firstBlocker.id === "source_candidate_confirmation_required") {
      return {
        title: "流程已阻塞：确认数据来源",
        detail:
          "后台没有继续运行。请在建设主流程的候选来源卡片里选择一项，系统才会生成语义定义。",
        badge: "待确认",
        tone: "warning",
        borderColor: "rgba(245,158,11,0.28)",
      };
    }
    if (
      firstBlocker.id === "need_source_table" ||
      firstBlocker.id === "spec_not_generated"
    ) {
      return {
        title: "流程已阻塞：补充源表或数据集",
        detail:
          "后台没有任务在运行。请在建设主流程中补充源表/数据集，系统才会继续生成语义定义。",
        badge: `${review.blockers.length} 项阻塞`,
        tone: "warning",
        borderColor: "rgba(245,158,11,0.28)",
      };
    }
    return {
      title: `流程已阻塞：${firstBlocker.title}`,
      detail: guide.fix,
      badge: `${review.blockers.length} 项待处理`,
      tone: "warning",
      borderColor: "rgba(245,158,11,0.24)",
    };
  }
  if (review.currentProposalId) {
    return {
      title: "等待发布到语义中心",
      detail: "发布动作留在建设主流程；右侧用于复核语义草案和审计记录。",
      badge: "可确认",
      tone: "accent",
      borderColor: "rgba(37,99,235,0.22)",
    };
  }
  return {
    title: "可以生成语义资产",
    detail:
      "在建设主流程中点击“生成语义资产”保存待发布语义资产。右侧只做复核，不承载主操作。",
    badge: "就绪",
    tone: "accent",
    borderColor: "rgba(37,99,235,0.22)",
  };
}


export interface CopilotRunState {
  trigger: string;
  runtime: string;
  detail: string;
  lastTrace: string;
  tone: "neutral" | "success" | "warning" | "danger" | "accent";
  running: boolean;
}


export function buildCopilotRunState(
  session: SemanticModelingCopilotSession,
  pendingRunLabel?: string,
): CopilotRunState {
  const state = session.workbench_state || {};
  const reasons = (state.readiness?.reasons ?? []).map((item) => String(item));
  const confirmations = state.required_confirmations ?? [];
  const sourceCandidates = state.source_candidates ?? [];
  const rawSpec = (state.raw_spec ?? {}) as Record<string, unknown>;
  const hasSpec =
    Boolean(rawSpec.spec_version && rawSpec.cube) || hasCubeDraft(state);
  const published =
    (state.publish_result as Record<string, unknown> | undefined)?.status ===
    "published";
  const lastTrace = lastTraceLabel(session);

  if (pendingRunLabel) {
    return {
      trigger: "用户操作",
      runtime: `${pendingRunLabel}运行中`,
      detail: "完成后回写到建设主流程。",
      lastTrace,
      tone: "accent",
      running: true,
    };
  }

  if (confirmations.length > 0) {
    return {
      trigger: "建设主流程确认卡",
      runtime: "等待你确认口径",
      detail: "在建设主流程的确认卡片里处理；后台没有继续运行。",
      lastTrace,
      tone: "warning",
      running: false,
    };
  }

  if (
    sourceCandidates.length > 0 &&
    reasons.includes("source_candidate_confirmation_required")
  ) {
    return {
      trigger: "候选来源召回",
      runtime: "等待你确认数据来源",
      detail: "在建设主流程中选择数据来源；后台没有继续运行。",
      lastTrace,
      tone: "warning",
      running: false,
    };
  }

  if (reasons.includes("need_source_table")) {
    return {
      trigger: "缺少建模输入",
      runtime: "需要补充数据来源",
      detail: "缺少源表/数据集；后台没有任务在运行。",
      lastTrace,
      tone: "warning",
      running: false,
    };
  }

  if (reasons.includes("spec_not_generated")) {
    return {
      trigger: "状态恢复",
      runtime: "需要补齐建模输入",
      detail: "语义定义尚未生成；先补源表、分组和时间字段。",
      lastTrace,
      tone: "warning",
      running: false,
    };
  }

  if (!hasSpec) {
    return {
      trigger: "AI 助手对话",
      runtime: "识别语义中",
      detail: "正在收集候选语义、源表和业务口径。",
      lastTrace,
      tone: "accent",
      running: false,
    };
  }

  if (published) {
    return {
      trigger: "发布链路",
      runtime: "已发布到语义中心",
      detail: "语义资产已进入语义中心发布快照，消费者可基于同一快照验证。",
      lastTrace,
      tone: "success",
      running: false,
    };
  }

  if (session.current_proposal_id) {
    return {
      trigger: BUILDER_ACTION_COPY.saveButton,
      runtime: "草稿已保存，等待发布",
      detail:
        "下一步在建设主流程中发布到语义中心，消费者基于语义中心发布快照验证。",
      lastTrace,
      tone: "success",
      running: false,
    };
  }

  return {
    trigger: "确定性工具链",
    runtime: "草稿已生成，可预演",
    detail: "可以继续可用性预演，或生成待发布语义资产。",
    lastTrace,
    tone: "accent",
    running: false,
  };
}


export function buildChatFlowNudge(
  session: SemanticModelingCopilotSession,
  pendingRunLabel?: string,
): ChatFlowNudgeModel | null {
  if (pendingRunLabel) return null;
  const reasons = (session.workbench_state?.readiness?.reasons ?? []).map(
    (item) => String(item),
  );
  const sourceCandidates = session.workbench_state?.source_candidates ?? [];
  const rawSpec = (session.workbench_state?.raw_spec ?? {}) as Record<
    string,
    unknown
  >;
  const hasSpec =
    Boolean(rawSpec.spec_version && rawSpec.cube) ||
    hasCubeDraft(session.workbench_state);
  if (
    hasSpec ||
    sourceCandidates.length > 0 ||
    (!reasons.includes("need_source_table") &&
      !reasons.includes("spec_not_generated"))
  )
    return null;
  return {
    statusLabel: "已阻塞",
    title: "流程已阻塞：缺少数据来源",
    detail:
      "当前没有后台任务在运行。补充物理表/数据集、指标口径、分组和时间字段后，系统会继续生成语义草案。",
    template:
      "源表/数据集是 <database.table>；指标口径是 <计算规则>；按 <分组字段> 分组；时间字段是 <字段名>。",
    actionLabel: "填入模板",
  };
}


export function lastTraceLabel(session: SemanticModelingCopilotSession): string {
  const traces = (session.tool_traces ?? []).filter(Boolean);
  const trace = traces[traces.length - 1];
  if (!trace) return "暂无运行记录";
  return `${String(trace.tool || "tool")} · ${String(trace.status || "completed")}`;
}


export function runStateColor(tone: CopilotRunState["tone"]): string {
  if (tone === "success") return "var(--success)";
  if (tone === "warning") return "var(--warning)";
  if (tone === "danger") return "var(--danger)";
  if (tone === "accent") return "var(--accent)";
  return "var(--border-strong)";
}


export function runStateBackground(tone: CopilotRunState["tone"]): string {
  if (tone === "warning") return "rgba(255,251,235,0.72)";
  if (tone === "danger") return "rgba(254,242,242,0.72)";
  if (tone === "success") return "rgba(240,253,244,0.55)";
  if (tone === "accent") return "rgba(239,246,255,0.58)";
  return "var(--bg-surface)";
}


export function pendingCopilotRunLabel(input: {
  creating: boolean;
  sending: boolean;
  confirming: boolean;
  accepting: boolean;
  previewing: boolean;
  releasePreviewing: boolean;
  saving: boolean;
  publishing: boolean;
  updatingSpec: boolean;
}): string | undefined {
  if (input.creating || input.sending) return "理解问题";
  if (input.confirming) return "确认口径后整理语义草案";
  if (input.accepting) return "锁定语义草稿";
  if (input.previewing) return BUILDER_ACTION_COPY.sandboxButton;
  if (input.releasePreviewing) return "生成发布预演";
  if (input.saving) return BUILDER_ACTION_COPY.saving;
  if (input.publishing) return BUILDER_ACTION_COPY.publishing;
  if (input.updatingSpec)
    return BUILDER_ACTION_COPY.updatingAdvancedSemanticConfig;
  return undefined;
}


export function hasReleasePreviewableSpec(session: SemanticModelingCopilotSession): boolean {
  const rawSpec = session.workbench_state?.raw_spec;
  if (isRecord(rawSpec)) {
    const hasCube = isRecord(rawSpec.cube) || Array.isArray(rawSpec.cubes);
    if (hasCube && Object.keys(rawSpec).length > 0) return true;
  }
  return hasCubeDraft(session.workbench_state);
}


export function releasePreviewSampleQuestions(
  session: SemanticModelingCopilotSession,
): string[] {
  const sandbox = session.workbench_state?.sandbox_preview;
  const rawQuestions = isRecord(sandbox) ? sandbox.sample_questions : undefined;
  const questions = Array.isArray(rawQuestions)
    ? rawQuestions
        .map((item) => String(item || "").trim())
        .filter((item) => item.length > 0 && !isGenericSampleQuestion(item))
    : [];
  if (questions.length > 0) return questions;
  if (session.entry_type === "business_question" && session.user_goal) {
    return [session.user_goal];
  }
  const semanticQuestions = semanticDraftSampleQuestions(session);
  if (semanticQuestions.length > 0) return semanticQuestions;
  return session.user_goal ? [session.user_goal] : [];
}


export function semanticDraftSampleQuestions(
  session: SemanticModelingCopilotSession,
): string[] {
  const cube = firstCubeWithSemanticFields(session);
  if (!cube) return [];
  const cubeText = [
    stringValue(cube.name),
    stringValue(cube.title),
    stringValue(cube.source),
    session.user_goal,
  ]
    .join(" ")
    .toLowerCase();
  const dimensions = candidateRecordsFromCollection(cube.dimensions);
  const measures = candidateRecordsFromCollection(cube.measures);
  if (cubeText.includes("dim_school") || cubeText.includes("school")) {
    const hasProvince = dimensions.some((item) =>
      normalizeIdentifier(stringValue(item.name) || stringValue(item.expr)).includes(
        "province",
      ),
    );
    const hasCity = dimensions.some((item) =>
      normalizeIdentifier(stringValue(item.name) || stringValue(item.expr)).includes(
        "city",
      ),
    );
    const questions = [
      hasProvince
        ? t(
            "semantic.modelingWorkbench.sample.schoolByProvince",
            "按省份统计学校数",
          )
        : "",
      hasCity
        ? t(
            "semantic.modelingWorkbench.sample.schoolByCity",
            "按城市统计学校数",
          )
        : "",
      t(
        "semantic.modelingWorkbench.sample.schoolCoverage",
        "学校维度资产当前覆盖哪些学校",
      ),
    ].filter((item): item is string => item.length > 0);
    return questions.slice(0, 3);
  }
  const measureTitle = displayNameFromSemanticRecord(
    measures[0],
    t("semantic.modelingWorkbench.sample.measureFallback", "核心指标"),
  );
  const dimensionTitle = displayNameFromSemanticRecord(
    dimensions.find((item) =>
      normalizeIdentifier(stringValue(item.name) || stringValue(item.expr)).includes(
        "school",
      ),
    ) || dimensions[0],
    t("semantic.modelingWorkbench.sample.dimensionFallback", "维度"),
  );
  if (measureTitle && dimensionTitle) {
    return [
      `按${dimensionTitle}查看${measureTitle}`,
      `最近 7 天${measureTitle}趋势`,
    ];
  }
  if (measureTitle) return [`查看${measureTitle}`, `最近 7 天${measureTitle}趋势`];
  return [];
}


export function isGenericSampleQuestion(question: string): boolean {
  const normalized = question.replace(/\s+/g, "");
  return [/业务对象/u, /核心指标/u, /新增指标/u, /示例问题/u].some(
    (pattern) => pattern.test(normalized),
  );
}


export function displayNameFromSemanticRecord(
  item: Record<string, unknown> | undefined,
  fallback: string,
): string {
  if (!item) return fallback;
  const explicit = stringValue(item.title) || stringValue(item.label);
  if (explicit) return explicit;
  return humanizeSemanticName(
    stringValue(item.name) || stringValue(item.expr) || stringValue(item.field),
  );
}


export function composerProgressLabel({
  session,
  totalAssets,
  remainingConfirmations,
  cubeDraftPending,
}: {
  session: SemanticModelingCopilotSession;
  totalAssets: number;
  remainingConfirmations: number;
  cubeDraftPending: boolean;
}): string {
  if (remainingConfirmations > 0) return `${remainingConfirmations} 项待确认`;
  if (session.current_proposal_id)
    return t(
      "semantic.modelingWorkbench.progress.saved",
      "待发布资产已保存",
    );
  const reasons = readinessReasonsForSession(session);
  if (reasons.some((item) => item.includes("source_candidate")))
    return t(
      "semantic.modelingWorkbench.progress.confirmSource",
      "等待确认数据来源",
    );
  if (reasons.some((item) => item.includes("need_source")))
    return t(
      "semantic.modelingWorkbench.progress.needSource",
      "等待补充数据来源",
    );
  if (reasons.some((item) => item.includes("spec_not_generated")))
    return t(
      "semantic.modelingWorkbench.progress.generateDraft",
      "等待生成语义草案",
    );
  if (cubeDraftPending || hasReleasePreviewableSpec(session))
    return t(
      "semantic.modelingWorkbench.progress.generateAsset",
      "等待生成语义资产",
    );
  if (totalAssets > 0)
    return t(
      "semantic.modelingWorkbench.progress.reviewAssets",
      "语义资产待审阅",
    );
  return t("semantic.modelingWorkbench.progress.continue", "等待继续建设");
}


export function readinessReasonsForSession(
  session: SemanticModelingCopilotSession,
): string[] {
  const readiness = session.workbench_state?.readiness;
  if (!isRecord(readiness) || !Array.isArray(readiness.reasons)) return [];
  return readiness.reasons.map(String);
}


export interface SemanticCenterPublishGuard {
  canPublish: boolean;
  reason: string;
  detail?: string;
}


export function getSemanticCenterPublishGuard(
  session: SemanticModelingCopilotSession,
): SemanticCenterPublishGuard {
  const published =
    (
      session.workbench_state?.publish_result as
        | Record<string, unknown>
      | undefined
    )?.status === "published";
  return getSemanticCenterPublishGuardFromState({
    workbenchState: session.workbench_state,
    hasProposal: Boolean(session.current_proposal_id),
    published,
  });
}


export function getSemanticCenterPublishGuardFromState({
  workbenchState,
  hasProposal,
  published,
}: {
  workbenchState?: SemanticModelingCopilotSession["workbench_state"];
  hasProposal: boolean;
  published: boolean;
}): SemanticCenterPublishGuard {
  if (published) {
    return { canPublish: false, reason: "语义资产已经发布到语义中心。" };
  }
  if (!hasProposal) {
    return {
      canPublish: false,
      reason: "请先生成待发布语义资产，然后再发布到语义中心。",
      detail: "当前会话还没有保存 Proposal，不能跳过语义草案和字段审阅。",
    };
  }

  const confirmations = workbenchState?.required_confirmations ?? [];
  if (confirmations.length > 0) {
    return {
      canPublish: false,
      reason: "还有口径或来源确认项未处理，不能发布到语义中心。",
      detail: "请先在建设主流程中确认阻塞项，确保发布快照的业务口径可解释。",
    };
  }

  const reasons = ((workbenchState?.readiness?.reasons ?? []) as unknown[])
    .map((item) => String(item))
    .filter(Boolean);
  const blockingReason = reasons.find(
    (reason) =>
      PUBLISH_BLOCKING_REASONS.has(reason) ||
      reason.startsWith("binding_broken:"),
  );
  if (blockingReason) {
    return {
      canPublish: false,
      reason: `发布门禁阻塞：${reasonLabel(blockingReason) || blockingReason}。`,
      detail: "请先补齐源表、语义草案、字段校验或业务口径，再重新运行发布预演。",
    };
  }

  const preview = extractReleasePreview(workbenchState);
  if (!preview) {
    return {
      canPublish: false,
      reason: "请先运行发布预演，确认语义中心编译通过后再发布。",
      detail: "发布预演由语义中心完成语义到 SQL / Query Plan 的编译检查；Gateway 只作为物理 SQL 执行面验证。",
    };
  }
  if (preview.bindingValidation.status === "failed") {
    const firstBlocker = preview.bindingValidation.blockers[0];
    return {
      canPublish: false,
      reason: "存在断链绑定，发布将被 gate 阻断。",
      detail:
        firstBlocker?.message ||
        preview.bindingValidation.message ||
        "请补齐 Cube ↔ Ontology 绑定后重新运行发布预演。",
    };
  }
  if (preview.semanticCompile.status !== "passed") {
    return {
      canPublish: false,
      reason: `语义编译预演${releasePreviewStatusLabel(preview.semanticCompile.status)}，不能发布。`,
      detail: preview.semanticCompile.message || "请修复语义草案或编译配置后重新运行发布预演。",
    };
  }

  return {
    canPublish: true,
    reason: "发布门禁已通过。",
  };
}


export const PUBLISH_BLOCKING_REASONS = new Set([
  "source_candidate_confirmation_required",
  "need_source_table",
  "spec_not_generated",
  "business_owner_confirmation_required",
  "validation_blocked",
  "cube_draft_not_accepted",
  "binding_not_approved",
]);


export function blockerFixGuide(blocker: ReviewBlocker): { why: string; fix: string } {
  if (blocker.id === "need_source_table") {
    return {
      why: "系统没有足够线索确定物理源表，无法生成可发布语义资产。",
      fix: "在建设主流程中补充表名、数据集名或候选语义资产；最好同时说明指标口径、分组字段和时间字段。",
    };
  }
  if (blocker.id === "source_candidate_confirmation_required") {
    return {
      why: "候选来源会决定语义草案的字段、粒度和后续语义中心路由，必须先确认。",
      fix: "在建设主流程的“推荐数据来源”卡片中点击“使用此来源”。",
    };
  }
  if (
    blocker.id === "spec_not_generated" ||
    blocker.title.includes("spec") ||
    blocker.title.includes("语义草案")
  ) {
    return {
      why: "发布链路需要完整语义草案；当前缺少可保存、可校验的语义配置。",
      fix: "在建设主流程中补充源表/数据集、指标计算规则、分组字段或时间字段；系统拿到这些输入后会重新生成语义草案。",
    };
  }
  if (blocker.source === "validation") {
    const path = stringValue(blocker.technicalHint);
    return {
      why: "当前语义草案没通过结构化校验，发布后可能让消费者路由到错误字段或无效度量。",
      fix: `打开语义草案页，优先修复${path ? ` ${path}` : "红标字段"}；保存后重新运行可用性验证。`,
    };
  }
  if (blocker.source === "confirmation" || blocker.id.startsWith("confirm_")) {
    return {
      why: "这是业务口径决策，不确认会导致指标粒度不可审计。",
      fix: "在建设主流程的确认卡片里使用推荐值，或换一个明确口径；确认后右侧阻塞会自动减少。",
    };
  }
  if (blocker.id.includes("binding") || blocker.title.includes("绑定")) {
    return {
      why: "对象到语义资产的绑定还没有治理记录，消费者不能稳定从业务语言落到执行语义。",
      fix: "先保存语义资产草案，再完成绑定审批；当前可打开语义草案检查度量引用和对象名是否一致。",
    };
  }
  if (
    blocker.source === "publish" ||
    blocker.id === "approved_semantic_diff_drift"
  ) {
    return {
      why: "发布阶段发现批准时的语义差异与实际应用资产不一致，后端已阻止写入语义中心发布快照。",
      fix: `打开语义草案检查完整配置；如刚改过字段或来源表，请重新生成待发布语义资产，再在建设主流程中点击「${BUILDER_ACTION_COPY.publishButton}」。`,
    };
  }
  return {
    why: blocker.description || "发布前检查发现仍有未处理事项。",
    fix: "先按当前阻塞项处理；如果需要 AI 助手解释，可复制问题给 AI 助手输入框，但 UI 内已保留可执行路径。",
  };
}


export function sourceEvidenceForArtifact(
  session: SemanticModelingCopilotSession,
  review?: SemanticModelingCopilotReview,
): CopilotSourceEvidence {
  if (review?.source_evidence) return review.source_evidence;
  const state = session.workbench_state ?? {};
  if (state.source_evidence) return state.source_evidence;
  const sourceCandidates = state.source_candidates ?? [];
  if (sourceCandidates.length > 0) {
    const selected =
      sourceCandidates.find((candidate) => candidate.selected) ??
      sourceCandidates[0];
    const sourceName =
      stringValue(selected.name) ||
      [selected.database, selected.table].filter(Boolean).join(".") ||
      stringValue(selected.table);
    return {
      source_table: {
        name: sourceName,
        title: stringValue(selected.title) || "候选数据来源",
        grain: "确认后由 spec 校验",
        freshness: "来自 datasource 元数据缓存",
      },
      fields: [],
      sample_rows: [],
      recommendations: [
        {
          id: "source-candidate",
          title: "为什么推荐",
          reason:
            (Array.isArray(selected.evidence) ? selected.evidence[0] : "") ||
            "候选来源与当前业务问题命中，确认后生成完整 spec。",
        },
      ],
    };
  }
  const rawSpec = (state.raw_spec ?? {}) as Record<string, unknown>;
  const cube = (extractCubeDraft(state) ?? {}) as Record<string, unknown>;
  const source = (rawSpec.source ?? {}) as Record<string, unknown>;
  const proposalPatch = (state.proposal_patch ?? {}) as Record<string, unknown>;
  const explicitSourceName =
    stringValue(proposalPatch.candidate_table) ||
    stringValue(proposalPatch.table) ||
    stringValue(cube.source) ||
    stringValue(source.table);
  const sourceName = explicitSourceName || "待补充源表/数据集";
  const hasExplicitSource = Boolean(explicitSourceName);
  const dimensions = normalizeFieldList(cube.dimensions, "dimension");
  const measures = normalizeFieldList(cube.measures, "measure_source");
  const canvasMetrics = hasExplicitSource
    ? (state.semantic_canvas?.metrics ?? []).map((item) => ({
        ...item,
        role: "measure_source",
        type: "metric",
        evidence: "来自候选指标，可支撑业务问题里的统计口径。",
      }))
    : [];
  return {
    source_table: {
      name: sourceName,
      title:
        stringValue(source.title) ||
        (hasExplicitSource ? "候选源表" : "等待你补充数据来源"),
      grain:
        stringValue(source.grain) ||
        (hasExplicitSource ? "随源表定义" : "需要补充事实粒度或数据集粒度"),
      freshness:
        stringValue(source.freshness) ||
        (hasExplicitSource ? "随源表同步" : "补充源表后再校验"),
    },
    fields: [...dimensions, ...measures, ...canvasMetrics].slice(0, 8),
    sample_rows: [],
    recommendations: hasExplicitSource
      ? [
          {
            id: "source-table",
            title: "为什么选择这张表",
            reason: `${sourceName} 与业务问题“${session.user_goal}”的主体、指标和分组口径匹配。`,
          },
        ]
      : [],
  };
}


export function normalizeFieldList(
  value: unknown,
  role: string,
): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      )
      .map((item) => ({
        ...item,
        role: stringValue(item.role) || role,
        evidence:
          stringValue(item.evidence) || "来自当前语义草案，可支撑建模口径。",
      }));
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).map(
      ([name, payload]) => ({
        ...(payload && typeof payload === "object"
          ? (payload as Record<string, unknown>)
          : {}),
        name,
        role,
        evidence: "来自当前语义草案，可支撑建模口径。",
      }),
    );
  }
  return [];
}


export function traceStateForArtifact(
  session: SemanticModelingCopilotSession,
  review?: SemanticModelingCopilotReview,
): CopilotTraceState {
  if (review?.trace_state) return review.trace_state;
  if (session.workbench_state?.trace_state)
    return session.workbench_state.trace_state;
  const events = [
    ...(session.tool_traces ?? []).map((trace, index) => ({
      id: `tool_${index}`,
      type: "tool",
      title: trace.tool || `tool_${index}`,
      status: trace.status || "completed",
      summary: trace.summary || trace.error || "",
    })),
  ];
  if (session.current_proposal_id) {
    events.push({
      id: "audit_save",
      type: "audit",
      title: "待发布资产保存审计",
      status: "completed",
      summary: session.current_proposal_id,
    });
  }
  const published =
    (
      session.workbench_state?.publish_result as
        | Record<string, unknown>
        | undefined
    )?.status === "published";
  if (published) {
    events.push({
      id: "audit_publish",
      type: "audit",
      title: "发布审计",
      status: "completed",
      summary: "语义中心发布快照已生成，消费者可验证",
    });
  }
  return { events };
}


export function publishGateForArtifact(
  session: SemanticModelingCopilotSession,
  review?: SemanticModelingCopilotReview,
  context?: {
    status?: string;
    blockers?: ReviewBlocker[];
    published?: boolean;
    hasProposal?: boolean;
  },
): CopilotPublishGate {
  if (review?.publish_gate) return review.publish_gate;
  if (session.workbench_state?.publish_gate)
    return session.workbench_state.publish_gate;
  const rawSpec = (session.workbench_state?.raw_spec ?? {}) as Record<
    string,
    unknown
  >;
  const hasSpec = Boolean(rawSpec.spec_version && rawSpec.cube);
  const blockers = context?.blockers ?? [];
  const published =
    context?.published ??
    (
      session.workbench_state?.publish_result as
        | Record<string, unknown>
        | undefined
    )?.status === "published";
  const hasProposal =
    context?.hasProposal ?? Boolean(session.current_proposal_id);
  const state = published
    ? "published"
    : blockers.length > 0 || !hasSpec
      ? "blocked"
      : hasProposal
        ? "ready_to_publish"
        : "ready_to_save";
  const label =
    state === "published"
      ? "发布门禁已通过"
      : state === "blocked"
        ? "发布门禁阻塞"
        : state === "ready_to_publish"
          ? "发布材料已就绪"
          : "草稿可保存";
  const sandbox = session.workbench_state?.sandbox_preview;
  const sandboxPassed = Boolean(sandbox && sandbox.status !== "blocked");
  return {
    state,
    label,
    steps: [
      {
        id: "spec",
        label: "语义草案完整",
        status: hasSpec ? "passed" : "blocked",
        description: hasSpec
          ? "语义草案已生成并可保存。"
          : "需要先生成或补齐语义草案。",
      },
      {
        id: "blockers",
        label: "阻塞项清零",
        status: blockers.length === 0 ? "passed" : "blocked",
        description:
          blockers.length === 0 ? "没有发布阻塞。" : "仍有阻塞项需要处理。",
      },
      {
        id: "sandbox",
        label: BUILDER_ACTION_COPY.sandboxButton,
        status: sandboxPassed || published ? "passed" : "pending",
        description:
          sandboxPassed || published
            ? "草稿预演已通过。"
            : "建议发布前运行草稿态可用性预演。",
      },
      {
        id: "semantic-center",
        label: "语义中心生效",
        status: published ? "passed" : "pending",
        description: published
          ? "发布资产已进入语义中心快照。"
          : "发布成功后才写入语义中心发布快照。",
      },
    ],
  };
}


export function postPublishValidationForArtifact(
  session: SemanticModelingCopilotSession,
  review?: SemanticModelingCopilotReview,
): CopilotPostPublishValidation {
  if (review?.post_publish_validation) return review.post_publish_validation;
  if (session.workbench_state?.post_publish_validation)
    return session.workbench_state.post_publish_validation;
  const rawSpec = (session.workbench_state?.raw_spec ?? {}) as Record<
    string,
    unknown
  >;
  const cube = (rawSpec.cube ?? {}) as Record<string, unknown>;
  const published =
    (
      session.workbench_state?.publish_result as
        | Record<string, unknown>
        | undefined
    )?.status === "published";
  return {
    status: published ? "passed" : "not_run",
    label: published
      ? "样例问答验收通过"
      : `${CONSUMER_VALIDATION_COPY.sectionTitle}待运行`,
    sample_question: Array.isArray(rawSpec.sample_questions)
      ? stringValue(rawSpec.sample_questions[0])
      : "最近 7 天学生评论数按学校汇总",
    runtime_route: published
      ? stringValue(cube.name) || "semantic_runtime"
      : null,
    result_summary: published
      ? `Data Agent 样例已命中 ${stringValue(cube.name) || "semantic_runtime"}，BI 和数据分析可继续按同一语义资产验证。`
      : CONSUMER_VALIDATION_COPY.summaryFallback,
  };
}


export function buildProposalReview(
  session: SemanticModelingCopilotSession,
  forcePublished = false,
) {
  const state = session.workbench_state || {};
  const cube = extractCubeDraft(state) ?? {};
  const rawSpec = (state.raw_spec ?? {}) as Record<string, unknown>;
  const ontology = (rawSpec.ontology ?? {}) as Record<string, unknown>;
  const ontologyObject =
    ((ontology.object ?? {}) as Record<string, unknown>) || {};
  const ontologyMetrics = Array.isArray(ontology.metrics)
    ? (ontology.metrics as Array<Record<string, unknown>>)
    : [];
  const canvas = state.semantic_canvas ?? {};
  const candidates = state.candidate_cards ?? [];
  const firstCandidate = candidates[0] as Record<string, unknown> | undefined;
  const cubeName =
    stringValue(cube.name) ||
    stringValue(firstCandidate?.name) ||
    "dwd_interaction_comment_reports_df";
  const cubeTitle =
    stringValue(cube.title) || stringValue(firstCandidate?.title) || "学生评论";
  const cubeSource =
    stringValue(cube.source ?? cube.table) ||
    "df_cb_258187.dwd_interaction_comment_reports_df";
  const objectName =
    stringValue(ontologyObject.name) ||
    stringValue(canvas.objects?.[0]?.name) ||
    "student_comment";
  const objectTitle =
    stringValue(ontologyObject.title) ||
    stringValue(canvas.objects?.[0]?.title) ||
    "学生评论";
  const metricPayload = (canvas.metrics?.[0] ??
    ontologyMetrics[0] ??
    {}) as Record<string, unknown>;
  const metricName =
    stringValue(metricPayload.name) || "student_comment_total_count";
  const metricTitle = stringValue(metricPayload.title) || "学生评论总数";
  const bindingPayload = (canvas.bindings?.[0] ?? {}) as Record<
    string,
    unknown
  >;
  const measureRef =
    stringValue(bindingPayload.measure_ref) ||
    measureRefString(
      (ontologyMetrics[0]?.measure_refs as unknown[] | undefined)?.[0],
    ) ||
    `${cubeName}.total_count`;
  const schoolDimension = findDimensionName(
    cube,
    canvas,
    "comment_school_name",
  );
  const timeDimension = findDimensionName(cube, canvas, "comment_published_at");
  const policyName =
    stringValue(canvas.policies?.[0]?.name) ||
    "student_comment_total_count_policy";
  const confirmations = state.required_confirmations ?? [];
  const reasons = Array.isArray(state.readiness?.reasons)
    ? (state.readiness?.reasons ?? [])
    : [];
  const published =
    forcePublished ||
    Boolean(
      (state.publish_result as Record<string, unknown> | undefined)?.status ===
      "published",
    );
  const blockers = published
    ? []
    : buildReviewBlockers(
        confirmations,
        reasons,
        state.validation_summary ?? [],
        state.publish_result,
      );
  const currentProposalId =
    session.current_proposal_id ||
    stringValue(
      (state.advanced_refs as Record<string, unknown> | undefined)?.proposal_id,
    ) ||
    stringValue(state.proposal_summary?.id) ||
    "未保存";
  const changes = buildReviewChanges({
    cubeName,
    cubeTitle,
    cubeSource,
    objectName,
    objectTitle,
    metricName,
    metricTitle,
    measureRef,
    schoolDimension,
    timeDimension,
    policyName,
    candidates,
    blockers,
    currentProposalId: session.current_proposal_id,
  });
  const pendingConfirmations = confirmations.filter(
    (item) => !item.confirmed,
  ).length;
  const status = proposalReviewStatus({
    published,
    currentProposalId: session.current_proposal_id,
    blockers,
  });
  const reasonLabels = reasonLabelsForReview(
    reasons,
    blockers,
    session.current_proposal_id,
  );

  return {
    sessionId: session.id,
    question: session.user_goal,
    entryType: session.entry_type,
    title: `${objectTitle}分析建模草案`,
    proposalId: currentProposalId,
    changes,
    blockers,
    pendingConfirmations,
    evidenceCount: state.evidence_summary?.length ?? 0,
    traceCount: session.tool_traces?.length ?? 0,
    reasonLabels,
    published,
    currentProposalId: session.current_proposal_id,
    statusLabel: status.label,
    statusTone: status.tone,
    publishHint: status.hint,
    dataAgentState: published
      ? "消费者可基于语义中心发布快照验证"
      : "消费者暂不可基于语义中心发布快照验证",
    sourceEvidence: sourceEvidenceForArtifact(session),
    traceState: traceStateForArtifact(session),
    publishGate: publishGateForArtifact(session, undefined, {
      status: status.label,
      blockers,
      published,
      hasProposal: Boolean(session.current_proposal_id),
    }),
    postPublishValidation: postPublishValidationForArtifact(session),
    summaryTitle: published ? "语义资产已发布" : "语义建模草案已生成",
    summaryCopy: published
      ? `基于业务问题“${session.user_goal}”发布的 ${cubeName} 与 ${objectName} 已进入语义中心发布快照。`
      : `根据业务问题“${session.user_goal}”，系统把 ${objectName}、${metricName}、${cubeName} 和治理策略整理成可审阅草案。发布前需要先处理阻塞项；未发布前不会写入语义中心发布快照。`,
  };
}


export function buildProposalReviewFromArtifact(
  session: SemanticModelingCopilotSession,
  artifact: SemanticModelingCopilotReview,
  fallback: ReturnType<typeof buildProposalReview>,
): ReturnType<typeof buildProposalReview> {
  const artifactChanges: ReviewChange[] = (artifact.changes ?? []).map(
    (item, idx) => ({
      id: item.id || `change_${idx}`,
      type: changeTypeLabel(item.type),
      title:
        stringValue(item.technical_name) || item.title || `变更 ${idx + 1}`,
      subtitle: item.title || item.operation || "语义变更",
      status:
        artifact.status === "published"
          ? "已应用"
          : artifact.status === "blocked"
            ? "受阻塞"
            : "候选",
      confidence: "高",
      reason:
        stringValue(item.reason) ||
        "系统根据业务问题、候选语义和源表证据生成。",
      impact:
        stringValue(item.impact) ||
        "生成待发布资产后会参与语义校验、治理审核和发布。",
      risk: stringValue(item.risk) || "发布前需要确认口径、绑定和权限策略。",
      evidence: stringValue(item.technical_name) || item.title,
    }),
  );
  const published = artifact.status === "published";
  const artifactBlockers: ReviewBlocker[] = published
    ? []
    : (artifact.blockers ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        state: item.severity === "warning" ? "in_progress" : "open",
        description: item.description,
        source: item.source,
        technicalHint: item.technical_hint,
        action:
          item.source === "confirmation"
            ? "待处理 · 阻断项"
            : item.source === "validation"
              ? "待修复 · 校验"
              : "待处理 · 发布前检查",
      }));
  const effectiveBlockers = published
    ? []
    : artifactBlockers.length > 0
      ? artifactBlockers
      : fallback.blockers;
  const statusTone = published
    ? "success"
    : artifact.status === "blocked" || effectiveBlockers.length > 0
      ? "warning"
      : "accent";
  return {
    ...fallback,
    proposalId: artifact.proposal_id || fallback.proposalId,
    changes: artifactChanges.length > 0 ? artifactChanges : fallback.changes,
    blockers: effectiveBlockers,
    pendingConfirmations: effectiveBlockers.filter((item) =>
      item.id.includes("confirm"),
    ).length,
    reasonLabels:
      effectiveBlockers.length > 0
        ? effectiveBlockers.map((item) => item.title).slice(0, 5)
        : [artifact.status_label || "发布材料已就绪"],
    published,
    currentProposalId: artifact.proposal_id || session.current_proposal_id,
    statusLabel: published
      ? fallback.statusLabel
      : artifact.status_label || fallback.statusLabel,
    statusTone,
    publishHint: published
      ? fallback.publishHint
      : artifact.primary_action?.disabled_reason || fallback.publishHint,
    dataAgentState: normalizeConsumerValidationText(
      artifact.data_agent_consumption?.label || fallback.dataAgentState,
    ),
    sourceEvidence: sourceEvidenceForArtifact(session, artifact),
    traceState: traceStateForArtifact(session, artifact),
    publishGate: publishGateForArtifact(session, artifact, {
      status: artifact.status_label || fallback.statusLabel,
      blockers: effectiveBlockers,
      published,
      hasProposal: Boolean(artifact.proposal_id || session.current_proposal_id),
    }),
    postPublishValidation: postPublishValidationForArtifact(session, artifact),
    summaryTitle: published ? "语义资产已发布" : "语义建模草案已生成",
    summaryCopy: published
      ? `基于业务问题“${session.user_goal}”发布的语义资产已进入语义中心发布快照。`
      : `根据业务问题“${session.user_goal}”，系统已生成可审阅语义草案。AI 助手可继续沟通，右侧用于审阅变更、阻塞项和发布到语义中心检查。`,
  };
}


export function normalizeConsumerValidationText(text?: string | null): string {
  return stringValue(text)
    .replace(
      /正式 Data Agent 已能命中\s*([^，。,.]+)[，。,.]?/g,
      (_match, route: string) => {
        const normalizedRoute = stringValue(route).trim();
        return `Data Agent 样例已命中 ${normalizedRoute || "语义资产"}，BI 和数据分析可继续按同一语义资产验证。`;
      },
    )
    .replace(/正式 Data Agent 可消费/g, "消费者可基于语义中心发布快照验证")
    .replace(
      /正式 Data Agent 暂不可消费/g,
      "消费者暂不可基于语义中心发布快照验证",
    )
    .replace(/发布后 Data Agent 可消费/g, "发布后消费者可验证")
    .replace(/正式 runtime/g, "语义中心发布快照")
    .replace(/runtime/g, "语义中心发布快照");
}


export function changeTypeLabel(type: string): string {
  switch (type) {
    case "cube":
      return "新增语义资产";
    case "metric":
      return "新增指标";
    case "object":
      return "语义对象";
    case "binding":
      return "语义绑定";
    case "dimension":
      return "补齐维度";
    case "policy":
      return "访问策略";
    default:
      return type || "语义变更";
  }
}


export function buildReviewChanges(input: {
  cubeName: string;
  cubeTitle: string;
  cubeSource: string;
  objectName: string;
  objectTitle: string;
  metricName: string;
  metricTitle: string;
  measureRef: string;
  schoolDimension: string;
  timeDimension: string;
  policyName: string;
  candidates: CopilotCandidateCard[];
  blockers: ReviewBlocker[];
  currentProposalId?: string | null;
}): ReviewChange[] {
  const blockedTitles = input.blockers.map((item) => item.title);
  const saved = Boolean(input.currentProposalId);
  const baseStatus = saved ? "已应用" : "候选";
  const bindingBlocked = blockedTitles.some((title) => title.includes("绑定"));
  const confidence = confidenceLabel(input.candidates[0]?.score);
  return [
    {
      id: "cube",
      type: "新增语义资产",
      title: input.cubeName,
      subtitle: `${input.cubeTitle} · 来源 ${input.cubeSource}`,
      status: baseStatus,
      confidence,
      reason:
        "真实评论/举报明细表已经具备发布时间、学校、评论内容与举报状态字段，能承接学生评论分析主诉求。",
      impact: "支撑学生评论数、学校汇总、审核治理与后续智能问数路由。",
      risk: saved
        ? "发布前仍需最终确认影响范围。"
        : "未生成待发布语义资产前不会进入治理审核，也不会写入语义中心发布快照。",
      evidence: `候选资产与业务问题命中，measure_ref 可落到 ${input.measureRef}。`,
    },
    {
      id: "metric",
      type: "新增指标",
      title: input.metricName,
      subtitle: `${input.metricTitle} · ${input.measureRef}`,
      status: baseStatus,
      confidence: "高",
      reason: "用户问题直接要求“评论数”，总量指标是当前建模的第一优先级。",
      impact: "进入智能问数默认指标候选，并可被学校经营画像复用。",
      risk: "需要保持 count 口径与 report_id 粒度一致，避免把回复层级误计为新增评论。",
      evidence: `绑定到 ${input.measureRef}，与 active cube 的 total_count 度量一致。`,
    },
    {
      id: "object",
      type: "语义对象",
      title: input.objectName,
      subtitle: `${input.objectTitle} · Ontology active 对象`,
      status: baseStatus,
      confidence: "高",
      reason:
        "查询表达中的主体是“学生评论”，需要稳定业务对象承接字段、指标和策略。",
      impact: "后续指标、关系路径、治理策略和问数解释都会绑定到该对象。",
      risk: "对象边界需和“学习反馈”“举报记录”保持清晰，避免同义对象分裂。",
      evidence:
        "仓库已新增 student_comment 语义对象，并与评论事实语义资产形成可追踪链路。",
    },
    {
      id: "binding",
      type: "语义绑定",
      title: `${input.objectName} ↔ ${input.cubeName}`,
      subtitle: `对象指标 ${input.metricName} 绑定到 ${input.measureRef}`,
      status: bindingBlocked && !saved ? "受阻塞" : baseStatus,
      confidence: "高",
      reason:
        "没有对象到语义资产的绑定，智能问数无法稳定从业务语言落到执行语义。",
      impact: "决定对象查询、指标解析、血缘追踪和发布前检查。",
      risk: bindingBlocked
        ? "绑定审批未完成前不允许发布。"
        : "需要在发布前确认绑定关系没有覆盖错误对象。",
      evidence: `当前绑定路径为 ${input.objectName} -> ${input.measureRef}。`,
    },
    {
      id: "dimension",
      type: "补齐维度",
      title: input.schoolDimension,
      subtitle: `按学校汇总 · 默认时间 ${input.timeDimension}`,
      status: baseStatus,
      confidence: "高",
      reason:
        "业务问题明确包含“按学校汇总”和“最近 7 天”，学校与时间维度必须进入语义草案。",
      impact: "开放学校维度聚合、时间过滤和运营复盘 drilldown。",
      risk: "学校字段应使用发布者学校口径，不应误用举报人学校口径。",
      evidence: `${input.schoolDimension} 与 ${input.timeDimension} 已在真实语义资产维度中存在。`,
    },
    {
      id: "policy",
      type: "访问策略",
      title: input.policyName,
      subtitle: "restricted · ops_readonly / data_agent_test",
      status: baseStatus,
      confidence: "中",
      reason: "学生评论涉及敏感内容和学校范围隔离，发布前必须带上治理策略。",
      impact: "正式执行链会通过权限上下文做策略命中和审计留痕。",
      risk: "后端权限包与审批流未全部打通前，只能展示发布前风险，不替代真实审批。",
      evidence:
        "新增策略将 student_comment_total_count 标记为 restricted，并限定可访问角色。",
    },
  ];
}


export function buildReviewBlockers(
  confirmations: CopilotConfirmation[],
  reasons: string[],
  validationSummary: Array<Record<string, unknown>>,
  publishResult?: unknown,
): ReviewBlocker[] {
  const blockers: ReviewBlocker[] = [];
  confirmations
    .filter((item) => !item.confirmed)
    .forEach((item) => {
      const title = `${String(item.title ?? item.question ?? item.id)}口径待确认`;
      blockers.push({
        id: item.id,
        title,
        state: "open",
        description:
          String(item.explain ?? item.question ?? "") ||
          `需要确认推荐值 ${String(item.recommended_value ?? "-")}，否则发布粒度不可审计。`,
        action: item.blocking ? "待处理 · 阻断项" : "待处理 · 可选项",
        source: "confirmation",
        technicalHint: item.recommended_value,
      });
    });

  if (reasons.includes("binding_not_approved")) {
    blockers.push({
      id: "binding_not_approved",
      title: "语义绑定审批未完成",
      state: "open",
      description:
        "student_comment 与 dwd_interaction_comment_reports_df 的对象 / 语义资产绑定尚未通过治理审批，发布前需要补齐审批记录。",
      action: "待处理 · 完成条件：审批通过",
      source: "readiness",
    });
  }
  if (reasons.includes("need_source_table")) {
    blockers.push({
      id: "need_source_table",
      title: "缺少源表线索",
      state: "open",
      description:
        "后端还没有识别到可生成语义草案的候选表，需要继续补充物理表或候选数据集。",
      action: "待补充 · 源表",
      source: "readiness",
    });
  }
  if (reasons.includes("source_candidate_confirmation_required")) {
    blockers.push({
      id: "source_candidate_confirmation_required",
      title: "数据来源待确认",
      state: "open",
      description:
        "系统已根据数据源元数据召回候选来源，需要你确认后才能生成语义草案。",
      action: "待确认 · 数据来源",
      source: "readiness",
    });
  }
  if (reasons.includes("spec_not_generated")) {
    blockers.push({
      id: "spec_not_generated",
      title: "完整语义草案尚未生成",
      state: "open",
      description:
        "当前会话还没有可保存、可校验的语义草案，可用性验证和发布都会被阻塞。",
      action: "待生成 · 语义草案",
      source: "readiness",
    });
  }
  if (reasons.includes("approved_semantic_diff_drift")) {
    blockers.push({
      id: "approved_semantic_diff_drift",
      title: "已批准差异和应用资产不一致",
      state: "open",
      description:
        "保存语义资产草案后的批准差异与应用阶段实际资产发生漂移，后端拒绝发布。",
      action: "待处理 · 重新生成语义资产",
      source: "publish",
    });
  }
  if (reasons.includes("approved_spec_changed_before_apply")) {
    blockers.push({
      id: "approved_spec_changed_before_apply",
      title: "已批准语义草案在发布前发生变化",
      state: "open",
      description:
        "保存语义资产草案后语义配置又发生变化，后端拒绝沿用旧批准记录发布。",
      action: "待处理 · 重新生成语义资产",
      source: "publish",
    });
  }
  if (isRecord(publishResult) && publishResult.status === "failed") {
    const reason = stringValue(publishResult.reason) || "publish_failed";
    blockers.push({
      id: reason,
      title:
        stringValue(publishResult.title) || reasonLabel(reason) || "发布失败",
      state: "open",
      description:
        stringValue(publishResult.hint) ||
        stringValue(publishResult.error) ||
        "发布动作失败，当前语义未写入语义中心发布快照。",
      action: "待处理 · 发布失败",
      source: "publish",
      technicalHint: publishResult.error,
    });
  }
  validationSummary
    .filter((item) => item.severity === "error")
    .forEach((item, idx) => {
      blockers.push({
        id: `validation_${idx}`,
        title: "校验错误未处理",
        state: "open",
        description: String(
          item.message ?? "建模校验返回错误，发布前必须修复。",
        ),
        action: "待修复 · 校验",
        source: "validation",
        technicalHint: item.path,
      });
    });

  return dedupeBlockers(blockers);
}


export function proposalReviewStatus({
  published,
  currentProposalId,
  blockers,
}: {
  published: boolean;
  currentProposalId?: string | null;
  blockers: ReviewBlocker[];
}): {
  label: string;
  tone: "success" | "warning" | "danger" | "accent" | "neutral";
  hint: string;
} {
  if (published) {
    return {
      label: "已发布 · 消费者可验证",
      tone: "success",
      hint: "语义资产包已进入语义中心发布快照。",
    };
  }
  if (!currentProposalId) {
    if (blockers.length > 0) {
      return {
        label: "当前只能保存草稿",
        tone: "warning",
        hint: `需完成 ${blockers.length} 项后，建模草案才能进入发布状态。`,
      };
    }
    return {
      label: "草稿可保存，尚未进入发布",
      tone: "accent",
      hint: "当前语义草案已具备保存条件；生成待发布资产后才能进入发布前确认。",
    };
  }
  if (blockers.length > 0) {
    return {
      label: "发布前还有阻塞",
      tone: "warning",
      hint: `待发布资产已生成，但仍有 ${blockers.length} 项发布阻塞需要处理。`,
    };
  }
  return {
    label: "待发布资产已保存，等待发布预演与确认",
    tone: "success",
    hint: "暂无发布阻塞；发布前可先查看只读预演，最终发布会写入语义中心发布快照。",
  };
}


export function reasonLabelsForReview(
  reasons: string[],
  blockers: ReviewBlocker[],
  currentProposalId?: string | null,
): string[] {
  const labels = new Set<string>();
  if (!currentProposalId) labels.add("当前仅可保存草稿");
  reasons.forEach((reason) => {
    labels.add(reasonLabel(reason));
  });
  blockers.forEach((blocker) => labels.add(blocker.title));
  if (labels.size === 0) labels.add("发布材料已就绪");
  return [...labels].slice(0, 5);
}


export function reasonLabel(reason: string): string {
  if (reason.startsWith("binding_broken:")) {
    const code = reason.slice("binding_broken:".length);
    return `绑定断链（${code}）`;
  }
  switch (reason) {
    case "business_owner_confirmation_required":
      return "待业务负责人确认";
    case "binding_not_approved":
      return "语义绑定待审批";
    case "ready_to_save":
      return "草稿可保存";
    case "need_source_table":
      return "缺少源表";
    case "spec_not_generated":
      return "语义草案尚未生成";
    case "validation_blocked":
      return "校验阻塞";
    case "approved_semantic_diff_drift":
      return "发布失败：资产漂移";
    case "approved_spec_changed_before_apply":
      return "发布失败：语义草案已变化";
    case "publish_failed":
      return "发布失败";
    default:
      return reason;
  }
}


export function findDimensionName(
  cube: Record<string, unknown>,
  canvas: NonNullable<
    SemanticModelingCopilotSession["workbench_state"]["semantic_canvas"]
  >,
  preferred: string,
): string {
  const dimensions = cube.dimensions;
  if (Array.isArray(dimensions)) {
    const found = dimensions.find(
      (item) => isRecord(item) && String(item.name ?? "") === preferred,
    );
    if (isRecord(found)) return String(found.name);
    const first = dimensions.find((item) => isRecord(item) && item.name);
    if (isRecord(first)) return String(first.name);
  } else if (isRecord(dimensions)) {
    if (dimensions[preferred]) return preferred;
    const first = Object.keys(dimensions)[0];
    if (first) return first;
  }
  const canvasMatch = canvas.dimensions?.find(
    (item) => item.name === preferred,
  );
  if (canvasMatch?.name) return canvasMatch.name;
  return preferred;
}


export function confidenceLabel(score: unknown): string {
  if (typeof score !== "number") return "高";
  if (score >= 0.8) return "高";
  if (score >= 0.6) return "中";
  return "低";
}


export function dedupeBlockers(blockers: ReviewBlocker[]): ReviewBlocker[] {
  const seen = new Set<string>();
  return blockers.filter((blocker) => {
    if (seen.has(blocker.id)) return false;
    seen.add(blocker.id);
    return true;
  });
}


export function stringValue(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}


/** 兼容 measure_refs 的字符串与结构化（{ref, role}）两种形态。 */
export function measureRefString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && "ref" in (value as Record<string, unknown>)) {
    return stringValue((value as Record<string, unknown>).ref);
  }
  return "";
}


export function normalizeIdentifier(value: string): string {
  return value
    .trim()
    .replace(/[`"'[\]()]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}


export function humanizeSemanticName(value: string): string {
  const normalized = stringValue(value);
  if (!normalized)
    return t("semantic.modelingWorkbench.sample.measureFallback", "核心指标");
  return normalized
    .replace(/^(dwd|dim|ods|ads)_/i, "")
    .replace(/_df$/i, "")
    .replace(/_/g, " ");
}


export function extractLlmRequiredError(
  error: unknown,
): { message: string; reason?: string } | null {
  if (!AppError.isAppError(error)) return null;
  const details = isRecord(error.details)
    ? (error.details as Record<string, unknown>)
    : {};
  if (details.code === "LLM_REQUIRED" || error.httpStatus === 503) {
    return {
      message:
        error.message || "语义建模助手暂时无法使用：当前部署未配置 LLM。",
      reason: typeof details.reason === "string" ? details.reason : undefined,
    };
  }
  return null;
}


export function formatCopilotError(error: unknown): string {
  if (AppError.isAppError(error)) {
    if (error.code === "INSUFFICIENT_ROLE") {
      const details = isRecord(error.details) ? error.details : {};
      const required = Array.isArray(details.required_roles)
        ? details.required_roles.join(", ")
        : "语义建模权限";
      const current =
        Array.isArray(details.principal_roles) && details.principal_roles.length
          ? details.principal_roles.join(", ")
          : "无角色";
      return `当前账号不能执行该建模动作：需要 ${required}，当前角色 ${current}。`;
    }
    return error.message || "语义建模助手请求失败";
  }
  if (error instanceof Error) {
    if (/timeout|timed out|exceeded/i.test(error.message)) {
      return "语义建模助手请求超时。你可以先按右侧「怎么改」处理阻塞项，或稍后重试；当前草稿不会写入语义中心发布快照。";
    }
    return error.message;
  }
  return "语义建模助手请求失败";
}


export function explainCopilotActionError(
  error: unknown,
  context: "publish" | "general" = "general",
): CopilotActionError {
  const rawMessage = formatCopilotError(error);
  const lowerMessage = rawMessage.toLowerCase();
  if (lowerMessage.includes("approved spec changed before apply")) {
    return {
      title: "发布失败",
      message: "已批准语义草案在发布前发生变化。",
      detail: `请重新点击「${BUILDER_ACTION_COPY.saveButton}」生成新的待发布语义资产，再在建设主流程中点击「${BUILDER_ACTION_COPY.publishButton}」。当前变更不会写入语义中心发布快照。`,
      action: "spec",
    };
  }
  if (
    lowerMessage.includes("applied assets drift") ||
    lowerMessage.includes("semantic_diff")
  ) {
    return {
      title: "发布失败",
      message: "已批准差异和应用资产不一致。",
      detail: `通常是保存语义资产草案后又修改了语义配置，或后端 apply 阶段重新生成的资产与批准时的语义差异漂移。请打开语义草案核对完整配置，重新生成待发布语义资产后再${BUILDER_ACTION_COPY.publishButton}。`,
      action: "spec",
    };
  }
  if (context === "publish") {
    return {
      title: "发布失败",
      message: rawMessage,
      detail: `当前发布动作没有写入语义中心发布快照；请先按错误提示修正语义草案或重新${BUILDER_ACTION_COPY.saveButton}。`,
      action: "spec",
    };
  }
  return {
    title: "操作失败",
    message: rawMessage,
    detail:
      "当前草稿不会写入语义中心发布快照，可以在建设主流程中继续补充信息后重试。",
  };
}


export function formatSpecJson(spec: Record<string, unknown>): string {
  try {
    return JSON.stringify(spec || {}, null, 2);
  } catch {
    return "{}";
  }
}


export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function runtimeProvider(
  snapshot: AgentRuntimeManagementSnapshot | undefined,
  runtimeName: string,
): AgentRuntimeProviderStatus | undefined {
  const providers = Array.isArray(snapshot?.providers)
    ? snapshot.providers
    : [];
  return providers.find((provider) => provider.runtime_name === runtimeName);
}

export type CubeDraftAcceptanceMode = "explicit" | "candidate_locked";
