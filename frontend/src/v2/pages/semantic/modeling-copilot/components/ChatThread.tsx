// frontend/src/v2/pages/semantic/modeling-copilot/components/ChatThread.tsx
/* eslint-disable react-refresh/only-export-components -- 组件与同区块 helper 同文件导出，沿用项目共享约定。 */
//
// 工作台对话流区块（消息线程 / 输入 Composer / 空态与引导）。

import {
  useMemo,
  type ElementType,
  type KeyboardEvent,
  type RefObject,
} from "react";
import {
  ArrowUp,
  Bot,
  ChevronRight,
  AlertCircle,
  Edit3,
  FileSearch,
  FlaskConical,
  Layers3,
  Save,
  ShieldCheck,
  Sparkles,
  Table2,
  TrendingUp,
} from "lucide-react";
import {
  Button,
  Chip,
  Textarea,
  type ChipTone,
} from "@v2/components/ui";
import {
  t,
} from "@v2/i18n";
import type {
  CopilotConfirmation,
  CopilotEvidenceItem,
  CopilotSourceCandidate,
  SemanticModelingCopilotMessage,
  SemanticModelingCopilotSession,
} from "@v2/api/semantic";
import {
  buildAssistantCards,
  entryTypeLabel,
  extractCubeDraft,
  type AssistantCard,
} from "@v2/lib/copilot";
import {
  BUILDER_ACTION_COPY,
  BUILDER_EMPTY_STATE,
  BUILDER_EXAMPLES,
} from "../builderCopy";
import {
  batchModelingRiskLabel,
  batchModelingRiskTone,
} from "../batchModeling";
import type {
  WorkbenchCandidateState,
} from "../workbenchContext";
import {
  CardRenderer,
  EvidenceRow,
} from "./ChatCards";
import {
  ChatFlowNudgeModel,
  CopilotActionError,
  stringValue,
} from "../modelingAgentModel";
import {
  ReviewMetaItem,
} from "./ArtifactPanel";
import {
  type CubeDraftAcceptanceMode,
} from "../modelingAgentModel";


export const EXAMPLES: Array<{ icon: ElementType; title: string; sub: string }> = [
  { icon: TrendingUp, ...BUILDER_EXAMPLES[0] },
  { icon: Table2, ...BUILDER_EXAMPLES[1] },
  { icon: AlertCircle, ...BUILDER_EXAMPLES[2] },
];


export function Thread({
  session,
  evidenceOpen,
  onToggleEvidence,
  onConfirm,
  onOverride,
  onExplain,
  onConfirmSourceCandidate,
  onAcceptCubeDraft,
  onSwapCubeSource,
  onOpenWorkbench,
  onReleasePreview,
  onPublish,
  isPending,
  isReleasePreviewing,
  isPublishing,
  isPublished,
  sourceCandidateActionsLocked,
  cubeDraftAcceptanceMode,
  cubeDraftChangeActionsLocked,
}: {
  session: SemanticModelingCopilotSession;
  evidenceOpen: Record<string, boolean>;
  onToggleEvidence: (key: string) => void;
  onConfirm: (confirmation: CopilotConfirmation) => void;
  onOverride: (confirmation: CopilotConfirmation) => void;
  onExplain: (confirmation: CopilotConfirmation) => void;
  onConfirmSourceCandidate: (candidate: CopilotSourceCandidate) => void;
  onAcceptCubeDraft: () => void;
  onSwapCubeSource: (currentTable?: string) => void;
  onOpenWorkbench: () => void;
  onReleasePreview: () => void;
  onPublish: () => void;
  isPending: boolean;
  isReleasePreviewing: boolean;
  isPublishing: boolean;
  isPublished: boolean;
  sourceCandidateActionsLocked: boolean;
  cubeDraftAcceptanceMode: CubeDraftAcceptanceMode;
  cubeDraftChangeActionsLocked: boolean;
}) {
  const conversation = session.conversation ?? [];
  const cards = useMemo(() => buildAssistantCards(session), [session]);
  const evidence = (session.workbench_state?.evidence_summary ??
    []) as CopilotEvidenceItem[];

  const lastAssistantIndex = (() => {
    for (let i = conversation.length - 1; i >= 0; i -= 1) {
      if (conversation[i].role === "assistant") return i;
    }
    return -1;
  })();

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-7 px-5 py-7">
      {conversation.map((turn, idx) => (
        <Turn
          key={`${turn.role}-${idx}`}
          turn={turn}
          isLastAssistant={
            idx === lastAssistantIndex && turn.role === "assistant"
          }
          cards={
            idx === lastAssistantIndex && turn.role === "assistant" ? cards : []
          }
          evidence={
            idx === lastAssistantIndex && turn.role === "assistant"
              ? evidence
              : []
          }
          evidenceOpen={evidenceOpen[`${session.id}:${idx}`] ?? false}
          onToggleEvidence={() => onToggleEvidence(`${session.id}:${idx}`)}
          onConfirm={onConfirm}
          onOverride={onOverride}
          onExplain={onExplain}
          onConfirmSourceCandidate={onConfirmSourceCandidate}
          onAcceptCubeDraft={onAcceptCubeDraft}
          onSwapCubeSource={onSwapCubeSource}
          onOpenWorkbench={onOpenWorkbench}
          onReleasePreview={onReleasePreview}
          onPublish={onPublish}
          workbenchState={session.workbench_state}
          isReleasePreviewing={isReleasePreviewing}
          isPublishing={isPublishing}
          isPublished={isPublished}
          sourceCandidateActionsLocked={sourceCandidateActionsLocked}
          cubeDraftAcceptanceMode={cubeDraftAcceptanceMode}
          cubeDraftChangeActionsLocked={cubeDraftChangeActionsLocked}
        />
      ))}
      {isPending ? <TypingTurn /> : null}
    </div>
  );
}


