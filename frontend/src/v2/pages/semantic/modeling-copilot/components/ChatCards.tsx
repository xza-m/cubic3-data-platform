// frontend/src/v2/pages/semantic/modeling-copilot/components/ChatCards.tsx
/* eslint-disable react-refresh/only-export-components -- 组件与同区块 helper 同文件导出，沿用项目共享约定。 */
//
// 对话流内的语义资产卡片区块（发现 / 候选 / 确认 / 沙盒 / 回执 / Cube 草案）。

import {
  useMemo,
  useState,
  type ElementType,
  type ReactNode,
} from "react";
import {
  Box,
  Brain,
  CheckCircle2,
  ChevronRight,
  Database,
  Edit3,
  FileCode2,
  FlaskConical,
  GitBranch,
  HelpCircle,
  Layers3,
  ListChecks,
  MessageSquareText,
  Rocket,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  Button,
  Chip,
} from "@v2/components/ui";
import { Can } from "@v2/components/Can";
import {
  t,
} from "@v2/i18n";
import type {
  CopilotCandidateCard,
  CopilotConfirmation,
  CopilotEvidenceItem,
  CopilotSandboxPreview,
  CopilotSourceCandidate,
  SemanticModelingCopilotSession,
} from "@v2/api/semantic";
import {
  dumpCubeYaml,
  evidenceLevel,
  sandboxFriendlyMessage,
  statusTone,
  type AssistantCard,
} from "@v2/lib/copilot";
import {
  BUILDER_ACTION_COPY,
} from "../builderCopy";
import {
  extractReleasePreview,
} from "../releasePreview";
import {
  ReleasePreviewPanel,
  normalizePreviewFriendlyCopy,
} from "./ArtifactPanel";
import {
  confidenceLabel,
  getSemanticCenterPublishGuardFromState,
  isRecord,
  stringValue,
} from "../modelingAgentModel";
import {
  type CubeDraftAcceptanceMode,
} from "../modelingAgentModel";


export function CardRenderer({
  card,
  onConfirm,
  onOverride,
  onExplain,
  onConfirmSourceCandidate,
  onAcceptCubeDraft,
  onSwapCubeSource,
  onOpenWorkbench,
  onReleasePreview,
  onPublish,
  workbenchState,
  isReleasePreviewing,
  isPublishing,
  isPublished,
  sourceCandidateActionsLocked,
  cubeDraftAcceptanceMode,
  cubeDraftChangeActionsLocked,
}: {
  card: AssistantCard;
  onConfirm: (confirmation: CopilotConfirmation) => void;
  onOverride: (confirmation: CopilotConfirmation) => void;
  onExplain: (confirmation: CopilotConfirmation) => void;
  onConfirmSourceCandidate: (candidate: CopilotSourceCandidate) => void;
  onAcceptCubeDraft: () => void;
  onSwapCubeSource: (currentTable?: string) => void;
  onOpenWorkbench: () => void;
  onReleasePreview: () => void;
  onPublish: () => void;
  workbenchState?: SemanticModelingCopilotSession["workbench_state"];
  isReleasePreviewing: boolean;
  isPublishing: boolean;
  isPublished: boolean;
  sourceCandidateActionsLocked: boolean;
  cubeDraftAcceptanceMode: CubeDraftAcceptanceMode;
  cubeDraftChangeActionsLocked: boolean;
}) {
  if (card.type === "discovered") {
    return <DiscoveredCard canvas={card.canvas} candidates={card.candidates} />;
  }
  if (card.type === "source_candidates") {
    return (
      <SourceCandidateCard
        candidates={card.candidates}
        onConfirm={onConfirmSourceCandidate}
        actionsLocked={sourceCandidateActionsLocked}
      />
    );
  }
  if (card.type === "cube_draft") {
    return (
      <CubeDraftCard
        cube={card.cube}
        candidateTable={card.candidateTable}
        accepted={card.accepted}
        onAccept={onAcceptCubeDraft}
        onSwapSource={() => onSwapCubeSource(card.candidateTable)}
        onOpenWorkbench={onOpenWorkbench}
        acceptanceMode={cubeDraftAcceptanceMode}
        changeActionsLocked={cubeDraftChangeActionsLocked}
      />
    );
  }
  if (card.type === "confirmation") {
    return (
      <ConfirmationCard
        confirmations={card.confirmations}
        onConfirm={onConfirm}
        onOverride={onOverride}
        onExplain={onExplain}
      />
    );
  }
  if (card.type === "sandbox_result") {
    return (
      <SandboxCard preview={card.preview} workbenchState={workbenchState} />
    );
  }
  if (card.type === "saved") {
    return (
      <SavedCard
        proposalId={card.proposalId}
        proposalSummary={card.proposalSummary}
        nextSteps={card.nextSteps}
        published={card.published}
        publishResult={card.publishResult}
        onReleasePreview={onReleasePreview}
        onPublish={onPublish}
        isReleasePreviewing={isReleasePreviewing}
        isPublishing={isPublishing}
        isPublished={isPublished}
        workbenchState={workbenchState}
      />
    );
  }
  return null;
}


