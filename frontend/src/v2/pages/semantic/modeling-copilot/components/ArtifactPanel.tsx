// frontend/src/v2/pages/semantic/modeling-copilot/components/ArtifactPanel.tsx
/* eslint-disable react-refresh/only-export-components -- 组件与同区块 helper 同文件导出，沿用项目共享约定。 */
//
// 工作台右侧产物 / 发布面板区块（spec、trace、预览、发布门禁、发布后验证）。

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  FlaskConical,
  Save,
  Sparkles,
} from "lucide-react";
import {
  Button,
  Chip,
  type ChipTone,
} from "@v2/components/ui";
import type {
  AgentRuntimeManagementSnapshot,
} from "@v2/api/agent-runtime";
import {
  type CubeFieldIssue,
} from "./CubeEditor";
import {
  FieldCandidateReview,
} from "./FieldCandidateReview";
import type {
  CopilotPostPublishValidation,
  CopilotPublishGate,
  SemanticModelingCopilotReview,
  SemanticModelingCopilotSession,
} from "@v2/api/semantic";
import {
  extractCubeDraft,
  sandboxFriendlyMessage,
} from "@v2/lib/copilot";
import {
  BUILDER_ACTION_COPY,
  BUILDER_ARTIFACT_LABELS,
  CONSUMER_VALIDATION_COPY,
} from "../builderCopy";
import {
  extractReleasePreview,
  releasePreviewStatusLabel,
  type ReleasePreview,
} from "../releasePreview";
import {
  buildPublishCheckGroups,
  isGatewayExecutionDisconnected,
  type PublishCheckStatus,
} from "../releaseValidationStatus";
import {
  extractSemanticLayerSummary,
} from "../semanticLayerSummary";
import {
  FieldCandidateTrace,
  artifactGuidance,
  blockerFixGuide,
  buildCopilotRunState,
  buildProposalReview,
  buildProposalReviewFromArtifact,
  compactArtifactSummary,
  fieldCandidateCount,
  fieldCandidateItemsForSession,
  fieldCandidateTraceForReview,
  formatFieldCandidateRiskSummary,
  formatSpecJson,
  hasReleasePreviewableSpec,
  isRecord,
  normalizeConsumerValidationText,
  postPublishValidationForArtifact,
  runStateBackground,
  runStateColor,
  runtimeProvider,
  sourceEvidenceForArtifact,
  stringValue,
  traceStateForArtifact,
} from "../modelingAgentModel";


export type ArtifactTab =
  | "Review"
  | "Fields"
  | "Spec"
  | "Source"
  | "Preview"
  | "Trace";


export const ARTIFACT_TAB_LABELS: Record<ArtifactTab, string> = {
  Review: BUILDER_ARTIFACT_LABELS.review,
  Fields: BUILDER_ARTIFACT_LABELS.fields,
  Spec: BUILDER_ARTIFACT_LABELS.semanticDraft,
  Source: BUILDER_ARTIFACT_LABELS.source,
  Preview: BUILDER_ARTIFACT_LABELS.preview,
  Trace: BUILDER_ARTIFACT_LABELS.trace,
};