export function Turn({
  turn,
  isLastAssistant,
  cards,
  evidence,
  evidenceOpen,
  onToggleEvidence,
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
  turn: SemanticModelingCopilotMessage;
  isLastAssistant: boolean;
  cards: AssistantCard[];
  evidence: CopilotEvidenceItem[];
  evidenceOpen: boolean;
  onToggleEvidence: () => void;
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
  const isUser = turn.role === "user";
  return (
    <div className="flex items-start gap-3">
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded text-[11px] font-bold text-white"
        style={{
          background: isUser
            ? "var(--violet, #6D28D9)"
            : "linear-gradient(135deg, var(--accent), #7B5BFF)",
        }}
      >
        {isUser ? "我" : "C³"}
      </span>
      <div className="min-w-0 flex-1">
        {!isUser ? (
          <div className="mb-1 text-[12px] font-semibold text-1">
            AI 建模助手
          </div>
        ) : null}
        <div className="whitespace-pre-wrap text-[14px] leading-6 text-1">
          {turn.content}
        </div>
        {isLastAssistant && cards.length > 0 ? (
          <div className="mt-3 flex flex-col gap-3">
            {cards.map((card) => (
              <CardRenderer
                key={`${card.type}`}
                card={card}
                onConfirm={onConfirm}
                onOverride={onOverride}
                onExplain={onExplain}
                onConfirmSourceCandidate={onConfirmSourceCandidate}
                onAcceptCubeDraft={onAcceptCubeDraft}
                onSwapCubeSource={onSwapCubeSource}
                onOpenWorkbench={onOpenWorkbench}
                onReleasePreview={onReleasePreview}
                onPublish={onPublish}
                workbenchState={workbenchState}
                isReleasePreviewing={isReleasePreviewing}
                isPublishing={isPublishing}
                isPublished={isPublished}
                sourceCandidateActionsLocked={sourceCandidateActionsLocked}
                cubeDraftAcceptanceMode={cubeDraftAcceptanceMode}
                cubeDraftChangeActionsLocked={cubeDraftChangeActionsLocked}
              />
            ))}
          </div>
        ) : null}
        {isLastAssistant && evidence.length > 0 ? (
          <div className="mt-3">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed px-2.5 py-1 text-[11px] text-3 transition hover:border-[var(--border-strong)] hover:text-1"
              style={{ borderColor: "var(--border)" }}
              onClick={onToggleEvidence}
            >
              <FileSearch size={12} /> 我的判断依据
              <Chip>{String(evidence.length)}</Chip>
              <ChevronRight
                size={12}
                style={{
                  transition: "transform 150ms",
                  transform: evidenceOpen ? "rotate(90deg)" : "rotate(0deg)",
                }}
              />
            </button>
            {evidenceOpen ? (
              <div className="mt-2 flex flex-col gap-1.5">
                {evidence.map((item, idx) => (
                  <EvidenceRow key={item.id ?? idx} item={item} />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}


export function TypingTurn() {
  return (
    <div className="flex items-start gap-3">
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded text-[11px] font-bold text-white"
        style={{
          background: "linear-gradient(135deg, var(--accent), #7B5BFF)",
        }}
      >
        C³
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 text-[12px] font-semibold text-1">AI 建模助手</div>
        <div className="inline-flex items-center gap-1 py-1 text-3">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--text-3)]" />
          <span
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--text-3)]"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--text-3)]"
            style={{ animationDelay: "300ms" }}
          />
        </div>
      </div>
    </div>
  );
}

// ── 卡片：discovered / confirmation / sandbox / saved ────────────────────


export function EmptyState({
  workbenchContext,
  onPickExample,
}: {
  workbenchContext?: WorkbenchCandidateState | null;
  onPickExample: (text: string) => void;
}) {
  if (workbenchContext) {
    return (
      <WorkbenchCandidateEmptyState
        workbenchContext={workbenchContext}
        onPickExample={onPickExample}
      />
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-5 text-center">
      <div
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-[14px] text-[22px] font-bold text-white"
        style={{
          background: "linear-gradient(135deg, var(--accent), #7B5BFF)",
        }}
      >
        C³
      </div>
      <h2 className="text-[22px] font-semibold text-1">
        {BUILDER_EMPTY_STATE.title}
      </h2>
      <p className="mt-1.5 max-w-[520px] text-[13px] leading-6 text-3">
        {BUILDER_EMPTY_STATE.subtitle}
      </p>
      <div className="mt-6 flex w-full max-w-[520px] flex-col gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.title}
            type="button"
            onClick={() => onPickExample(ex.title)}
            className="flex items-start gap-3 rounded-[10px] border px-3.5 py-3 text-left transition hover:border-[color:var(--accent)] hover:bg-[color:var(--accent-soft)]"
            style={{
              background: "var(--bg-surface)",
              borderColor: "var(--border)",
            }}
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded"
              style={{
                background: "var(--bg-surface-2)",
                color: "var(--text-3)",
              }}
            >
              <ex.icon size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-1">{ex.title}</div>
              <div className="text-[11.5px] text-3">{ex.sub}</div>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}


export function WorkbenchCandidateEmptyState({
  workbenchContext,
  onPickExample,
}: {
  workbenchContext: WorkbenchCandidateState;
  onPickExample: (text: string) => void;
}) {
  const examples = examplesForWorkbenchContext(workbenchContext);
  const evidence = workbenchContext.evidence.slice(0, 3);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[920px] flex-col justify-center px-5 py-8 text-left">
      <section
        className="rounded-[8px] border bg-[var(--bg-surface)] p-5"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="m-0 text-[12px] font-semibold uppercase text-3">
              资产审阅待启动
            </p>
            <h2 className="m-0 mt-1 break-words text-[20px] font-semibold leading-tight text-1">
              先确认字段证据，再生成 Cube 与本体草案
            </h2>
            <p className="m-0 mt-2 max-w-[660px] text-[13px] leading-6 text-2">
              候选资产已从冷启动队列带入。你可以直接按下面的审阅步骤推进；
              AI 只作为辅助建议，不改变发布目标和语义中心门禁。
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            <Chip tone={batchModelingRiskTone(workbenchContext.risk) as ChipTone}>
              {batchModelingRiskLabel(workbenchContext.risk)}
            </Chip>
            <Chip tone="accent">语义中心</Chip>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <ReviewMetaItem label="候选资产" value={workbenchContext.candidateTitle} />
          <ReviewMetaItem label="源表" value={workbenchContext.source} />
          <ReviewMetaItem label="粒度" value={workbenchContext.grain} />
        </div>

        {evidence.length ? (
          <div
            className="mt-4 rounded-[8px] border px-3 py-2"
            style={{
              borderColor: "var(--border)",
              background: "var(--bg-surface-2)",
            }}
          >
            <div className="text-[12px] font-semibold text-1">候选证据</div>
            <ul className="m-0 mt-2 space-y-1 pl-4 text-[12px] leading-5 text-2">
              {evidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {examples.map((ex) => (
            <button
              key={ex.title}
              type="button"
              onClick={() => onPickExample(ex.title)}
              className="flex min-h-[112px] items-start gap-3 rounded-[8px] border px-3.5 py-3 text-left transition hover:border-[color:var(--accent)] hover:bg-[color:var(--accent-soft)]"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border)",
              }}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded"
                style={{
                  background: "var(--bg-surface-2)",
                  color: "var(--text-3)",
                }}
              >
                <ex.icon size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-1">{ex.title}</div>
                <div className="text-[11.5px] text-3">{ex.sub}</div>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}


export function examplesForWorkbenchContext(
  context: WorkbenchCandidateState,
): Array<{ icon: ElementType; title: string; sub: string }> {
  const title =
    context.candidateTitle ||
    t("semantic.modelingWorkbench.empty.candidate", "候选语义资产");
  const source =
    context.source ||
    t("semantic.modelingWorkbench.empty.source", "待确认源表");
  const grain =
    context.grain ||
    t("semantic.modelingWorkbench.empty.grain", "待确认粒度");
  return [
    {
      icon: Table2,
      title: t(
        "semantic.modelingWorkbench.empty.sourceEvidence",
        "确认 {source} 的字段证据",
        { source },
      ),
      sub: `${title} · ${grain}`,
    },
    {
      icon: Layers3,
      title: t(
        "semantic.modelingWorkbench.empty.generateDraft",
        "生成 {title} 的 Cube 与本体草案",
        { title },
      ),
      sub: t(
        "semantic.modelingWorkbench.empty.fromPackage",
        "从候选资产包进入语义建设",
      ),
    },
    {
      icon: ShieldCheck,
      title: t(
        "semantic.modelingWorkbench.empty.releaseGate",
        "检查 {title} 的发布门禁",
        { title },
      ),
      sub: t(
        "semantic.modelingWorkbench.empty.semanticCenter",
        "发布目标是语义中心，不直接发布给单一消费者",
      ),
    },
  ];
}

// ── 建设主流程动作：预演 / 应用只跟随主链路出现 ─────────────────────────────


export function ChatFlowNudge({
  nudge,
  onUseTemplate,
}: {
  nudge: ChatFlowNudgeModel;
  onUseTemplate: () => void;
}) {
  return (
    <section
      data-testid="chat-flow-nudge"
      className="flex w-full items-center justify-between gap-3 rounded-[10px] border px-3 py-2.5"
      style={{
        borderColor: "rgba(245,158,11,0.26)",
        background: "rgba(255,251,235,0.72)",
      }}
      aria-label="当前建模下一步"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="rounded-[6px] px-1.5 py-0.5 text-[11px] font-semibold"
            style={{
              background: "var(--warning-soft)",
              color: "var(--warning)",
            }}
          >
            {nudge.statusLabel}
          </span>
          <div className="text-[13px] font-semibold text-1">{nudge.title}</div>
        </div>
        <div className="mt-0.5 text-[12px] leading-5 text-3">
          {nudge.detail}
        </div>
      </div>
      <Button size="sm" variant="default" onClick={onUseTemplate}>
        <Sparkles size={12} /> {nudge.actionLabel}
      </Button>
    </section>
  );
}


export function ChatNextActionCard({
  session,
  showSandbox,
  showApply,
  isSandboxing,
  isApplying,
  isPublished,
  cubeDraftPending,
  onSandbox,
  onApply,
}: {
  session: SemanticModelingCopilotSession;
  showSandbox: boolean;
  showApply: boolean;
  isSandboxing: boolean;
  isApplying: boolean;
  isPublished: boolean;
  cubeDraftPending: boolean;
  onSandbox: () => void | Promise<void>;
  onApply: () => void | Promise<void>;
}) {
  if (isPublished || (!showSandbox && !showApply)) return null;
  const rawSpec = (session.workbench_state?.raw_spec ?? {}) as Record<
    string,
    unknown
  >;
  const cube =
    extractCubeDraft(session.workbench_state) ??
    (rawSpec.cube as Record<string, unknown> | undefined) ??
    {};
  const cubeName = stringValue(cube.name) || "当前语义配置";
  const title = showApply
    ? BUILDER_ACTION_COPY.saveTitle
    : BUILDER_ACTION_COPY.sandboxTitle;
  const detail = showApply
    ? cubeDraftPending
      ? "会把当前语义草稿保存为待发布语义资产；保存前不会进入语义中心发布快照。"
      : "会把当前语义草案保存为待发布语义资产；下一步再发布到语义中心。"
    : "预演只校验草稿能否支撑样例问题，不写入语义中心发布快照。";

  return (
    <div
      data-testid="chat-next-action"
      className="flex w-full items-center justify-between gap-3 rounded-[10px] border px-3 py-2.5"
      style={{
        borderColor: "var(--border)",
        background: "var(--bg-surface-2)",
      }}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[13px] font-semibold text-1">{title}</div>
          <Chip tone={showApply ? "accent" : "warning"}>{cubeName}</Chip>
        </div>
        <div className="mt-1 text-[12px] leading-5 text-3">{detail}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {showSandbox ? (
          <Button
            size="sm"
            variant="default"
            onClick={() => void onSandbox()}
            loading={isSandboxing}
          >
            <FlaskConical size={13} /> {BUILDER_ACTION_COPY.sandboxButton}
          </Button>
        ) : null}
        {showApply ? (
          <Button
            size="sm"
            variant="primary"
            onClick={() => void onApply()}
            loading={isApplying}
          >
            <Save size={13} /> {BUILDER_ACTION_COPY.saveButton}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ── Composer：textarea + 发送 ────────────────────────────────────────────


export function CopilotActionErrorCard({
  error,
  onOpenSpec,
  onDismiss,
}: {
  error: CopilotActionError;
  onOpenSpec: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      data-testid="copilot-action-error"
      role="alert"
      className="flex w-full items-start gap-2.5 rounded-[10px] border px-3 py-2.5"
      style={{
        borderColor: "rgba(220,38,38,0.28)",
        background: "rgba(254,242,242,0.72)",
      }}
    >
      <AlertCircle
        size={15}
        className="mt-0.5 shrink-0 text-danger"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[13px] font-semibold text-1">{error.title}</div>
          <Chip tone="danger">需要处理</Chip>
        </div>
        <div className="mt-1 text-[12.5px] leading-5 text-2">
          {error.message}
        </div>
        {error.detail ? (
          <div className="mt-1 text-[11.5px] leading-5 text-3">
            {error.detail}
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {error.action === "spec" ? (
            <Button size="sm" variant="default" onClick={onOpenSpec}>
              <Edit3 size={12} /> 打开语义配置
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            知道了
          </Button>
        </div>
      </div>
    </div>
  );
}


export function Composer({
  inputRef,
  draft,
  onChange,
  onSend,
  canSend,
  isSending,
  totalAssets,
  hasSession,
  entryType,
  progressLabel,
  localError,
}: {
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  draft: string;
  onChange: (text: string) => void;
  onSend: () => void | Promise<void>;
  canSend: boolean;
  isSending: boolean;
  totalAssets: number;
  hasSession: boolean;
  entryType?: string;
  progressLabel: string;
  localError?: string;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void onSend();
    }
  };
  return (
    <div
      className="shrink-0 border-t"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div className="mx-auto w-full max-w-[760px] px-5 pb-4 pt-3">
        {hasSession ? (
          <div className="mb-1.5 flex flex-wrap items-center gap-3 px-1 text-[11.5px] text-3">
            <span className="inline-flex items-center gap-1">
              <Bot size={12} /> 入口：{entryTypeLabel(entryType)}
            </span>
            <span className="h-1 w-1 rounded-full bg-[color:var(--text-4)]" />
            <span>{totalAssets} 项资产</span>
            <span className="h-1 w-1 rounded-full bg-[color:var(--text-4)]" />
            <span>{progressLabel}</span>
          </div>
        ) : null}
        <div
          className="rounded-[14px] border focus-within:border-[color:var(--accent)]"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border)",
          }}
        >
          <Textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => onChange(event.target.value)}
            placeholder={
              hasSession
                ? "继续告诉 AI 建模助手：补充口径、追加候选、或要求解释..."
                : "描述你想分析的数据，例如：「查询最近 7 天学生评论数，按学校汇总」"
            }
            onKeyDown={handleKeyDown}
            rows={2}
            aria-label="建模目标"
            id="modeling-copilot-goal"
            className="!min-h-[56px] !rounded-[14px] !border-0 !bg-transparent !px-4 !pb-1 !pt-3.5 !text-[14.5px]"
          />
          <div className="flex items-center gap-2 px-2 pb-2 pt-1">
            <span className="flex-1" />
            <span className="text-[11px] text-4">⌘↵ 发送</span>
            <Button
              variant="primary"
              onClick={() => void onSend()}
              disabled={!canSend}
              loading={isSending}
              size="sm"
            >
              <ArrowUp size={13} /> 发送
            </Button>
          </div>
        </div>
        {localError ? (
          <div className="mt-2 text-[12px] text-danger">{localError}</div>
        ) : null}
      </div>
    </div>
  );
}