export function CardShell({
  title,
  icon: Icon,
  progress,
  children,
}: {
  title: string;
  icon: ElementType;
  progress?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="overflow-hidden rounded-[10px] border"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div
        className="flex items-center gap-2 border-b px-3 py-2.5 text-[12px] font-semibold text-1"
        style={{
          background: "var(--bg-surface-2)",
          borderColor: "var(--border)",
        }}
      >
        <Icon size={13} />
        <span className="flex-1">{title}</span>
        {progress ? (
          <span className="text-[11px] font-normal text-3">{progress}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}


export function DiscoveredCard({
  canvas,
  candidates,
}: {
  canvas: NonNullable<
    SemanticModelingCopilotSession["workbench_state"]["semantic_canvas"]
  >;
  candidates: CopilotCandidateCard[];
}) {
  const total =
    (canvas.objects?.length ?? 0) +
    (canvas.metrics?.length ?? 0) +
    (canvas.dimensions?.length ?? 0) +
    (canvas.bindings?.length ?? 0) +
    (canvas.policies?.length ?? 0);
  return (
    <CardShell
      title="已发现的语义资产"
      icon={Layers3}
      progress={`${total} 项资产 · ${candidates.length} 候选语义资产`}
    >
      <div className="flex flex-col">
        {(canvas.objects ?? []).map((item, idx) => (
          <AssetRow key={`obj-${idx}`} kind="object" icon={Box} item={item} />
        ))}
        {(canvas.metrics ?? []).map((item, idx) => (
          <AssetRow
            key={`metric-${idx}`}
            kind="metric"
            icon={TrendingUp}
            item={item}
          />
        ))}
        {(canvas.dimensions ?? []).map((item, idx) => (
          <AssetRow
            key={`dim-${idx}`}
            kind="dimension"
            icon={Brain}
            item={item}
          />
        ))}
        {(canvas.bindings ?? []).map((item, idx) => (
          <AssetRow
            key={`bind-${idx}`}
            kind="binding"
            icon={GitBranch}
            item={item}
          />
        ))}
        {(canvas.policies ?? []).map((item, idx) => (
          <AssetRow
            key={`policy-${idx}`}
            kind="policy"
            icon={ShieldCheck}
            item={item}
          />
        ))}
        {candidates.map((item, idx) => (
          <AssetRow
            key={`cand-${idx}`}
            kind="candidate"
            icon={Database}
            item={item}
          />
        ))}
      </div>
    </CardShell>
  );
}


export function SourceCandidateCard({
  candidates,
  onConfirm,
  actionsLocked = false,
}: {
  candidates: CopilotSourceCandidate[];
  onConfirm: (candidate: CopilotSourceCandidate) => void;
  actionsLocked?: boolean;
}) {
  return (
    <CardShell
      title="推荐数据来源"
      icon={Database}
      progress={`${candidates.length} 个候选`}
    >
      <div className="flex flex-col">
        {candidates.map((candidate, index) => {
          const name = String(
            candidate.name ??
              candidate.table ??
              candidate.title ??
              `candidate-${index + 1}`,
          );
          const title = String(candidate.title ?? "");
          const confidence = String(
            candidate.confidence ?? confidenceLabel(candidate.score),
          );
          const evidence =
            String(
              candidate.why_selected ?? candidate.why_not_selected ?? "",
            ) ||
            (Array.isArray(candidate.evidence) ? candidate.evidence[0] : "");
          const matched = Array.isArray(candidate.matched_terms)
            ? candidate.matched_terms.slice(0, 3).join(" / ")
            : "";
          const scoreBreakdown = formatScoreBreakdown(
            candidate.score_breakdown,
          );
          const dataAssetEvidence = dataAssetEvidenceForCandidate(candidate);
          return (
            <div
              key={String(candidate.id ?? name)}
              className="border-b px-4 py-3 last:border-b-0"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex items-start gap-3">
                <span
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded"
                  style={{
                    background: "var(--bg-surface-2)",
                    color: "var(--accent)",
                  }}
                >
                  <Database size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-1">
                      {title || name}
                    </div>
                    <Chip
                      tone={
                        confidence === "high" || confidence === "高"
                          ? "success"
                          : "warning"
                      }
                    >
                      {confidence === "high"
                        ? "高置信"
                        : confidence === "medium"
                          ? "中置信"
                          : confidence}
                    </Chip>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11.5px] text-3">
                    {name}
                  </div>
                  <div className="mt-1.5 text-[12px] leading-5 text-3">
                    {evidence ||
                      (matched
                        ? `匹配：${matched}`
                        : "来自已同步 datasource 元数据，不实时连接源库。")}
                  </div>
                  {scoreBreakdown ? (
                    <div className="mt-1 text-[11px] leading-5 text-4">
                      评分明细：{scoreBreakdown}
                    </div>
                  ) : null}
                  {dataAssetEvidence ? (
                    <DataAssetCandidateEvidence evidence={dataAssetEvidence} />
                  ) : null}
                  <div className="mt-2">
                    {actionsLocked ? (
                      <Chip tone="success">
                        {t(
                          "semantic.modelingCopilot.sourceCandidate.confirmed",
                          "来源已确认",
                        )}
                      </Chip>
                    ) : (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => onConfirm(candidate)}
                      >
                        <CheckCircle2 size={12} /> 使用此来源
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </CardShell>
  );
}


export interface DataAssetCandidateEvidenceModel {
  assetType: string;
  qualifiedName: string;
  hasEvidenceBundle: boolean;
  runtimeTruth?: boolean;
  rowCount: string;
  partitionCount: string;
  profileStatus: string;
}


export function DataAssetCandidateEvidence({
  evidence,
}: {
  evidence: DataAssetCandidateEvidenceModel;
}) {
  return (
    <div
      data-testid="data-asset-candidate-evidence"
      className="mt-2 rounded-[8px] border px-3 py-2"
      style={{
        borderColor: "rgba(37,99,235,0.18)",
        background: "rgba(239,246,255,0.48)",
      }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone="accent">{dataAssetTypeLabel(evidence.assetType)}</Chip>
        {evidence.hasEvidenceBundle ? <Chip>来源证据包</Chip> : null}
        {typeof evidence.runtimeTruth === "boolean" ? (
          <Chip tone={evidence.runtimeTruth ? "success" : "warning"}>
            语义中心事实源={evidence.runtimeTruth ? "是" : "否"}
          </Chip>
        ) : null}
      </div>
      {evidence.qualifiedName ? (
        <div className="mt-1.5 break-all text-[11.5px] text-3">
          资产引用：
          <code className="font-mono text-1">{evidence.qualifiedName}</code>
        </div>
      ) : null}
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-3">
        {evidence.rowCount ? <span>行数：{evidence.rowCount}</span> : null}
        {evidence.partitionCount ? (
          <span>分区数：{evidence.partitionCount}</span>
        ) : null}
        {evidence.profileStatus ? (
          <span>画像状态：{evidence.profileStatus}</span>
        ) : null}
      </div>
    </div>
  );
}


export function dataAssetEvidenceForCandidate(
  candidate: CopilotSourceCandidate,
): DataAssetCandidateEvidenceModel | null {
  const assetRef = isRecord(candidate.asset_ref) ? candidate.asset_ref : null;
  const evidenceBundle = isRecord(candidate.evidence_bundle)
    ? candidate.evidence_bundle
    : null;
  const profileSummary = isRecord(candidate.profile_summary)
    ? candidate.profile_summary
    : null;
  const sampleProfile = isRecord(evidenceBundle?.sample_profile)
    ? evidenceBundle.sample_profile
    : profileSummary;
  const assetType = stringValue(candidate.asset_type);
  const qualifiedName =
    stringValue(assetRef?.qualified_name) ||
    stringValue(candidate.qualified_name);
  const hasDataAssetEvidence =
    assetType === "data_asset_table" ||
    Boolean(assetRef || evidenceBundle || profileSummary);
  if (!hasDataAssetEvidence) return null;

  const runtimeTruth =
    typeof evidenceBundle?.runtime_truth === "boolean"
      ? evidenceBundle.runtime_truth
      : undefined;
  return {
    assetType: assetType || "data_asset_table",
    qualifiedName,
    hasEvidenceBundle: Boolean(evidenceBundle),
    runtimeTruth,
    rowCount: formatProfileNumber(sampleProfile?.row_count),
    partitionCount: formatProfileNumber(sampleProfile?.partition_count),
    profileStatus: stringValue(sampleProfile?.profile_status),
  };
}

export function dataAssetTypeLabel(assetType: string): string {
  switch (assetType) {
    case "data_asset_table":
    case "table":
      return "数据资产表";
    case "field":
      return "字段资产";
    case "dataset":
      return "数据集";
    case "cube":
      return "Cube";
    case "view":
      return "视图";
    default:
      return "数据资产";
  }
}


export function formatProfileNumber(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.NumberFormat("zh-CN").format(value);
  }
  if (typeof value === "string" && value.trim()) return value.trim();
  return "";
}


export function formatScoreBreakdown(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  return Object.entries(value as Record<string, unknown>)
    .map(([key, raw]) => {
      const number = Number(raw);
      if (!Number.isFinite(number) || number === 0) return "";
      return `${key} ${number > 0 ? "+" : ""}${Number(number.toFixed(4))}`;
    })
    .filter(Boolean)
    .join(" · ");
}


export function AssetRow({
  kind,
  icon: Icon,
  item,
}: {
  kind: "object" | "metric" | "dimension" | "binding" | "policy" | "candidate";
  icon: ElementType;
  item: Record<string, unknown>;
}) {
  const name = String(
    item.title ?? item.name ?? item.metric ?? item.measure_ref ?? "",
  );
  const sub = String(item.measure_ref ?? item.sub ?? item.name ?? "");
  const status = String(
    item.status ?? item.binding_status ?? item.visibility ?? "",
  );
  return (
    <div
      className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0"
      style={{ borderColor: "var(--border)" }}
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded"
        style={{
          background: "var(--bg-surface-2)",
          color: kindAccent(kind),
        }}
      >
        <Icon size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-1">{name}</div>
        {sub && sub !== name ? (
          <div className="truncate font-mono text-[11.5px] text-3">{sub}</div>
        ) : null}
      </div>
      {status ? <Chip tone={statusTone(status)}>{status}</Chip> : null}
    </div>
  );
}


export function kindAccent(
  kind: "object" | "metric" | "dimension" | "binding" | "policy" | "candidate",
): string {
  switch (kind) {
    case "object":
      return "var(--accent)";
    case "metric":
      return "var(--success)";
    case "dimension":
      return "var(--violet, #6D28D9)";
    case "binding":
      return "var(--warning)";
    case "policy":
      return "var(--danger)";
    default:
      return "var(--text-3)";
  }
}


export function ConfirmationCard({
  confirmations,
  onConfirm,
  onOverride,
  onExplain,
}: {
  confirmations: CopilotConfirmation[];
  onConfirm: (confirmation: CopilotConfirmation) => void;
  onOverride: (confirmation: CopilotConfirmation) => void;
  onExplain: (confirmation: CopilotConfirmation) => void;
}) {
  const remaining = confirmations.filter((c) => !c.confirmed).length;
  return (
    <CardShell
      title="需要你确认"
      icon={ListChecks}
      progress={
        remaining > 0
          ? `请确认 ${remaining} 项口径`
          : `${confirmations.length}/${confirmations.length} 已确认`
      }
    >
      <div className="flex flex-col">
        {confirmations.map((c) => (
          <div
            key={c.id}
            className="border-b px-4 py-3 last:border-b-0"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="mb-1 flex items-center gap-2 text-[14px] font-medium text-1">
              {c.confirmed ? (
                <CheckCircle2 size={14} style={{ color: "var(--success)" }} />
              ) : (
                <HelpCircle size={14} style={{ color: "var(--warning)" }} />
              )}
              <span className="min-w-0 flex-1 truncate">
                {c.title ?? c.question ?? c.id}
              </span>
              {c.blocking ? (
                <Chip tone="warning">阻断项</Chip>
              ) : (
                <Chip>可选</Chip>
              )}
            </div>
            {c.confirmed ? (
              <div className="text-[12.5px] text-success">
                已确认：
                <code className="ml-1">
                  {String(c.value ?? c.recommended_value ?? "-")}
                </code>
              </div>
            ) : (
              <>
                {c.explain ? (
                  <div className="mb-2 text-[12.5px] leading-5 text-2">
                    {c.explain}
                  </div>
                ) : null}
                <div
                  className="mb-2 inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[12px] text-2"
                  style={{ background: "var(--bg-surface-2)" }}
                >
                  <Sparkles size={12} />
                  <span>
                    推荐 <code>{String(c.recommended_value ?? "-")}</code>
                  </span>
                  {c.recommended_reason ? (
                    <>
                      <span className="text-4">·</span>
                      <span className="text-3">{c.recommended_reason}</span>
                    </>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => onConfirm(c)}
                  >
                    <CheckCircle2 size={12} /> 使用推荐
                  </Button>
                  <Button size="sm" onClick={() => onOverride(c)}>
                    <Edit3 size={12} /> 换一个
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onExplain(c)}
                  >
                    <MessageSquareText size={12} /> 让我说说
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </CardShell>
  );
}


export function SandboxCard({
  preview,
  workbenchState,
}: {
  preview: CopilotSandboxPreview;
  workbenchState?: SemanticModelingCopilotSession["workbench_state"];
}) {
  const friendly = sandboxFriendlyMessage(preview, workbenchState);
  const normalizedFriendly = normalizePreviewFriendlyCopy(friendly);
  const headTone: "success" | "warning" | "danger" =
    friendly.tone === "danger"
      ? "danger"
      : friendly.tone === "warning"
        ? "warning"
        : "success";
  return (
    <CardShell
      title="可用性预演结果"
      icon={FlaskConical}
      progress={
        <Chip tone={headTone}>
          {friendly.tone === "success"
            ? "通过"
            : friendly.tone === "warning"
              ? "阻塞"
              : "失败"}
        </Chip>
      }
    >
      <div className="flex flex-col gap-2 px-4 py-3 text-[13px] leading-6 text-1">
        <div className="font-medium">{normalizedFriendly.headline}</div>
        {normalizedFriendly.hint ? (
          <div className="text-3 text-[12.5px] leading-5">
            {normalizedFriendly.hint}
          </div>
        ) : null}
        {preview.sample_questions && preview.sample_questions.length > 0 ? (
          <div className="mt-1 text-[12px] text-3">
            示例问题：{preview.sample_questions.slice(0, 3).join("、")}
          </div>
        ) : null}
      </div>
    </CardShell>
  );
}


export function SavedCard({
  proposalId,
  proposalSummary,
  nextSteps: _nextSteps,
  published,
  publishResult,
  onReleasePreview,
  onPublish,
  isReleasePreviewing,
  isPublishing,
  isPublished,
  workbenchState,
}: {
  proposalId: string;
  proposalSummary: SemanticModelingCopilotSession["workbench_state"]["proposal_summary"];
  nextSteps: SemanticModelingCopilotSession["workbench_state"]["next_steps"];
  published: boolean;
  publishResult?: Record<string, unknown>;
  onReleasePreview: () => void;
  onPublish: () => void;
  isReleasePreviewing: boolean;
  isPublishing: boolean;
  isPublished: boolean;
  workbenchState?: SemanticModelingCopilotSession["workbench_state"];
}) {
  const [showSpec, setShowSpec] = useState(false);
  const specYaml = useMemo(
    () =>
      dumpCubeYaml(
        (workbenchState?.raw_spec ?? proposalSummary?.spec ?? {}) as Record<
          string,
          unknown
        >,
      ),
    [workbenchState?.raw_spec, proposalSummary?.spec],
  );
  const publishGuard = getSemanticCenterPublishGuardFromState({
    workbenchState,
    hasProposal: Boolean(proposalId),
    published: published || isPublished,
  });
  const releasePreview = extractReleasePreview(workbenchState);
  const needsReleasePreview =
    !publishGuard.canPublish && publishGuard.reason.includes("发布预演");

  if (published || isPublished) {
    const cubeName = (
      publishResult?.details as Record<string, unknown> | undefined
    )?.cube;
    const ontologyName = (
      publishResult?.details as Record<string, unknown> | undefined
    )?.ontology;
    return (
      <CardShell
        title="语义已发布"
        icon={Rocket}
        progress={<Chip tone="success">已上线</Chip>}
      >
        <div className="flex flex-col gap-2 px-4 py-3 text-[13px] leading-6">
          <div className="font-medium text-1">
            语义资产已发布到语义中心。Data
            Agent、BI、数据分析等消费者可以基于同一发布快照做可用性验证。
          </div>
          <div className="text-success text-[12.5px] font-semibold">
            已发布 · 消费者可验证
          </div>
          <div className="flex flex-col gap-1 text-3 text-[12.5px]">
            <KvRow k="待发布资产" v={<code>{proposalId}</code>} />
            {cubeName ? (
              <KvRow k="指标资产" v={summarizePublishTarget(cubeName)} />
            ) : null}
            {ontologyName ? (
              <KvRow k="对象资产" v={summarizePublishTarget(ontologyName)} />
            ) : null}
          </div>
        </div>
      </CardShell>
    );
  }

  return (
    <CardShell
      title="语义已应用 · 待发布"
      icon={CheckCircle2}
      progress={<Chip tone="accent">待发布</Chip>}
    >
      <div className="flex flex-col gap-2 px-4 py-3 text-[13px] leading-6">
        <div className="text-1">
          待发布资产 <code>{proposalId}</code>{" "}
          已保存，等待发布预演与最终确认。下一步「
          {BUILDER_ACTION_COPY.publishButton}
          」会把语义资产写入语义中心发布快照；如发现问题，可继续在对话里修改。
        </div>
        <button
          type="button"
          onClick={() => setShowSpec((v) => !v)}
          className="inline-flex items-center gap-1 self-start text-[12px] text-3 hover:text-1"
        >
          <ChevronRight
            size={12}
            style={{
              transition: "transform 150ms",
              transform: showSpec ? "rotate(90deg)" : "rotate(0deg)",
            }}
          />
          {showSpec ? "收起最终语义配置" : "展开最终语义配置（YAML）"}
        </button>
        {showSpec ? (
          <pre
            className="max-h-[360px] overflow-auto rounded border p-3 text-[12px] leading-5 text-2 scroll-thin"
            style={{
              background: "var(--bg-surface-2)",
              borderColor: "var(--border)",
            }}
          >
            <code>{specYaml || "（语义配置为空）"}</code>
          </pre>
        ) : null}
        {releasePreview ? <ReleasePreviewPanel preview={releasePreview} /> : null}
        <div className="flex items-center gap-2 pt-1">
          {needsReleasePreview ? (
            <Button
              data-testid="saved-card-release-preview"
              size="sm"
              variant="default"
              onClick={onReleasePreview}
              loading={isReleasePreviewing}
            >
              <FlaskConical size={12} /> 运行发布预演
            </Button>
          ) : null}
          <Can action="semantic.write">
            <Button
              size="sm"
              variant="primary"
              onClick={onPublish}
              loading={isPublishing}
              disabled={!publishGuard.canPublish}
              title={publishGuard.canPublish ? undefined : publishGuard.reason}
            >
              <Rocket size={12} /> {BUILDER_ACTION_COPY.publishButton}
            </Button>
          </Can>
          <span className="text-[11.5px] text-3">
            {publishGuard.canPublish
              ? "发布后生成语义中心发布快照；Data Agent、BI、数据分析等消费者按同一快照验证。"
              : publishGuard.reason}
          </span>
        </div>
      </div>
    </CardShell>
  );
}


export function summarizePublishTarget(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const name = String(obj.name ?? obj.id ?? "");
    const status = obj.status ? `（${obj.status}）` : "";
    return `${name}${status}`;
  }
  return String(value ?? "");
}


export function CubeDraftCard({
  cube,
  candidateTable,
  accepted,
  onAccept,
  onSwapSource,
  onOpenWorkbench,
  acceptanceMode = "explicit",
  changeActionsLocked = false,
}: {
  cube: Record<string, unknown>;
  candidateTable?: string;
  accepted: boolean;
  onAccept: () => void;
  onSwapSource: () => void;
  onOpenWorkbench?: () => void;
  acceptanceMode?: CubeDraftAcceptanceMode;
  changeActionsLocked?: boolean;
}) {
  const [showYaml, setShowYaml] = useState(false);
  const yamlText = useMemo(() => dumpCubeYaml(cube), [cube]);
  const cubeName = String(cube.name ?? "(未命名语义资产)");
  const source = String(
    cube.source ?? cube.table ?? candidateTable ?? "未指定",
  );
  const dimensions = collectionCount(cube.dimensions);
  const measures = collectionCount(cube.measures);
  const candidateLocked = acceptanceMode === "candidate_locked";
  const showAcceptAction = !accepted && !candidateLocked;
  const showSwapSourceAction = !accepted && !changeActionsLocked;

  return (
    <CardShell
      title={accepted ? "语义草稿（已接受）" : "建议新建语义资产"}
      icon={FileCode2}
      progress={
        <Chip tone={accepted || candidateLocked ? "success" : "warning"}>
          {accepted
            ? "已锁定"
            : candidateLocked
              ? t(
                  "semantic.modelingCopilot.cubeDraft.candidateConfirmed",
                  "候选已确认",
                )
              : "待接受"}
        </Chip>
      }
    >
      <div className="flex flex-col gap-2 px-4 py-3 text-[13px] leading-6">
        {!accepted ? (
          <div className="text-2 text-[12.5px]">
            {candidateLocked ? (
              changeActionsLocked ? (
                t(
                  "semantic.modelingCopilot.cubeDraft.historyOnly",
                  "已进入发布流程，历史语义草稿仅作为本次候选建设记录保留。",
                )
              ) : (
                t(
                  "semantic.modelingCopilot.cubeDraft.batchReady",
                  "批量候选已确认来源，当前草稿可直接「{action}」生成待发布语义资产；需要调整时在右侧编辑语义配置。",
                  { action: BUILDER_ACTION_COPY.saveButton },
                )
              )
            ) : (
              <>
                没有匹配到现成的语义资产，系统基于业务表为你生成了一份语义草稿。检查无误后可直接「
                {BUILDER_ACTION_COPY.saveButton}
                」生成待发布语义资产；也可以先接受草稿锁定当前语义配置。
              </>
            )}
          </div>
        ) : null}
        <div className="flex flex-col gap-1 text-3 text-[12.5px]">
          <KvRow k="语义资产名称" v={<code>{cubeName}</code>} />
          <KvRow k="来源表" v={<code>{source}</code>} />
          <KvRow k="规模" v={`${dimensions} 维度 · ${measures} 度量`} />
        </div>
        <button
          type="button"
          onClick={() => setShowYaml((v) => !v)}
          className="inline-flex items-center gap-1 self-start text-[12px] text-3 hover:text-1"
        >
          <ChevronRight
            size={12}
            style={{
              transition: "transform 150ms",
              transform: showYaml ? "rotate(90deg)" : "rotate(0deg)",
            }}
          />
          {showYaml ? "收起 YAML" : "展开完整 YAML"}
        </button>
        {showYaml ? (
          <pre
            className="max-h-[360px] overflow-auto rounded border p-3 text-[12px] leading-5 text-2 scroll-thin"
            style={{
              background: "var(--bg-surface-2)",
              borderColor: "var(--border)",
            }}
          >
            <code>{yamlText || "（草稿为空）"}</code>
          </pre>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {showAcceptAction ? (
            <Button size="sm" variant="primary" onClick={onAccept}>
              <CheckCircle2 size={12} /> 接受草稿
            </Button>
          ) : null}
          {onOpenWorkbench ? (
            <Button size="sm" variant="default" onClick={onOpenWorkbench}>
              <Edit3 size={12} /> 在右侧编辑语义配置
            </Button>
          ) : null}
          {showSwapSourceAction ? (
            <Button size="sm" variant="default" onClick={onSwapSource}>
              <Edit3 size={12} /> 换一张源表
            </Button>
          ) : null}
          {!accepted ? (
            <span className="text-[11.5px] text-3">
              {candidateLocked
                ? changeActionsLocked
                  ? t(
                      "semantic.modelingCopilot.cubeDraft.workflowLocked",
                      "当前语义资产已进入后续流程。",
                    )
                  : t(
                      "semantic.modelingCopilot.cubeDraft.mainActionAppliesCandidate",
                      "主按钮会应用当前候选草稿。",
                    )
                : "在工作台直接改字段或换源表，语义配置自动校验；主按钮会应用当前草稿。"}
            </span>
          ) : null}
        </div>
      </div>
    </CardShell>
  );
}


export function collectionCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (isRecord(value)) return Object.keys(value).length;
  return 0;
}


export function KvRow({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-1">
      <span className="w-[88px] shrink-0 text-3">{k}</span>
      <span className="min-w-0 flex-1 break-all text-1">{v}</span>
    </div>
  );
}


export function EvidenceRow({ item }: { item: CopilotEvidenceItem }) {
  const lvl = evidenceLevel(item);
  const colorMap: Record<typeof lvl, string> = {
    P0: "var(--success)",
    P1: "var(--accent)",
    P2: "var(--warning)",
    P3: "var(--danger)",
  };
  const text = String(
    item.extracted_claim ?? item.text ?? item.source_uri ?? "",
  );
  return (
    <div
      className="flex items-start gap-2 rounded-r px-3 py-2 text-[12px] text-2"
      style={{
        background: "var(--bg-surface-2)",
        borderLeft: `2px solid ${colorMap[lvl]}`,
      }}
    >
      <span className="w-[22px] shrink-0 font-mono text-[10px] font-semibold text-3">
        {lvl}
      </span>
      <span className="min-w-0 flex-1">{text}</span>
    </div>
  );
}