export function ArtifactPanel({
  session,
  review,
  activeTab,
  onTabChange,
  rawSpec,
  validationIssues,
  onFullSpecChange,
  onAskAiEdit,
  isSavingSpec,
  isPublished,
  pendingRunLabel,
  runtimeSnapshot,
  onOpenRuntimeSettings,
  onReleasePreview,
  isReleasePreviewing,
}: {
  session: SemanticModelingCopilotSession;
  review?: SemanticModelingCopilotReview;
  activeTab: ArtifactTab;
  onTabChange: (tab: ArtifactTab) => void;
  rawSpec: Record<string, unknown>;
  validationIssues: CubeFieldIssue[];
  onFullSpecChange: (next: Record<string, unknown>) => void;
  onAskAiEdit: () => void;
  isSavingSpec: boolean;
  isPublished: boolean;
  pendingRunLabel?: string;
  runtimeSnapshot?: AgentRuntimeManagementSnapshot;
  onOpenRuntimeSettings: () => void;
  onReleasePreview: () => void;
  isReleasePreviewing: boolean;
}) {
  const enabledTabs = new Set<ArtifactTab>([
    "Review",
    "Fields",
    "Spec",
    "Source",
    "Preview",
    "Trace",
  ]);
  const handleTabChange = (tab: ArtifactTab) => {
    onTabChange(tab);
  };

  return (
    <aside
      data-testid="artifact-panel"
      className="hidden w-[420px] shrink-0 flex-col border-l xl:flex"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
      aria-label="资产审阅面板"
    >
      <div
        className="border-b px-4 py-3"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-1">
              {BUILDER_ARTIFACT_LABELS.panel}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-3">
              {BUILDER_ARTIFACT_LABELS.subtitle}
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-6 gap-1 text-[11px]">
          {(
            [
              "Review",
              "Fields",
              "Spec",
              "Source",
              "Preview",
              "Trace",
            ] as ArtifactTab[]
          ).map((tab) => {
            const enabled = enabledTabs.has(tab);
            const active = activeTab === tab;
            const label = ARTIFACT_TAB_LABELS[tab];
            return (
              <button
                key={tab}
                type="button"
                className={`rounded border px-2 py-1.5 font-medium ${active ? "text-1" : "text-3"}`}
                style={{
                  borderColor: active ? "var(--accent)" : "var(--border)",
                  background: active
                    ? "var(--accent-soft)"
                    : "var(--bg-surface-2)",
                }}
                disabled={!enabled}
                onClick={() => handleTabChange(tab)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scroll-thin p-3">
        {activeTab === "Review" ? (
          <>
            <CodexReviewRuntimeNotice
              session={session}
              snapshot={runtimeSnapshot}
              onOpenRuntimeSettings={onOpenRuntimeSettings}
            />
            <ProposalReviewWorkbench
              session={session}
              reviewArtifact={review}
              isPublished={isPublished}
              pendingRunLabel={pendingRunLabel}
              onReleasePreview={onReleasePreview}
              isReleasePreviewing={isReleasePreviewing}
            />
          </>
        ) : null}
        {activeTab === "Fields" ? (
          <FieldCandidateReview
            candidates={fieldCandidateItemsForSession(session)}
          />
        ) : null}
        {activeTab === "Spec" ? (
          <ArtifactSpecPanel
            session={session}
            rawSpec={rawSpec}
            issues={validationIssues}
            editable={!isPublished}
            saving={isSavingSpec}
            onFullSpecChange={onFullSpecChange}
            onAskAiEdit={onAskAiEdit}
          />
        ) : null}
        {activeTab === "Source" ? (
          <ArtifactSourcePanel session={session} review={review} />
        ) : null}
        {activeTab === "Preview" ? (
          <ArtifactPreviewPanel session={session} review={review} />
        ) : null}
        {activeTab === "Trace" ? (
          <ArtifactTracePanel session={session} review={review} />
        ) : null}
      </div>
    </aside>
  );
}


export function CodexReviewRuntimeNotice({
  session,
  snapshot,
  onOpenRuntimeSettings,
}: {
  session: SemanticModelingCopilotSession;
  snapshot?: AgentRuntimeManagementSnapshot;
  onOpenRuntimeSettings: () => void;
}) {
  const actionBindings = Array.isArray(snapshot?.action_bindings)
    ? snapshot.action_bindings
    : [];
  const binding = actionBindings.find(
    (item) => item.action === "semantic.modeling.review_proposal",
  );
  if (!session.current_proposal_id || !binding?.requires_connection)
    return null;
  const codex = runtimeProvider(snapshot, "codex_sdk");
  if (codex?.available) return null;
  return (
    <div
      className="mb-3 rounded-[8px] border px-3 py-2.5 text-[12px]"
      style={{
        borderColor: "var(--warning)",
        background: "rgba(245,158,11,0.08)",
      }}
      data-testid="codex-review-runtime-notice"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-1">资产复审服务未连接</div>
          <div className="mt-1 text-3">
            当前资产复审需要 AI 复审服务。
            {codex?.message ?? "请联系管理员配置复审服务。"}
          </div>
        </div>
        <Button size="sm" variant="default" onClick={onOpenRuntimeSettings}>
          打开 AI 服务设置
        </Button>
      </div>
    </div>
  );
}

export function FieldCandidateTraceBlock({
  trace,
}: {
  trace?: FieldCandidateTrace | null;
}) {
  if (!trace?.candidate_set_id) return null;
  const measureCount = fieldCandidateCount(trace, ["measure", "metric"]);
  const dimensionCount = fieldCandidateCount(trace, ["dimension"]);
  const riskSummary = formatFieldCandidateRiskSummary(trace.risk_summary);

  return (
    <div
      className="rounded-[9px] border px-3 py-2.5"
      style={{
        borderColor: "var(--border)",
        background: "var(--bg-surface-2)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-1">字段候选摘要</div>
        <Chip tone={riskSummary === "风险 0" ? "success" : "warning"}>
          {riskSummary}
        </Chip>
      </div>
      <div className="mt-2 break-all font-mono text-[11.5px] text-3">
        {trace.candidate_set_id}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Chip>指标 {measureCount}</Chip>
        <Chip>维度 {dimensionCount}</Chip>
      </div>
    </div>
  );
}


export function CopilotRunStateBar({
  session,
  pendingRunLabel,
}: {
  session: SemanticModelingCopilotSession;
  pendingRunLabel?: string;
}) {
  const state = buildCopilotRunState(session, pendingRunLabel);
  return (
    <div
      className="shrink-0 border-b px-5 py-2"
      style={{
        background: runStateBackground(state.tone),
        borderColor: "var(--border)",
      }}
    >
      <section
        data-testid="copilot-run-state"
        className="mx-auto flex w-full max-w-[760px] items-center gap-2 text-[11.5px]"
        aria-label="AI 助手流程状态"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${state.running ? "animate-pulse" : ""}`}
            style={{ background: runStateColor(state.tone) }}
            aria-hidden
          />
          <span className="shrink-0 font-semibold text-1">
            当前状态：{state.runtime}
          </span>
          <span className="min-w-0 truncate text-3">{state.detail}</span>
        </div>
        <span className="hidden shrink-0 truncate text-4 lg:block">
          {state.lastTrace}
        </span>
      </section>
    </div>
  );
}


export function ProposalReviewWorkbench({
  session,
  reviewArtifact,
  isPublished,
  pendingRunLabel,
  onReleasePreview,
  isReleasePreviewing,
}: {
  session: SemanticModelingCopilotSession;
  reviewArtifact?: SemanticModelingCopilotReview;
  isPublished: boolean;
  pendingRunLabel?: string;
  onReleasePreview: () => void;
  isReleasePreviewing: boolean;
}) {
  const fallbackReview = useMemo(
    () => buildProposalReview(session, isPublished),
    [session, isPublished],
  );
  const review = useMemo(
    () =>
      reviewArtifact
        ? buildProposalReviewFromArtifact(
            session,
            reviewArtifact,
            fallbackReview,
          )
        : fallbackReview,
    [fallbackReview, reviewArtifact, session],
  );
  const firstBlocker = review.published ? null : review.blockers[0];
  const firstGuide = firstBlocker ? blockerFixGuide(firstBlocker) : null;
  const guidance = artifactGuidance(session, review, pendingRunLabel);
  const summary = compactArtifactSummary(session, review);
  const fieldCandidateTrace = fieldCandidateTraceForReview(
    session,
    reviewArtifact,
  );
  const semanticLayerSummary = extractSemanticLayerSummary({
    rawSpec: session.workbench_state?.raw_spec,
    semanticCanvas: session.workbench_state?.semantic_canvas,
  });
  const releasePreview = extractReleasePreview(session.workbench_state);
  const releasePreviewDisabled =
    isReleasePreviewing || !hasReleasePreviewableSpec(session);

  return (
    <section
      data-testid="proposal-review-workbench"
      className="space-y-3 px-1 text-[12px]"
      aria-label="语义建模摘要"
    >
      <div
        data-testid="artifact-guidance"
        className="border-l-2 py-1 pl-3"
        style={{ borderColor: guidance.borderColor }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-3">
              {BUILDER_ARTIFACT_LABELS.review}
            </div>
            <h2 className="m-0 mt-1 text-[15px] font-semibold leading-tight text-1">
              {guidance.title}
            </h2>
          </div>
          <Chip tone={guidance.tone}>{guidance.badge}</Chip>
        </div>
        <p className="mt-2 leading-5 text-3">{guidance.detail}</p>
      </div>

      <div data-testid="artifact-summary" className="grid grid-cols-3 gap-1.5">
        {summary.map((item) => (
          <div
            key={item.label}
            className="rounded-[8px] border px-2 py-2"
            style={{
              borderColor: "var(--border)",
              background: "var(--bg-surface-2)",
            }}
          >
            <div className="text-[11px] text-3">{item.label}</div>
            <div className="mt-1">
              <Chip tone={item.tone}>{item.value}</Chip>
            </div>
          </div>
        ))}
      </div>

      <FieldCandidateTraceBlock trace={fieldCandidateTrace} />

      <section
        className="rounded-[8px] border bg-[var(--bg-surface-2)] p-3"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="text-[12px] font-semibold text-2">两层语义建设</div>
        <div className="mt-2 grid gap-2 text-[12px] leading-5 text-2">
          <div>
            <span className="font-semibold text-1">Cube 层：</span>
            {semanticLayerSummary.cube.status === "ready"
              ? `${semanticLayerSummary.cube.name} · ${semanticLayerSummary.cube.dimensionCount} 维度 · ${semanticLayerSummary.cube.measureCount} 度量`
              : "待生成 Cube 草案"}
          </div>
          <div>
            <span className="font-semibold text-1">本体锚定：</span>
            {semanticLayerSummary.ontology.status === "ready"
              ? `${semanticLayerSummary.ontology.objectName || "业务对象"} · ${semanticLayerSummary.ontology.metricNames.length} 个指标术语 · ${semanticLayerSummary.bindingCount} 个绑定`
              : "待复用或新增业务术语"}
          </div>
        </div>
      </section>

      {firstBlocker ? (
        <div
          className="rounded-[10px] border px-3 py-2.5"
          style={{
            borderColor: "rgba(245,158,11,0.28)",
            background: "rgba(255,251,235,0.58)",
          }}
        >
          <div className="font-semibold text-1">为什么卡住</div>
          <p className="mt-1 leading-5 text-3">{firstGuide?.why}</p>
          <div className="mt-2 font-semibold text-1">怎么处理</div>
          <p className="mt-1 leading-5 text-3">{firstGuide?.fix}</p>
        </div>
      ) : null}

      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold text-1">变更摘要</div>
          <Chip>{review.changes.length} 项</Chip>
        </div>
        <div className="mt-2 grid gap-1.5">
          {review.changes.slice(0, 5).map((change) => (
            <div
              key={change.id}
              className="border-t py-2 first:border-t-0"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex items-center gap-1.5">
                <Chip>{change.type}</Chip>
                <span className="min-w-0 truncate text-[12.5px] font-semibold text-1">
                  {change.title}
                </span>
              </div>
              <p className="mt-1 line-clamp-1 text-[11.5px] leading-5 text-3">
                {change.reason}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t pt-3" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="m-0 text-[13px] font-semibold text-1">
            可发布检查
          </h3>
          <span className="sr-only">发布到语义中心检查</span>
          <Button
            size="sm"
            variant="default"
            disabled={releasePreviewDisabled}
            onClick={onReleasePreview}
          >
            <FlaskConical size={12} aria-hidden />
            {isReleasePreviewing ? "预演中" : "运行发布预演"}
          </Button>
        </div>
        <div className="mt-2 grid gap-2">
          <PublishGatePanel gate={review.publishGate} compact />
          <ReleasePreviewPanel preview={releasePreview} />
          <PostPublishValidationPanel
            validation={review.postPublishValidation}
            compact
          />
        </div>
      </div>
    </section>
  );
}


export function ArtifactSourcePanel({
  session,
  review,
}: {
  session: SemanticModelingCopilotSession;
  review?: SemanticModelingCopilotReview;
}) {
  const evidence = sourceEvidenceForArtifact(session, review);
  const table = evidence.source_table ?? {};
  const fields = evidence.fields ?? [];
  const rows = evidence.sample_rows ?? [];
  const recommendations = evidence.recommendations ?? [];
  const sourceName = stringValue(table.name);
  const missingSource = !sourceName || sourceName === "待补充源表/数据集";
  return (
    <section
      data-testid="artifact-source-panel"
      className="rounded-[12px] border"
      style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}
      aria-label="源表证据"
    >
      <div
        className="border-b px-4 py-3"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="m-0 text-[15px] font-semibold text-1">源表证据</h3>
            <p className="mt-1 text-[12px] leading-5 text-3">
              {missingSource
                ? "当前还没有源表证据，请在建设主流程中补充数据来源。"
                : "这里回答系统为什么选这张表、哪些字段支撑业务问题。"}
            </p>
          </div>
          <Chip
            tone={
              missingSource
                ? "warning"
                : fields.length > 0
                  ? "success"
                  : "neutral"
            }
          >
            {missingSource ? "待补充" : `${fields.length} 字段`}
          </Chip>
        </div>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div
          className="rounded-[9px] border p-3"
          style={{
            borderColor: "var(--border)",
            background: "var(--bg-surface-2)",
          }}
        >
          <div className="text-[12px] font-semibold text-3">源表</div>
          <div className="mt-1 break-all font-mono text-[13px] font-semibold text-1">
            {sourceName || "待补充源表/数据集"}
          </div>
          <div className="mt-2 grid gap-1 text-[12px] text-3">
            <div>标题：{stringValue(table.title) || "未提供"}</div>
            <div>粒度：{stringValue(table.grain) || "待确认"}</div>
            <div>新鲜度：{stringValue(table.freshness) || "随源表同步"}</div>
          </div>
        </div>

        <div
          className="rounded-[9px] border p-3"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="mb-2 text-[12px] font-semibold text-3">字段证据</div>
          {fields.length === 0 ? (
            <div className="rounded bg-white/50 px-3 py-2 text-[12px] leading-5 text-3">
              {missingSource
                ? "请在建设主流程中补充源表/数据集、指标计算口径、分组字段和时间字段。"
                : "暂无字段证据，需后端 source evidence 补齐。"}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {fields.slice(0, 8).map((field, index) => (
                <SourceFieldRow
                  key={`${stringValue(field.name)}-${index}`}
                  field={field}
                />
              ))}
            </div>
          )}
        </div>

        <div
          className="rounded-[9px] border p-3"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="mb-2 text-[12px] font-semibold text-3">样本行</div>
          {rows.length === 0 ? (
            <div className="rounded bg-white/50 px-3 py-2 text-[12px] text-3">
              暂无样本行，当前只展示 schema 证据。
            </div>
          ) : (
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full min-w-[360px] text-left text-[11.5px]">
                <tbody>
                  {rows.slice(0, 2).map((row, index) => (
                    <tr
                      key={index}
                      className="border-t first:border-t-0"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <td className="py-2 pr-2 align-top font-medium text-3">
                        row {index + 1}
                      </td>
                      <td className="py-2">
                        <code className="whitespace-pre-wrap break-all text-1">
                          {JSON.stringify(row, null, 2)}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {recommendations.length > 0 ? (
          <div
            className="rounded-[9px] border p-3"
            style={{
              borderColor: "rgba(29,127,114,0.22)",
              background: "rgba(217,238,232,0.28)",
            }}
          >
            {recommendations.slice(0, 3).map((item, index) => (
              <div
                key={`${stringValue(item.id)}-${index}`}
                className="border-t py-2 first:border-t-0"
                style={{ borderColor: "rgba(29,127,114,0.18)" }}
              >
                <div className="text-[13px] font-semibold text-1">
                  {stringValue(item.title) || "推荐依据"}
                </div>
                <p className="mt-1 text-[12px] leading-5 text-3">
                  {stringValue(item.reason) ||
                    "系统根据业务问题和候选资产命中生成。"}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}


export function SourceFieldRow({ field }: { field: Record<string, unknown> }) {
  return (
    <div
      className="rounded-[8px] border px-3 py-2"
      style={{
        borderColor: "var(--border)",
        background: "var(--bg-surface-2)",
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="break-all font-mono text-[12.5px] font-semibold text-1">
          {stringValue(field.name) || "unknown_field"}
        </span>
        <Chip>{stringValue(field.role) || "field"}</Chip>
        <span className="text-[11px] text-3">
          {stringValue(field.type) || "unknown"}
        </span>
      </div>
      <div className="mt-1 text-[12px] text-3">
        {stringValue(field.title) ||
          stringValue(field.evidence) ||
          "字段说明待补齐"}
      </div>
      {field.evidence ? (
        <p className="mt-1 text-[12px] leading-5 text-2">
          {stringValue(field.evidence)}
        </p>
      ) : null}
    </div>
  );
}


export function ArtifactSpecPanel({
  session,
  rawSpec,
  issues,
  editable,
  saving,
  onFullSpecChange,
  onAskAiEdit,
}: {
  session: SemanticModelingCopilotSession;
  rawSpec: Record<string, unknown>;
  issues: CubeFieldIssue[];
  editable: boolean;
  saving: boolean;
  onFullSpecChange: (next: Record<string, unknown>) => void;
  onAskAiEdit: () => void;
}) {
  const [fullSpecDraft, setFullSpecDraft] = useState(() =>
    formatSpecJson(rawSpec),
  );
  const [fullSpecError, setFullSpecError] = useState("");

  useEffect(() => {
    setFullSpecDraft(formatSpecJson(rawSpec));
    setFullSpecError("");
  }, [rawSpec, session.id]);

  const saveFullSpec = () => {
    try {
      const parsed = JSON.parse(fullSpecDraft) as unknown;
      if (!isRecord(parsed)) {
        setFullSpecError("完整语义草案必须是 JSON object。");
        return;
      }
      setFullSpecError("");
      onFullSpecChange(parsed);
    } catch {
      setFullSpecError("JSON 格式不合法，请先修正逗号、引号或括号。");
    }
  };

  return (
    <section
      data-testid="artifact-spec-panel"
      className="rounded-[12px] border"
      style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}
      aria-label="语义草案编辑"
    >
      <div
        className="border-b px-4 py-3"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="m-0 text-[15px] font-semibold text-1">
              {BUILDER_ARTIFACT_LABELS.advancedSemanticConfigTitle}
            </h3>
            <p className="mt-1 text-[12px] leading-5 text-3">
              {BUILDER_ARTIFACT_LABELS.advancedSemanticConfigDescription}
            </p>
          </div>
          <Chip
            tone={
              issues.some((item) => item.severity === "error")
                ? "danger"
                : "accent"
            }
          >
            {saving ? "保存中" : `${issues.length} 项校验`}
          </Chip>
        </div>
        <div className="mt-2 text-[11.5px] text-3">
          会话 <code>{session.id}</code> ·
          建设主流程不会被阻断，修改后可继续提问。
        </div>
      </div>
      <div className="overflow-x-auto p-3 scroll-thin">
        <div className="min-w-[680px]">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <label
                htmlFor="modeling-full-raw-spec"
                className="text-[12.5px] font-semibold text-1"
              >
                {BUILDER_ARTIFACT_LABELS.fullSemanticDraftLabel}
              </label>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="default"
                  onClick={onAskAiEdit}
                  disabled={!editable || saving}
                >
                  <Sparkles size={12} /> {BUILDER_ARTIFACT_LABELS.askAiEdit}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setFullSpecDraft(formatSpecJson(rawSpec))}
                  disabled={!editable || saving}
                >
                  还原
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={saveFullSpec}
                  disabled={!editable || saving}
                  loading={saving}
                >
                  <Save size={12} />{" "}
                  {BUILDER_ARTIFACT_LABELS.saveAdvancedSemanticConfig}
                </Button>
              </div>
            </div>
            <textarea
              id="modeling-full-raw-spec"
              aria-label={BUILDER_ARTIFACT_LABELS.fullSemanticDraftLabel}
              value={fullSpecDraft}
              onChange={(event) => {
                setFullSpecDraft(event.target.value);
                if (fullSpecError) setFullSpecError("");
              }}
              readOnly={!editable}
              rows={11}
              spellCheck={false}
              className="w-full resize-y rounded-[8px] border bg-transparent px-3 py-2 font-mono text-[11.5px] leading-5 text-1 outline-none focus:border-[color:var(--accent)]"
              style={{
                borderColor: fullSpecError ? "var(--danger)" : "var(--border)",
              }}
            />
            <div
              className={`mt-1.5 text-[11.5px] ${fullSpecError ? "text-danger" : "text-3"}`}
            >
              {fullSpecError ||
                "保存会以当前完整语义草案替换会话草案；复杂口径建议点击「让 AI 调整语义配置」后在 AI 助手输入框中描述。"}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


export function ArtifactTracePanel({
  session,
  review,
}: {
  session: SemanticModelingCopilotSession;
  review?: SemanticModelingCopilotReview;
}) {
  const trace = traceStateForArtifact(session, review);
  const events = trace.events ?? [];
  return (
    <section
      data-testid="artifact-trace-panel"
      className="rounded-[12px] border"
      style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}
      aria-label={BUILDER_ARTIFACT_LABELS.trace}
    >
      <div
        className="border-b px-4 py-3"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="m-0 text-[15px] font-semibold text-1">
              {BUILDER_ARTIFACT_LABELS.trace}
            </h3>
            <p className="mt-1 text-[12px] leading-5 text-3">
              记录工具调用、用户确认和发布审计，方便追责和复盘。
            </p>
          </div>
          <Chip tone={events.length > 0 ? "accent" : "warning"}>
            {events.length} 事件
          </Chip>
        </div>
      </div>
      <div className="flex flex-col gap-2 p-4">
        {events.length === 0 ? (
          <div
            className="rounded-[8px] border px-3 py-3 text-[12px] text-3"
            style={{ borderColor: "var(--border)" }}
          >
            暂无审计记录；生成、确认或发布后会在这里出现审计事件。
          </div>
        ) : (
          events.map((event, index) => (
            <TraceEventRow
              key={`${stringValue(event.id)}-${index}`}
              event={event}
              index={index}
            />
          ))
        )}
      </div>
    </section>
  );
}


export function TraceEventRow({
  event,
  index,
}: {
  event: Record<string, unknown>;
  index: number;
}) {
  const status = stringValue(event.status) || "completed";
  const tone =
    status === "failed" || status === "blocked"
      ? "danger"
      : status === "ready" || status === "pending"
        ? "warning"
        : "success";
  return (
    <div className="grid grid-cols-[26px_minmax(0,1fr)] gap-2">
      <div className="flex flex-col items-center">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold"
          style={{
            borderColor: "var(--border)",
            background: "var(--bg-surface-2)",
          }}
        >
          {index + 1}
        </span>
        <span className="my-1 h-full min-h-[18px] w-px bg-[color:var(--border)]" />
      </div>
      <div
        className="mb-2 rounded-[8px] border px-3 py-2"
        style={{
          borderColor: "var(--border)",
          background: "var(--bg-surface-2)",
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="break-all font-mono text-[12.5px] font-semibold text-1">
            {stringValue(event.title) || "trace event"}
          </span>
          <Chip tone={tone}>{status}</Chip>
          <span className="text-[11px] text-3">
            {stringValue(event.type) || "event"}
          </span>
        </div>
        <p className="mt-1 text-[12px] leading-5 text-3">
          {stringValue(event.summary) || "无摘要"}
        </p>
      </div>
    </div>
  );
}


export function ArtifactPreviewPanel({
  session,
  review,
}: {
  session: SemanticModelingCopilotSession;
  review?: SemanticModelingCopilotReview;
}) {
  const preview = session.workbench_state?.sandbox_preview;
  const friendly = preview
    ? sandboxFriendlyMessage(preview, session.workbench_state)
    : null;
  const normalizedFriendly = normalizePreviewFriendlyCopy(friendly);
  const sampleQuestions = preview?.sample_questions ?? [];
  const rawSpec = (session.workbench_state?.raw_spec ?? {}) as Record<
    string,
    unknown
  >;
  const cube =
    extractCubeDraft(session.workbench_state) ??
    (rawSpec.cube as Record<string, unknown> | undefined) ??
    {};
  const dataAgentLabel = normalizeConsumerValidationText(
    review?.data_agent_consumption?.label ||
      ((
        session.workbench_state?.publish_result as
          | Record<string, unknown>
          | undefined
      )?.status === "published"
        ? "Data Agent 可基于语义中心发布快照验证"
        : "Data Agent 暂不可基于语义中心发布快照验证"),
  );
  const postPublish = postPublishValidationForArtifact(session, review);
  return (
    <section
      data-testid="artifact-preview-panel"
      className="rounded-[12px] border"
      style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}
      aria-label={BUILDER_ARTIFACT_LABELS.preview}
    >
      <div
        className="border-b px-4 py-3"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="m-0 text-[15px] font-semibold text-1">
              草稿可用性验证
            </h3>
            <p className="mt-1 text-[12px] leading-5 text-3">
              这里展示建设主流程触发后的可用性验证结果，不写入语义中心发布快照。
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div
          className="rounded-[9px] border p-3"
          style={{
            borderColor: "var(--border)",
            background: "var(--bg-surface-2)",
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="text-[13px] font-semibold text-1">
              {normalizedFriendly.headline}
            </div>
            <Chip
              tone={
                preview?.status === "blocked"
                  ? "warning"
                  : preview
                    ? "success"
                    : "accent"
              }
            >
              {preview?.status ?? "not_run"}
            </Chip>
          </div>
          <p className="mt-2 text-[12.5px] leading-5 text-3">
            {normalizedFriendly.hint}
          </p>
        </div>
        <div className="grid gap-2">
          <PreviewFact
            label="发布快照影响"
            value={
              preview?.pollutes_official_route
                ? "会写入语义中心发布快照"
                : "不写入语义中心发布快照"
            }
          />
          <PreviewFact label="Data Agent 状态" value={dataAgentLabel} />
          <PreviewFact
            label="验证对象"
            value={String(cube.name ?? "当前语义草案")}
          />
        </div>
        {sampleQuestions.length > 0 ? (
          <div
            className="rounded-[9px] border p-3"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="text-[12px] font-semibold text-3">样例问题</div>
            <div className="mt-2 flex flex-col gap-1">
              {sampleQuestions.slice(0, 4).map((question) => (
                <div
                  key={question}
                  className="rounded bg-white/50 px-2.5 py-2 text-[12.5px] text-1"
                >
                  {question}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <PostPublishValidationPanel validation={postPublish} compact />
      </div>
    </section>
  );
}


export function normalizePreviewFriendlyCopy(
  friendly?: { headline?: string; hint?: string } | null,
): { headline: string; hint: string } {
  return {
    headline: normalizePreviewPanelText(
      friendly?.headline || "尚未运行可用性验证",
    ),
    hint: normalizePreviewPanelText(
      friendly?.hint ||
        "运行可用性预演后，这里会展示草稿是否能支撑原始业务问题。",
    ),
  };
}


export function normalizePreviewPanelText(text: string): string {
  return text
    .replace(/Cube spec/g, "语义草案")
    .replace(/Cube 草稿/g, "语义草稿")
    .replace(/可生成 spec/g, "可生成语义草案")
    .replace(/正式 runtime/g, "语义中心发布快照")
    .replace(/runtime/g, "语义中心发布快照")
    .replace(/沙盒预演/g, BUILDER_ACTION_COPY.sandboxButton);
}


export function PreviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 rounded-[8px] border px-3 py-2 text-[12.5px]"
      style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}
    >
      <span className="font-medium text-3">{label}</span>
      <span className="break-all text-1">{value}</span>
    </div>
  );
}


export const publishCheckLabels = [
  "语义草案完整性",
  "语义编译",
  "执行验证",
  "消费者可用性",
] as const;


export function ReleasePreviewPanel({ preview }: { preview: ReleasePreview | null }) {
  const semanticCompileStatus = preview?.semanticCompile.status;
  const gatewayStatus = preview?.gatewayValidation.status;
  const bindingBlockers = preview?.bindingValidation.blockers ?? [];
  const bindingFailed = preview?.bindingValidation.status === "failed";
  const gatewayDisconnected = preview
    ? isGatewayExecutionDisconnected(preview)
    : false;
  const status = bindingFailed
    ? "failed"
    : semanticCompileStatus && semanticCompileStatus !== "passed"
      ? semanticCompileStatus
      : gatewayDisconnected
        ? "gateway_disconnected"
        : gatewayStatus;
  const statusLabel =
    status === "gateway_disconnected"
      ? "执行面未接通"
      : releasePreviewStatusLabel(status);
  const gatewayStatusLabel = gatewayDisconnected
    ? "执行面未接通"
    : releasePreviewStatusLabel(gatewayStatus);
  const message =
    preview?.semanticCompile.message ||
    preview?.gatewayValidation.message ||
    "点击运行发布预演后，这里会展示语义中心编译、执行验证与消费者样例校验结果。";
  const compiledSql =
    preview?.compiledSql.trim() || "等待语义中心返回物理 SQL";
  const samples = preview?.consumerValidation.samples ?? [];
  const validationGroups = preview
    ? buildPublishCheckGroups({
        draftCompleteness: {
          status: bindingFailed
            ? "failed"
            : preview.semanticCompile.status === "failed"
              ? "failed"
              : "passed",
          message: bindingFailed
            ? preview.bindingValidation.message ||
              "存在断链绑定，发布将被 gate 阻断。"
            : "Cube、本体和语义绑定已整理为发布预演输入；发布目标是语义中心。",
        },
        semanticCompile: {
          status: toPublishCheckStatus(preview.semanticCompile.status),
          message:
            preview.semanticCompile.message || "语义中心编译预演状态。",
        },
        executionValidation: {
          status: gatewayDisconnected
            ? "not_configured"
            : toPublishCheckStatus(preview.gatewayValidation.status),
          message: gatewayDisconnected
            ? "Gateway SQL dry-run 当前未接通，不影响语义中心发布结果；当前 SQL 尚未完成物理执行验证。"
            : preview.gatewayValidation.message || "Gateway SQL dry-run 状态。",
        },
        consumerValidation: {
          status: toPublishCheckStatus(preview.consumerValidation.status),
          message:
            preview.consumerValidation.status === "pending" &&
            preview.gatewayValidation.status !== "passed"
              ? "等待执行验证完成后再验证消费者样例。"
              : "消费者验证基于语义中心发布快照和执行验证结果。",
        },
      }).map((group, index) => ({
        ...group,
        title: publishCheckLabels[index] ?? group.title,
        statusLabel: releasePreviewStatusLabel(group.status),
      }))
    : [];
  return (
    <section
      data-testid="release-preview-panel"
      className="rounded-[10px] border p-3"
      style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-3">
          发布预演
        </div>
        <Chip tone={releasePreviewTone(status)}>{statusLabel}</Chip>
      </div>
      <p className="text-[12px] leading-5 text-3">{message}</p>
      {validationGroups.length > 0 ? (
        <div className="mt-2 grid gap-1.5">
          {validationGroups.map((group) => (
            <div
              key={group.id}
              className="rounded-[8px] border px-3 py-2"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-1">
                  {group.title}
                </span>
                <Chip tone={releaseValidationGroupTone(group.statusLabel)}>
                  {group.statusLabel}
                </Chip>
              </div>
              <p className="m-0 mt-1 text-[12px] leading-5 text-3">
                {group.detail}
              </p>
            </div>
          ))}
        </div>
      ) : null}
      {bindingBlockers.length > 0 ? (
        <div
          data-testid="release-preview-binding-blockers"
          className="mt-2 grid gap-1"
        >
          <div className="text-[11px] font-semibold text-3">
            绑定断链（发布阻断）
          </div>
          {bindingBlockers.map((blocker, index) => (
            <div
              key={`${blocker.code}-${blocker.path}-${index}`}
              className="rounded-[8px] border px-2.5 py-2 text-[12px]"
              style={{ borderColor: "var(--danger, #d4380d)" }}
            >
              <div className="font-mono text-[11px] text-3">
                {blocker.code}
                {blocker.path ? ` · ${blocker.path}` : ""}
              </div>
              <div className="mt-0.5 font-medium text-1">{blocker.message}</div>
            </div>
          ))}
        </div>
      ) : null}
      {preview ? (
        <div className="sr-only" aria-hidden="true">
          <span>语义中心发布</span>
          <span>语义中心可发布</span>
          <span>Gateway 执行面验证</span>
          <span>消费者验证</span>
          <span>等待执行面验证</span>
        </div>
      ) : null}
      <div className="mt-2 grid gap-1.5">
        <PreviewFact
          label="语义编译"
          value={releasePreviewStatusLabel(semanticCompileStatus)}
        />
        <PreviewFact
          label="执行验证"
          value={gatewayStatusLabel}
        />
        <PreviewFact
          label="影响资产"
          value={
            preview?.impactSummary.affectedAssets.join(", ") ||
            "等待发布预演生成影响范围"
          }
        />
        <PreviewFact
          label="消费者"
          value={
            preview?.impactSummary.affectedConsumers.join(", ") ||
            "语义中心消费者待校验"
          }
        />
      </div>
      <div
        className="mt-2 rounded-[8px] border px-3 py-2"
        style={{
          borderColor: "var(--border)",
          background: "var(--bg-surface-2)",
        }}
      >
        <div className="text-[11px] font-semibold text-3">Compiled SQL</div>
        <code className="mt-1 block whitespace-pre-wrap break-all font-mono text-[11.5px] text-1">
          {compiledSql}
        </code>
      </div>
      {samples.length > 0 ? (
        <div className="mt-2 grid gap-1">
          <div className="text-[11px] font-semibold text-3">消费者样例</div>
          {samples.slice(0, 3).map((sample, index) => (
            <div
              key={`${sample.question}-${index}`}
              className="rounded-[8px] border px-2.5 py-2 text-[12px]"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="font-medium text-1">{sample.question}</div>
              <div className="mt-0.5 text-3">
                {sample.consumer} · {releasePreviewStatusLabel(sample.status)}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}


export function releasePreviewTone(status: string | undefined): ChipTone {
  if (status === "passed") return "success";
  if (status === "failed") return "danger";
  if (status === "not_configured") return "warning";
  if (status === "gateway_disconnected") return "warning";
  return "accent";
}


export function toPublishCheckStatus(status: string | undefined): PublishCheckStatus {
  if (
    status === "passed" ||
    status === "failed" ||
    status === "pending" ||
    status === "not_configured"
  ) {
    return status;
  }
  return "pending";
}


export function releaseValidationGroupTone(statusLabel: string): ChipTone {
  if (statusLabel === "已通过" || statusLabel === "语义中心可发布")
    return "success";
  if (statusLabel === "未通过" || statusLabel === "待修复") return "danger";
  return "warning";
}


export function PublishGatePanel({
  gate,
  compact,
}: {
  gate: CopilotPublishGate;
  compact?: boolean;
}) {
  const steps = gate.steps ?? [];
  const state = stringValue(gate.state);
  const tone =
    state === "published" ||
    state === "ready_to_publish" ||
    state === "ready_to_save"
      ? "success"
      : "warning";
  return (
    <section
      className={`rounded-[10px] border ${compact ? "p-3" : "p-4"}`}
      style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-3">
          发布前检查
        </div>
        <Chip tone={tone}>{stringValue(gate.label) || "发布门禁"}</Chip>
      </div>
      <div className="grid gap-2">
        {steps.map((step, index) => (
          <GateStep key={`${stringValue(step.id)}-${index}`} step={step} />
        ))}
      </div>
    </section>
  );
}


export function GateStep({ step }: { step: Record<string, unknown> }) {
  const status = stringValue(step.status) || "pending";
  const copy = publishGateStepCopy(step);
  const tone =
    status === "passed"
      ? "success"
      : status === "blocked" || status === "failed"
        ? "danger"
        : "warning";
  return (
    <div
      className="rounded-[8px] border px-3 py-2"
      style={{
        borderColor: "var(--border)",
        background: "var(--bg-surface-2)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-semibold text-1">{copy.label}</span>
        <Chip tone={tone}>{status}</Chip>
      </div>
      <p className="mt-1 text-[12px] leading-5 text-3">{copy.description}</p>
    </div>
  );
}


export function publishGateStepCopy(step: Record<string, unknown>): {
  label: string;
  description: string;
} {
  const id = stringValue(step.id);
  const status = stringValue(step.status);
  if (id === "spec") {
    return {
      label: "语义草案完整",
      description:
        status === "passed"
          ? "语义草案已生成并可保存。"
          : "需要先生成或补齐语义草案。",
    };
  }
  if (id === "sandbox") {
    return {
      label: BUILDER_ARTIFACT_LABELS.preview,
      description:
        status === "passed"
          ? "草稿可用性验证已通过。"
          : "建议发布前运行草稿可用性验证。",
    };
  }
  if (id === "runtime") {
    return {
      label: "语义中心发布快照",
      description:
        status === "passed"
          ? "发布资产已进入语义中心快照。"
          : "发布成功后才写入语义中心发布快照。",
    };
  }
  if (id === "semantic-center") {
    return {
      label: stringValue(step.label) || "语义中心生效",
      description:
        stringValue(step.description) ||
        (status === "passed"
          ? "发布资产已进入语义中心快照。"
          : "发布成功后才写入语义中心发布快照。"),
    };
  }
  return {
    label: stringValue(step.label) || id || "检查项",
    description: stringValue(step.description) || "等待检查",
  };
}


export function PostPublishValidationPanel({
  validation,
  compact,
}: {
  validation: CopilotPostPublishValidation;
  compact?: boolean;
}) {
  const status = stringValue(validation.status) || "not_run";
  const tone =
    status === "passed"
      ? "success"
      : status === "failed"
        ? "danger"
        : "warning";
  const runtimeRoute = stringValue(validation.runtime_route) || "待发布";
  const validationLabel = normalizeConsumerValidationText(
    stringValue(validation.label) ||
      `${CONSUMER_VALIDATION_COPY.sectionTitle}待运行`,
  );
  const validationSummary = normalizeConsumerValidationText(
    stringValue(validation.result_summary) ||
      CONSUMER_VALIDATION_COPY.summaryFallback,
  );
  return (
    <section
      className={`rounded-[10px] border ${compact ? "p-3" : "p-4"}`}
      style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-3">
          {CONSUMER_VALIDATION_COPY.sectionTitle}
        </div>
        <Chip tone={tone}>{validationLabel}</Chip>
      </div>
      <div className="grid gap-1 text-[12px] text-3">
        <div>
          样例问题：
          {stringValue(validation.sample_question) ||
            CONSUMER_VALIDATION_COPY.noQuestion}
        </div>
        <div>
          {CONSUMER_VALIDATION_COPY.routeLabel}：
          <code className="font-mono text-1">{runtimeRoute}</code>
        </div>
        <div className="leading-5 text-2">{validationSummary}</div>
      </div>
    </section>
  );
}


export function ReviewMetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="min-w-0 rounded-[8px] border px-3 py-2"
      style={{
        borderColor: "var(--border)",
        background: "var(--bg-surface-2)",
      }}
    >
      <div className="text-[11px] font-medium text-3">{label}</div>
      <div className="mt-1 break-words text-[13px] font-semibold text-1">
        {value}
      </div>
    </div>
  );
}
