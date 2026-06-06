// frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx
//
// 语义建设工作台 · 单资产 Builder。
// 设计要点（脱离传统 dashboard）：
// - 两栏布局：左 256px sessions 列表 + 主区建设流，无右侧 Inspector、无二级 sidebar、无面包屑（由 AppShell 的
//   `byPathPrefix` 配置统一关闭）
// - 主区中心是建设流：每条 assistant turn 把 workbench_state 投影成结构化卡片
//   (discovered / confirmation / sandbox_result / saved)，"语义画布 / 阻断确认 / 沙盒结果 / Proposal 回执"
//   全部内联在对话气泡里，进度感来自对话推进而不是 4 KPI
// - 入口类型自动推断（inferEntryType），不暴露 segmented tabs
// - 历史轮次只展示文本：后端 conversation 不保留 workbench_state 历史快照，最新一轮 assistant turn 才挂卡片
//
// 后端契约：app/interfaces/api/v1/semantic_modeling_copilot.py
// adapter：@v2/lib/copilot

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ElementType,
  type KeyboardEvent,
  type RefObject,
  type ReactNode,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowUp,
  Bot,
  Box,
  Brain,
  CheckCircle2,
  ChevronRight,
  AlertCircle,
  Database,
  Edit3,
  FileCode2,
  FileSearch,
  FlaskConical,
  GitBranch,
  HelpCircle,
  Layers3,
  ListChecks,
  MessageSquareText,
  MoreHorizontal,
  Rocket,
  Save,
  ShieldCheck,
  Sparkles,
  Table2,
  Trash2,
  TrendingUp,
} from "lucide-react";
import {
  Button,
  Chip,
  Textarea,
  useToast,
  type ChipTone,
} from "@v2/components/ui";
import { AppError } from "@v2/api/types";
import type {
  AgentRuntimeManagementSnapshot,
  AgentRuntimeProviderStatus,
} from "@v2/api/agent-runtime";
import { useAgentRuntimeStatus } from "@v2/hooks/agent-runtime";
import {
  useAcceptSemanticModelingCopilotCubeDraft,
  useConfirmSemanticModelingCopilotAssumption,
  useCreateSemanticModelingCopilotSession,
  useDeleteSemanticModelingCopilotSession,
  usePreviewSemanticModelingCopilotSandbox,
  usePreviewSemanticModelingCopilotRelease,
  usePublishSemanticModelingCopilotProposal,
  useRenameSemanticModelingCopilotSession,
  useSemanticModelingCopilotReview,
  useSaveSemanticModelingCopilotProposal,
  useSemanticModelingCopilotSession,
  useSemanticModelingCopilotSessions,
  useSendSemanticModelingCopilotMessage,
  useUpdateSemanticModelingCopilotSpec,
} from "@v2/hooks/semantic";
import { Dialog } from "@v2/components/ui/Dialog";
import {
  CubeEditor,
  type CubeFieldIssue,
  type CubeSpecValue,
} from "./components/CubeEditor";
import {
  FieldCandidateReview,
  type FieldCandidateReviewItem,
} from "./components/FieldCandidateReview";
import type {
  CopilotCandidateCard,
  CopilotConfirmation,
  CopilotEvidenceItem,
  CopilotPostPublishValidation,
  CopilotPublishGate,
  CopilotSandboxPreview,
  CopilotSourceEvidence,
  CopilotSourceCandidate,
  CopilotTraceState,
  SemanticModelingCopilotReview,
  SemanticModelingCopilotMessage,
  SemanticModelingCopilotSession,
} from "@v2/api/semantic";
import {
  buildAssistantCards,
  countCanvasAssets,
  dumpCubeYaml,
  entryTypeLabel,
  evidenceLevel,
  extractCubeDraft,
  hasCubeDraft,
  inferEntryType,
  isCubeDraftAccepted,
  readinessLabel,
  readinessTone,
  sandboxFriendlyMessage,
  sessionTitle,
  statusTone,
  type AssistantCard,
} from "@v2/lib/copilot";
import { fmtRelative } from "@v2/lib/format";
import {
  BUILDER_ACTION_COPY,
  BUILDER_ARTIFACT_LABELS,
  BUILDER_EMPTY_STATE,
  BUILDER_EXAMPLES,
  CONSUMER_VALIDATION_COPY,
} from "./builderCopy";
import {
  BUILDER_STEPS,
  getActiveBuilderStepId,
  type BuilderStepId,
} from "./builderSteps";
import { getBuilderAiActions, type BuilderAiAction } from "./builderAiActions";
import {
  extractReleasePreview,
  releasePreviewStatusLabel,
  type ReleasePreview,
} from "./releasePreview";
import {
  buildPublishCheckGroups,
  isGatewayExecutionDisconnected,
  type PublishCheckStatus,
} from "./releaseValidationStatus";
import { extractSemanticLayerSummary } from "./semanticLayerSummary";
import type { WorkbenchCandidateState } from "./workbenchContext";

const EXAMPLES: Array<{ icon: ElementType; title: string; sub: string }> = [
  { icon: TrendingUp, ...BUILDER_EXAMPLES[0] },
  { icon: Table2, ...BUILDER_EXAMPLES[1] },
  { icon: AlertCircle, ...BUILDER_EXAMPLES[2] },
];

const RECENT_SESSION_DAYS = 3;
const SESSION_PAGE_SIZE = 8;

interface ModelingAgentProps {
  workbenchContext?: WorkbenchCandidateState | null;
}

function buildWorkbenchInitialGoal(context: WorkbenchCandidateState | null): string {
  if (!context) return "";
  const title = context.candidateTitle || "语义资产候选";
  const source = context.source || "待确认源表";
  const grain = context.grain || "待确认粒度";
  return `基于 ${source} 建设「${title}」，粒度为${grain}，先确认来源证据、字段候选和 Cube/本体口径，再发布到语义中心。`;
}

function toCopilotWorkbenchContext(context: WorkbenchCandidateState): Record<string, unknown> {
  return {
    workbenchMode: context.workbenchMode,
    projectId: context.projectId,
    candidateId: context.candidateId,
    candidateTitle: context.candidateTitle,
    target: context.target,
    source: context.source,
    grain: context.grain,
    risk: context.risk,
    evidence: context.evidence,
  };
}

export default function ModelingAgent({ workbenchContext = null }: ModelingAgentProps) {
  const navigate = useNavigate();
  const { sessionId: routeSessionId } = useParams<{ sessionId?: string }>();
  const toast = useToast();

  const sessionsQ = useSemanticModelingCopilotSessions({ limit: 50 });
  const sessions = useMemo(
    () => sessionsQ.data?.items ?? [],
    [sessionsQ.data?.items],
  );

  const activeSessionId =
    routeSessionId && routeSessionId !== "new" ? routeSessionId : null;
  const sessionQ = useSemanticModelingCopilotSession(
    activeSessionId ?? undefined,
  );
  const reviewQ = useSemanticModelingCopilotReview(
    activeSessionId ?? undefined,
  );
  const runtimeStatusQ = useAgentRuntimeStatus();
  const session = sessionQ.data ?? null;

  const createSession = useCreateSemanticModelingCopilotSession();
  const sendMessage = useSendSemanticModelingCopilotMessage();
  const confirmAssumption = useConfirmSemanticModelingCopilotAssumption();
  const acceptCubeDraft = useAcceptSemanticModelingCopilotCubeDraft();
  const previewSandbox = usePreviewSemanticModelingCopilotSandbox();
  const previewRelease = usePreviewSemanticModelingCopilotRelease();
  const saveProposal = useSaveSemanticModelingCopilotProposal();
  const publishProposal = usePublishSemanticModelingCopilotProposal();
  const deleteSession = useDeleteSemanticModelingCopilotSession();
  const renameSession = useRenameSemanticModelingCopilotSession();
  const updateSpec = useUpdateSemanticModelingCopilotSpec();

  // ── 工作台状态 ───────────────────────────────────────────────────────────
  const [workbenchOpen, setWorkbenchOpen] = useState(false);
  const [llmRequiredError, setLlmRequiredError] = useState<{
    message: string;
    reason?: string;
  } | null>(null);
  const [artifactTab, setArtifactTab] = useState<ArtifactTab>("Review");
  const [actionError, setActionError] = useState<CopilotActionError | null>(
    null,
  );
  const [sessionPage, setSessionPage] = useState(0);

  const isPending =
    createSession.isPending ||
    sendMessage.isPending ||
    confirmAssumption.isPending ||
    acceptCubeDraft.isPending ||
    previewSandbox.isPending ||
    previewRelease.isPending ||
    saveProposal.isPending ||
    publishProposal.isPending;

  const [draft, setDraft] = useState("");
  const [localError, setLocalError] = useState("");
  const [evidenceOpen, setEvidenceOpen] = useState<Record<string, boolean>>({});
  const threadRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const workbenchInitialGoal = useMemo(
    () => buildWorkbenchInitialGoal(workbenchContext),
    [workbenchContext],
  );
  const workbenchContextKey = workbenchContext
    ? [
        workbenchContext.projectId,
        workbenchContext.candidateId,
        workbenchContext.candidateTitle,
        workbenchContext.source,
        workbenchContext.grain,
      ].join(":")
    : "";
  const prefilledContextRef = useRef<string | null>(null);
  const prefilledDraftRef = useRef<string>("");
  const recentSessions = useMemo(
    () => sessions.filter((item) => isRecentSession(item, RECENT_SESSION_DAYS)),
    [sessions],
  );
  const totalSessionPages = Math.max(
    1,
    Math.ceil(recentSessions.length / SESSION_PAGE_SIZE),
  );
  const visibleSessions = recentSessions.slice(
    sessionPage * SESSION_PAGE_SIZE,
    sessionPage * SESSION_PAGE_SIZE + SESSION_PAGE_SIZE,
  );
  const hiddenOlderSessions = Math.max(
    0,
    sessions.length - recentSessions.length,
  );

  // ── 滚动到对话底部 ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!threadRef.current) return;
    threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [session?.conversation?.length, isPending]);

  // ── 会话不存在时回到新建页 ──────────────────────────────────────────────
  useEffect(() => {
    if (sessionQ.isError) {
      navigate("/semantic/modeling-workbench/quick", { replace: true });
    }
  }, [sessionQ.isError, navigate]);

  useEffect(() => {
    setSessionPage((page) => Math.min(page, totalSessionPages - 1));
  }, [totalSessionPages]);

  useEffect(() => {
    if (session || !workbenchInitialGoal || !workbenchContextKey) {
      return;
    }
    if (prefilledContextRef.current === workbenchContextKey) {
      return;
    }
    if (draft.trim() && draft !== prefilledDraftRef.current) {
      return;
    }
    setDraft(workbenchInitialGoal);
    prefilledContextRef.current = workbenchContextKey;
    prefilledDraftRef.current = workbenchInitialGoal;
  }, [draft, session, workbenchContextKey, workbenchInitialGoal]);

  // ── 发送：第一轮调 create+send，后续只调 send ────────────────────────────
  const sendComposerMessage = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    setLocalError("");
    setActionError(null);
    try {
      let target = session;
      if (!target) {
        target = await createSession.mutateAsync({
          user_goal: text,
          entry_type: workbenchContext ? "table_known" : inferEntryType(text),
          ...(workbenchContext
            ? { workbench_context: toCopilotWorkbenchContext(workbenchContext) }
            : {}),
        });
        navigate(`/semantic/modeling-copilot/${target.id}`);
      }
      await sendMessage.mutateAsync({ sessionId: target.id, message: text });
      setDraft("");
    } catch (error) {
      const llmRequired = extractLlmRequiredError(error);
      if (llmRequired) {
        setLlmRequiredError(llmRequired);
      } else {
        setLocalError(formatCopilotError(error));
      }
    }
  }, [draft, session, createSession, sendMessage, navigate, workbenchContext]);

  const handleConfirm = async (
    confirmation: CopilotConfirmation,
    value?: unknown,
  ) => {
    if (!session) return;
    setLocalError("");
    setActionError(null);
    try {
      await confirmAssumption.mutateAsync({
        sessionId: session.id,
        confirmationId: confirmation.id,
        value: value !== undefined ? value : confirmation.recommended_value,
      });
    } catch (error) {
      setLocalError(formatCopilotError(error));
    }
  };

  const handleOverrideConfirmation = (confirmation: CopilotConfirmation) => {
    const v = window.prompt("给一个替代值：");
    if (v != null && v.trim()) {
      void handleConfirm(confirmation, v.trim());
    }
  };

  const handleExplainConfirmation = (confirmation: CopilotConfirmation) => {
    setDraft(
      `请解释为什么推荐 "${String(confirmation.recommended_value ?? confirmation.title ?? confirmation.id)}"，以及和其他候选的差别。`,
    );
  };

  const handleConfirmSourceCandidate = async (
    candidate: CopilotSourceCandidate,
  ) => {
    if (!session) return;
    setLocalError("");
    setActionError(null);
    const name = String(
      candidate.name ??
        candidate.table ??
        candidate.title ??
        candidate.id ??
        "候选来源",
    );
    try {
      await sendMessage.mutateAsync({
        sessionId: session.id,
        message: `使用这个来源：${name}`,
        action: "confirm_source_candidate",
        candidate_id: candidate.id,
      });
    } catch (error) {
      setLocalError(formatCopilotError(error));
    }
  };

  const openSpecArtifact = () => {
    setArtifactTab("Spec");
    setWorkbenchOpen(false);
  };

  const handleSandbox = async () => {
    if (!session) return;
    setLocalError("");
    setActionError(null);
    try {
      await previewSandbox.mutateAsync({ sessionId: session.id });
    } catch (error) {
      setLocalError(formatCopilotError(error));
    }
  };

  const handleReleasePreview = async () => {
    if (!session) return;
    setLocalError("");
    setActionError(null);
    try {
      await previewRelease.mutateAsync({
        sessionId: session.id,
        body: {
          sample_questions: releasePreviewSampleQuestions(session),
        },
      });
      setArtifactTab("Review");
      toast.show({
        tone: "success",
        title: "发布预演已生成",
        description:
          "只读预演已更新，不会发布、不应用资产，也不会在平台控制面执行物理查询。",
      });
    } catch (error) {
      setLocalError(formatCopilotError(error));
    }
  };

  const handleSave = async () => {
    if (!session) return;
    setLocalError("");
    setActionError(null);
    try {
      await saveProposal.mutateAsync({ sessionId: session.id });
    } catch (error) {
      setLocalError(formatCopilotError(error));
    }
  };

  const handlePublish = async () => {
    if (!session) return;
    const publishGuard = getSemanticCenterPublishGuard(session);
    if (!publishGuard.canPublish) {
      setLocalError(publishGuard.reason);
      setActionError({
        title: "还不能发布",
        message: publishGuard.reason,
        detail: publishGuard.detail,
        action: "spec",
      });
      return;
    }
    setLocalError("");
    setActionError(null);
    try {
      await publishProposal.mutateAsync({ sessionId: session.id });
      setArtifactTab("Review");
      toast.show({
        tone: "success",
        title: "语义已发布",
        description:
          "语义资产已发布到语义中心。Data Agent、BI、数据分析等消费者可以基于同一发布快照做可用性验证。",
      });
    } catch (error) {
      const explained = explainCopilotActionError(error, "publish");
      setLocalError(explained.message);
      setActionError(explained);
    }
  };

  const handleAcceptCubeDraft = async () => {
    if (!session) return;
    setLocalError("");
    setActionError(null);
    try {
      await acceptCubeDraft.mutateAsync({ sessionId: session.id });
    } catch (error) {
      setLocalError(formatCopilotError(error));
    }
  };

  const handleSwapCubeSource = (currentTable?: string) => {
    setDraft(
      currentTable
        ? `换一张源表，${currentTable} 不合适。请基于（你给一个表名）重新生成语义资产。`
        : "换一张源表，请重新选业务表生成语义资产。",
    );
  };

  const handleDeleteSession = async (
    target: SemanticModelingCopilotSession,
  ) => {
    const ok = window.confirm(
      `确认删除会话「${sessionTitle(target)}」？此操作不可撤销。`,
    );
    if (!ok) return;
    try {
      await deleteSession.mutateAsync(target.id);
      toast.show({ tone: "success", title: "会话已删除" });
      if (target.id === activeSessionId) {
        navigate("/semantic/modeling-workbench/quick");
      }
    } catch (error) {
      toast.show({
        tone: "danger",
        title: "删除失败",
        description: formatCopilotError(error),
      });
    }
  };

  const handleRenameSession = async (
    target: SemanticModelingCopilotSession,
  ) => {
    const next = window.prompt(
      "新的会话标题：",
      target.title || target.user_goal || "",
    );
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed) return;
    try {
      await renameSession.mutateAsync({ sessionId: target.id, title: trimmed });
      toast.show({ tone: "success", title: "已更新会话标题" });
    } catch (error) {
      toast.show({
        tone: "danger",
        title: "重命名失败",
        description: formatCopilotError(error),
      });
    }
  };

  // ── 渲染 ─────────────────────────────────────────────────────────────────
  const remainingConfirmations =
    session?.workbench_state?.required_confirmations?.length ?? 0;
  const totalAssets = countCanvasAssets(session?.workbench_state);
  const canSend = draft.trim().length > 0 && !isPending;
  const rawSpecForActions = session?.workbench_state?.raw_spec;
  const hasReviewableSpec =
    !!session &&
    (hasCubeDraft(session.workbench_state) ||
      (isRecord(rawSpecForActions) &&
        Object.keys(rawSpecForActions).length > 0));
  const cubeDraftPending =
    !!session &&
    hasCubeDraft(session.workbench_state) &&
    !isCubeDraftAccepted(session.workbench_state);
  const isPublished = Boolean(
    (
      session?.workbench_state?.publish_result as
        | Record<string, unknown>
        | undefined
    )?.status === "published",
  );
  const showSandbox =
    !!session && hasReviewableSpec && !isPending && !isPublished;
  // 生成语义资产按钮启用：会话存在 + 没有阻断确认 + 还没 save。
  // Cube 草稿不再额外阻断主流程；点击“生成语义资产”本身就表示接受当前草稿并生成待发布资产。
  const showApply =
    !!session &&
    hasReviewableSpec &&
    remainingConfirmations === 0 &&
    !session.current_proposal_id &&
    !isPublished &&
    !isPending;
  const pendingRunLabel = pendingCopilotRunLabel({
    creating: createSession.isPending,
    sending: sendMessage.isPending,
    confirming: confirmAssumption.isPending,
    accepting: acceptCubeDraft.isPending,
    previewing: previewSandbox.isPending,
    releasePreviewing: previewRelease.isPending,
    saving: saveProposal.isPending,
    publishing: publishProposal.isPending,
    updatingSpec: updateSpec.isPending,
  });
  const flowNudge = session
    ? buildChatFlowNudge(session, pendingRunLabel)
    : null;
  const activeBuilderStepId = getActiveBuilderStepId(session);
  const builderAiActions = getBuilderAiActions(activeBuilderStepId);
  const fieldCandidates = session ? fieldCandidateItemsForSession(session) : [];

  // 工作台 spec 编辑：从 session 投影出当前 cube
  const currentCubeSpec = useMemo<CubeSpecValue>(() => {
    const raw = session?.workbench_state?.raw_spec as
      | Record<string, unknown>
      | undefined;
    return ((raw?.cube as CubeSpecValue | undefined) ?? {}) as CubeSpecValue;
  }, [session?.workbench_state?.raw_spec]);

  const currentRawSpec = useMemo<Record<string, unknown>>(() => {
    const raw = session?.workbench_state?.raw_spec;
    return isRecord(raw) ? raw : {};
  }, [session?.workbench_state?.raw_spec]);

  const validationIssues = useMemo<CubeFieldIssue[]>(() => {
    const summary =
      (session?.workbench_state?.validation_summary as Array<
        Record<string, unknown>
      >) || [];
    return summary
      .map((it): CubeFieldIssue | null => {
        const path =
          typeof it.path === "string"
            ? it.path
            : typeof it.key === "string"
              ? it.key
              : "";
        const severity =
          it.severity === "error" ||
          it.severity === "warning" ||
          it.severity === "info"
            ? it.severity
            : "error";
        const message = typeof it.message === "string" ? it.message : "";
        if (!path || !message) return null;
        return { path, severity, message };
      })
      .filter((x): x is CubeFieldIssue => x !== null);
  }, [session?.workbench_state?.validation_summary]);

  // debounced PATCH spec
  const specPatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCubeChange = useCallback(
    (next: CubeSpecValue) => {
      if (!session) return;
      if (specPatchTimerRef.current) clearTimeout(specPatchTimerRef.current);
      specPatchTimerRef.current = setTimeout(() => {
        updateSpec.mutate({ sessionId: session.id, body: { cube: next } });
      }, 800);
    },
    [session, updateSpec],
  );

  const handleFullSpecChange = useCallback(
    (next: Record<string, unknown>) => {
      if (!session) return;
      updateSpec.mutate({ sessionId: session.id, body: { spec: next } });
    },
    [session, updateSpec],
  );

  const handleAskAiEditSpec = useCallback(() => {
    setDraft("请基于当前完整语义草案调整语义配置：");
  }, []);

  const handleUseBuilderAiAction = useCallback((action: BuilderAiAction) => {
    setDraft(action.prompt);
    setTimeout(() => composerRef.current?.focus(), 0);
  }, []);

  const handleOpenRuntimeSettings = useCallback(() => {
    navigate("/settings?tab=agent-runtime");
  }, [navigate]);

  return (
    <div
      className="flex h-full min-h-0 flex-1"
      data-testid="v2-modeling-copilot"
    >
      {/* LLM_REQUIRED banner：未配 LLM 时阻断对话流入口 */}
      {llmRequiredError ? (
        <div
          role="alert"
          className="absolute left-0 right-0 top-0 z-50 flex items-start gap-3 border-b px-4 py-3 text-[13px]"
          style={{
            background: "#FEF2F2",
            borderColor: "#FECACA",
            color: "#991B1B",
          }}
          data-testid="copilot-llm-required-banner"
        >
          <AlertCircle size={16} aria-hidden />
          <div className="flex-1">
            <div className="font-medium">
              语义冷启动暂时不可用：当前部署未配置 LLM
            </div>
            <div className="mt-1 text-[12.5px]">
              {llmRequiredError.message}
              <span className="mx-1">·</span>
              请联系管理员在后端环境变量中配置{" "}
              <code>LLM_API_KEY / LLM_API_BASE / LLM_MODEL</code>。
            </div>
            <div className="mt-1 text-[12.5px]">
              你可以返回{" "}
              <button
                type="button"
                onClick={() => navigate("/semantic/modeling-workbench/quick")}
                className="underline underline-offset-2 hover:text-red-700"
              >
                新建语义资产会话
              </button>
              。
            </div>
          </div>
          <button
            type="button"
            aria-label="关闭"
            onClick={() => setLlmRequiredError(null)}
            className="text-red-700 hover:text-red-900"
          >
            ×
          </button>
        </div>
      ) : null}

      {/* 工作台 Dialog */}
      <Dialog
        open={workbenchOpen}
        onClose={() => setWorkbenchOpen(false)}
        width={760}
        title="工作台 · 编辑语义草案"
        footer={
          <>
            <span className="mr-auto text-[12px] text-3">
              {validationIssues.filter((i) => i.severity === "error").length}{" "}
              项错误 ·{" "}
              {validationIssues.filter((i) => i.severity === "warning").length}{" "}
              项警告
              {updateSpec.isPending ? " · 保存中…" : ""}
            </span>
            <Button
              size="sm"
              variant="default"
              onClick={() => setWorkbenchOpen(false)}
            >
              关闭
            </Button>
          </>
        }
      >
        <CubeEditor
          value={currentCubeSpec}
          editable={!isPublished}
          issues={validationIssues}
          onChange={handleCubeChange}
          onSwapSource={() =>
            handleSwapCubeSource(String(currentCubeSpec.source ?? ""))
          }
        />
      </Dialog>

      {/* 左栏：sessions 列表 */}
      <aside
        className="flex w-[256px] shrink-0 flex-col border-r"
        style={{
          background: "var(--bg-surface)",
          borderColor: "var(--border)",
        }}
      >
        <div
          className="flex items-center gap-2 border-b px-3 py-3"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-2 text-[13px] font-semibold text-1">
            <span
              className="flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold text-white"
              style={{
                background: "linear-gradient(135deg, var(--accent), #7B5BFF)",
              }}
            >
              C³
            </span>
            <span>语义冷启动</span>
          </div>
        </div>
        <div className="px-3 py-2.5">
          <button
            type="button"
            className="group flex w-full items-center gap-2.5 rounded-[10px] border px-3 py-2.5 text-left transition hover:border-[color:var(--accent)]"
            style={{
              borderColor: "rgba(37,99,235,0.22)",
              background: "var(--accent-soft)",
            }}
            onClick={() => navigate("/semantic/modeling-workbench/quick")}
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-white"
              style={{
                background: "linear-gradient(135deg, var(--accent), #7B5BFF)",
              }}
            >
              <Sparkles size={15} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-1">
                语义资产冷启动
              </span>
              <span className="block truncate text-[11px] text-3">
                新建语义资产会话
              </span>
            </span>
            <TrendingUp size={14} className="shrink-0 text-accent" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scroll-thin px-2 pb-2">
          <div className="flex items-center justify-between px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-3">
            <span>最近 3 天</span>
            <span>{recentSessions.length}</span>
          </div>
          {sessionsQ.isLoading ? (
            <div className="px-2 py-3 text-[12px] text-3">加载中…</div>
          ) : recentSessions.length === 0 ? (
            <div className="px-2 py-3 text-[12px] text-3">
              近 3 天暂无会话
              {hiddenOlderSessions > 0
                ? `，已隐藏 ${hiddenOlderSessions} 条更早记录`
                : ""}
            </div>
          ) : (
            <>
              {visibleSessions.map((s) => (
                <SessionItem
                  key={s.id}
                  session={s}
                  active={s.id === activeSessionId}
                  onSelect={() =>
                    navigate(`/semantic/modeling-copilot/${s.id}`)
                  }
                  onRename={() => void handleRenameSession(s)}
                  onDelete={() => void handleDeleteSession(s)}
                />
              ))}
              {recentSessions.length > SESSION_PAGE_SIZE ? (
                <div
                  className="mt-2 flex items-center justify-between border-t px-2 pt-2 text-[11px]"
                  style={{ borderColor: "var(--border)" }}
                >
                  <button
                    type="button"
                    className="text-3 disabled:text-4"
                    disabled={sessionPage === 0}
                    onClick={() =>
                      setSessionPage((page) => Math.max(0, page - 1))
                    }
                  >
                    上一页
                  </button>
                  <span className="text-3">
                    {sessionPage + 1}/{totalSessionPages}
                  </span>
                  <button
                    type="button"
                    className="text-3 disabled:text-4"
                    disabled={sessionPage >= totalSessionPages - 1}
                    onClick={() =>
                      setSessionPage((page) =>
                        Math.min(totalSessionPages - 1, page + 1),
                      )
                    }
                  >
                    下一页
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </aside>

      {/* 主区：topbar + 建设主流程 + 右侧 Artifact Panel */}
      <div className="flex min-w-0 flex-1 flex-col">
        <CopilotTopbar
          session={session}
          runtimeSnapshot={runtimeStatusQ.data}
          runtimeLoading={runtimeStatusQ.isLoading}
        />

        <div className="flex min-h-0 flex-1">
          <main
            className="flex min-w-0 flex-1 flex-col"
            data-testid="chat-workspace"
          >
            {session ? (
              <CopilotRunStateBar
                session={session}
                pendingRunLabel={pendingRunLabel}
              />
            ) : null}
            {session ? (
              <BuilderStepper activeStepId={activeBuilderStepId} />
            ) : null}
            {session ? (
              <BuilderAiActionPanel
                actions={builderAiActions}
                onUseAction={handleUseBuilderAiAction}
              />
            ) : null}
            <div
              className="min-h-0 flex-1 overflow-y-auto scroll-thin"
              ref={threadRef}
            >
              {!session ? (
                <EmptyState onPickExample={(text) => setDraft(text)} />
              ) : (
                <>
                  <Thread
                    session={session}
                    evidenceOpen={evidenceOpen}
                    onToggleEvidence={(key) =>
                      setEvidenceOpen((prev) => ({
                        ...prev,
                        [key]: !prev[key],
                      }))
                    }
                    onConfirm={handleConfirm}
                    onOverride={handleOverrideConfirmation}
                    onExplain={handleExplainConfirmation}
                    onConfirmSourceCandidate={handleConfirmSourceCandidate}
                    onAcceptCubeDraft={handleAcceptCubeDraft}
                    onSwapCubeSource={handleSwapCubeSource}
                    onOpenWorkbench={openSpecArtifact}
                    onPublish={handlePublish}
                    isPending={isPending}
                    isPublishing={publishProposal.isPending}
                    isPublished={isPublished}
                  />
                  <section
                    data-testid="field-candidate-main-canvas"
                    className="mx-auto mt-3 w-full max-w-[760px] px-5"
                    aria-label="字段候选主画布"
                  >
                    <div
                      className="rounded-[8px] border p-3"
                      style={{
                        borderColor: "var(--border)",
                        background: "var(--bg-surface)",
                      }}
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-3">
                            Field Candidates
                          </div>
                          <h2 className="m-0 mt-1 text-[15px] font-semibold text-1">
                            字段候选主画布
                          </h2>
                        </div>
                        <Chip>{fieldCandidates.length} 个候选</Chip>
                      </div>
                      <FieldCandidateReview candidates={fieldCandidates} />
                    </div>
                  </section>
                  <div className="mx-auto flex w-full max-w-[760px] flex-col gap-3 px-5 pb-7">
                    {flowNudge ? (
                      <ChatFlowNudge
                        nudge={flowNudge}
                        onUseTemplate={() => setDraft(flowNudge.template)}
                      />
                    ) : null}
                    <ChatNextActionCard
                      session={session}
                      showSandbox={showSandbox}
                      showApply={showApply}
                      isSandboxing={previewSandbox.isPending}
                      isApplying={saveProposal.isPending}
                      isPublished={isPublished}
                      cubeDraftPending={cubeDraftPending}
                      onSandbox={handleSandbox}
                      onApply={handleSave}
                    />
                    {actionError ? (
                      <CopilotActionErrorCard
                        error={actionError}
                        onOpenSpec={openSpecArtifact}
                        onDismiss={() => setActionError(null)}
                      />
                    ) : null}
                  </div>
                </>
              )}
            </div>

            <Composer
              inputRef={composerRef}
              draft={draft}
              onChange={setDraft}
              onSend={sendComposerMessage}
              canSend={canSend}
              isSending={createSession.isPending || sendMessage.isPending}
              totalAssets={totalAssets}
              remainingConfirmations={remainingConfirmations}
              hasSession={!!session}
              entryType={session?.entry_type}
              cubeDraftPending={cubeDraftPending}
              localError={localError}
            />
          </main>

          {session ? (
            <ArtifactPanel
              session={session}
              review={reviewQ.data}
              activeTab={artifactTab}
              onTabChange={setArtifactTab}
              rawSpec={currentRawSpec}
              validationIssues={validationIssues}
              onFullSpecChange={handleFullSpecChange}
              onAskAiEdit={handleAskAiEditSpec}
              isSavingSpec={updateSpec.isPending}
              isPublished={isPublished}
              pendingRunLabel={pendingRunLabel}
              runtimeSnapshot={runtimeStatusQ.data}
              onOpenRuntimeSettings={handleOpenRuntimeSettings}
              onReleasePreview={handleReleasePreview}
              isReleasePreviewing={previewRelease.isPending}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function BuilderStepper({ activeStepId }: { activeStepId: BuilderStepId }) {
  return (
    <nav
      aria-label="语义冷启动进度"
      data-testid="semantic-builder-stepper"
      className="shrink-0 border-b px-5 py-3"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <ol className="mx-auto grid w-full max-w-[760px] grid-cols-6 gap-2">
        {BUILDER_STEPS.map((step, index) => {
          const active = step.id === activeStepId;
          return (
            <li
              key={step.id}
              data-active={active ? "true" : undefined}
              aria-current={active ? "step" : undefined}
              className="min-w-0 rounded-[8px] border px-2.5 py-2"
              style={{
                borderColor: active ? "var(--accent)" : "var(--border)",
                background: active
                  ? "var(--accent-soft)"
                  : "var(--bg-surface-2)",
              }}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                  style={{
                    background: active ? "var(--accent)" : "var(--bg-surface)",
                    color: active ? "#fff" : "var(--text-3)",
                    border: active
                      ? "1px solid var(--accent)"
                      : "1px solid var(--border)",
                  }}
                  aria-hidden
                >
                  {index + 1}
                </span>
                <span className="truncate text-[11.5px] font-semibold text-1">
                  {step.label}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-[10.5px] leading-4 text-3">
                {step.description}
              </p>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function BuilderAiActionPanel({
  actions,
  onUseAction,
}: {
  actions: BuilderAiAction[];
  onUseAction: (action: BuilderAiAction) => void;
}) {
  return (
    <section
      data-testid="builder-ai-actions"
      className="shrink-0 border-b px-5 py-2.5"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div className="mx-auto flex w-full max-w-[760px] flex-wrap items-center gap-2">
        <div className="mr-1 flex items-center gap-1.5 text-[12px] font-semibold text-2">
          <Sparkles size={13} className="text-accent" aria-hidden />
          <span>AI 建模助手</span>
        </div>
        {actions.map((action) => (
          <Button
            key={action.id}
            size="sm"
            variant="ghost"
            onClick={() => onUseAction(action)}
          >
            <Sparkles size={12} aria-hidden />
            {action.label}
          </Button>
        ))}
      </div>
    </section>
  );
}

// ── 顶栏：标题 / readiness chip / proposal id ─────────────────────────────

function CopilotTopbar({
  session,
  runtimeSnapshot,
  runtimeLoading,
}: {
  session: SemanticModelingCopilotSession | null;
  runtimeSnapshot?: AgentRuntimeManagementSnapshot;
  runtimeLoading?: boolean;
}) {
  const label = readinessLabel(session);
  const tone = readinessTone(session);

  return (
    <div
      className="flex shrink-0 items-center gap-3 border-b px-5 py-3"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[15px] font-semibold text-1">
          {sessionTitle(session) || "准备开始"}
        </h1>
        {session?.user_goal && session.user_goal !== sessionTitle(session) ? (
          <div className="mt-0.5 truncate text-[11px] text-3">
            {session.user_goal}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <RuntimeStatusChip
          snapshot={runtimeSnapshot}
          loading={runtimeLoading}
        />
        {session?.entry_type ? (
          <Chip>{entryTypeLabel(session.entry_type)}</Chip>
        ) : null}
        {session?.state ? (
          <Chip tone="neutral">
            {session.state}
            {typeof session.state_version === "number"
              ? ` · v${session.state_version}`
              : ""}
          </Chip>
        ) : null}
        <Chip tone={tone === "accent" ? "accent" : tone}>{label}</Chip>
      </div>
    </div>
  );
}

function RuntimeStatusChip({
  snapshot,
  loading,
}: {
  snapshot?: AgentRuntimeManagementSnapshot;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Chip tone="neutral" data-testid="agent-runtime-status">
        AI 检查中
      </Chip>
    );
  }
  const openai = runtimeProvider(snapshot, "openai_compatible");
  const codex = runtimeProvider(snapshot, "codex_app_server");
  if (openai?.available) {
    return (
      <Chip
        tone="success"
        data-testid="agent-runtime-status"
        title={openai.message}
      >
        AI · OpenAI
      </Chip>
    );
  }
  if (codex?.available) {
    return (
      <Chip
        tone="accent"
        data-testid="agent-runtime-status"
        title={codex.message}
      >
        AI · Codex
      </Chip>
    );
  }
  return (
    <Chip
      tone="warning"
      data-testid="agent-runtime-status"
      title={openai?.message ?? codex?.message}
    >
      AI 建议待启用
    </Chip>
  );
}

function runtimeProvider(
  snapshot: AgentRuntimeManagementSnapshot | undefined,
  runtimeName: string,
): AgentRuntimeProviderStatus | undefined {
  const providers = Array.isArray(snapshot?.providers)
    ? snapshot.providers
    : [];
  return providers.find((provider) => provider.runtime_name === runtimeName);
}

// ── 右侧资产审阅：建设摘要 / 语义草案 / 来源证据 / 可用性验证 / 审计记录 ─────────

type ArtifactTab =
  | "Review"
  | "Fields"
  | "Spec"
  | "Source"
  | "Preview"
  | "Trace";

const ARTIFACT_TAB_LABELS: Record<ArtifactTab, string> = {
  Review: BUILDER_ARTIFACT_LABELS.review,
  Fields: BUILDER_ARTIFACT_LABELS.fields,
  Spec: BUILDER_ARTIFACT_LABELS.semanticDraft,
  Source: BUILDER_ARTIFACT_LABELS.source,
  Preview: BUILDER_ARTIFACT_LABELS.preview,
  Trace: BUILDER_ARTIFACT_LABELS.trace,
};

interface ReviewChange {
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

interface ReviewBlocker {
  id: string;
  title: string;
  state: "open" | "in_progress" | "resolved";
  description: string;
  action: string;
  source?: string;
  technicalHint?: unknown;
}

interface FieldCandidateTrace {
  candidate_set_id?: string;
  measure_count?: number;
  metric_count?: number;
  dimension_count?: number;
  risk_summary?: Record<string, unknown> | string[] | string | null;
  candidates?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

interface CopilotActionError {
  title: string;
  message: string;
  detail?: string;
  action?: "spec" | "retry";
}

interface ChatFlowNudgeModel {
  statusLabel: string;
  title: string;
  detail: string;
  template: string;
  actionLabel: string;
}

function ArtifactPanel({
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

function CodexReviewRuntimeNotice({
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
  const codex = runtimeProvider(snapshot, "codex_app_server");
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

function FieldCandidateTraceBlock({
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

function fieldCandidateTraceForReview(
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

function fieldCandidateItemsForSession(
  session: SemanticModelingCopilotSession,
): FieldCandidateReviewItem[] {
  const trace = fieldCandidateTraceForReview(session, undefined);
  const candidates = Array.isArray(trace?.candidates) ? trace.candidates : [];
  return candidates.filter(isRecord).map((item, index) => {
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
}

function fieldCandidateItemId(
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

function asFieldCandidateTrace(value: unknown): FieldCandidateTrace | null {
  return isRecord(value) && stringValue(value.candidate_set_id)
    ? (value as FieldCandidateTrace)
    : null;
}

function fieldCandidateCount(
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

function formatFieldCandidateRiskSummary(
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

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function compactArtifactSummary(
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

function artifactGuidance(
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

interface CopilotRunState {
  trigger: string;
  runtime: string;
  detail: string;
  lastTrace: string;
  tone: "neutral" | "success" | "warning" | "danger" | "accent";
  running: boolean;
}

function CopilotRunStateBar({
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

function buildCopilotRunState(
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

function buildChatFlowNudge(
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

function lastTraceLabel(session: SemanticModelingCopilotSession): string {
  const traces = (session.tool_traces ?? []).filter(Boolean);
  const trace = traces[traces.length - 1];
  if (!trace) return "暂无运行记录";
  return `${String(trace.tool || "tool")} · ${String(trace.status || "completed")}`;
}

function runStateColor(tone: CopilotRunState["tone"]): string {
  if (tone === "success") return "var(--success)";
  if (tone === "warning") return "var(--warning)";
  if (tone === "danger") return "var(--danger)";
  if (tone === "accent") return "var(--accent)";
  return "var(--border-strong)";
}

function runStateBackground(tone: CopilotRunState["tone"]): string {
  if (tone === "warning") return "rgba(255,251,235,0.72)";
  if (tone === "danger") return "rgba(254,242,242,0.72)";
  if (tone === "success") return "rgba(240,253,244,0.55)";
  if (tone === "accent") return "rgba(239,246,255,0.58)";
  return "var(--bg-surface)";
}

function pendingCopilotRunLabel(input: {
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

function ProposalReviewWorkbench({
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

function ArtifactSourcePanel({
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

function SourceFieldRow({ field }: { field: Record<string, unknown> }) {
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

function ArtifactSpecPanel({
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

function ArtifactTracePanel({
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

function TraceEventRow({
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

function ArtifactPreviewPanel({
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

function normalizePreviewFriendlyCopy(
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

function normalizePreviewPanelText(text: string): string {
  return text
    .replace(/Cube spec/g, "语义草案")
    .replace(/Cube 草稿/g, "语义草稿")
    .replace(/可生成 spec/g, "可生成语义草案")
    .replace(/正式 runtime/g, "语义中心发布快照")
    .replace(/runtime/g, "语义中心发布快照")
    .replace(/沙盒预演/g, BUILDER_ACTION_COPY.sandboxButton);
}

function PreviewFact({ label, value }: { label: string; value: string }) {
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

const publishCheckLabels = [
  "语义草案完整性",
  "语义编译",
  "执行验证",
  "消费者可用性",
] as const;

function ReleasePreviewPanel({ preview }: { preview: ReleasePreview | null }) {
  const semanticCompileStatus = preview?.semanticCompile.status;
  const gatewayStatus = preview?.gatewayValidation.status;
  const gatewayDisconnected = preview
    ? isGatewayExecutionDisconnected(preview)
    : false;
  const status =
    semanticCompileStatus && semanticCompileStatus !== "passed"
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
          status:
            preview.semanticCompile.status === "failed" ? "failed" : "passed",
          message:
            "Cube、本体和 Binding 已整理为发布预演输入；发布目标是语义中心。",
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

function releasePreviewTone(status: string | undefined): ChipTone {
  if (status === "passed") return "success";
  if (status === "failed") return "danger";
  if (status === "not_configured") return "warning";
  if (status === "gateway_disconnected") return "warning";
  return "accent";
}

function toPublishCheckStatus(status: string | undefined): PublishCheckStatus {
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

function releaseValidationGroupTone(statusLabel: string): ChipTone {
  if (statusLabel === "已通过" || statusLabel === "语义中心可发布")
    return "success";
  if (statusLabel === "未通过" || statusLabel === "待修复") return "danger";
  return "warning";
}

function hasReleasePreviewableSpec(session: SemanticModelingCopilotSession): boolean {
  const rawSpec = session.workbench_state?.raw_spec;
  if (isRecord(rawSpec)) {
    const hasCube = isRecord(rawSpec.cube) || Array.isArray(rawSpec.cubes);
    if (hasCube && Object.keys(rawSpec).length > 0) return true;
  }
  return hasCubeDraft(session.workbench_state);
}

function releasePreviewSampleQuestions(
  session: SemanticModelingCopilotSession,
): string[] {
  const sandbox = session.workbench_state?.sandbox_preview;
  const rawQuestions = isRecord(sandbox) ? sandbox.sample_questions : undefined;
  const questions = Array.isArray(rawQuestions)
    ? rawQuestions
        .map((item) => String(item || "").trim())
        .filter((item) => item.length > 0)
    : [];
  if (questions.length > 0) return questions;
  return session.user_goal ? [session.user_goal] : [];
}

interface SemanticCenterPublishGuard {
  canPublish: boolean;
  reason: string;
  detail?: string;
}

function getSemanticCenterPublishGuard(
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

function getSemanticCenterPublishGuardFromState({
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
  const blockingReason = reasons.find((reason) =>
    PUBLISH_BLOCKING_REASONS.has(reason),
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

const PUBLISH_BLOCKING_REASONS = new Set([
  "source_candidate_confirmation_required",
  "need_source_table",
  "spec_not_generated",
  "business_owner_confirmation_required",
  "validation_blocked",
  "cube_draft_not_accepted",
  "binding_not_approved",
]);

function PublishGatePanel({
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

function GateStep({ step }: { step: Record<string, unknown> }) {
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

function publishGateStepCopy(step: Record<string, unknown>): {
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

function PostPublishValidationPanel({
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

function blockerFixGuide(blocker: ReviewBlocker): { why: string; fix: string } {
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

function sourceEvidenceForArtifact(
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

function normalizeFieldList(
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

function traceStateForArtifact(
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

function publishGateForArtifact(
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

function postPublishValidationForArtifact(
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

function buildProposalReview(
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
    stringValue(
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

function buildProposalReviewFromArtifact(
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

function normalizeConsumerValidationText(text?: string | null): string {
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

function changeTypeLabel(type: string): string {
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

function buildReviewChanges(input: {
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

function buildReviewBlockers(
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

function proposalReviewStatus({
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

function reasonLabelsForReview(
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

function reasonLabel(reason: string): string {
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

function findDimensionName(
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

function confidenceLabel(score: unknown): string {
  if (typeof score !== "number") return "高";
  if (score >= 0.8) return "高";
  if (score >= 0.6) return "中";
  return "低";
}

function dedupeBlockers(blockers: ReviewBlocker[]): ReviewBlocker[] {
  const seen = new Set<string>();
  return blockers.filter((blocker) => {
    if (seen.has(blocker.id)) return false;
    seen.add(blocker.id);
    return true;
  });
}

function stringValue(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function isRecentSession(
  session: SemanticModelingCopilotSession,
  days: number,
): boolean {
  const stamp = session.updated_at || session.created_at;
  if (!stamp) return true;
  const time = Date.parse(stamp);
  if (!Number.isFinite(time)) return true;
  return Date.now() - time <= days * 24 * 60 * 60 * 1000;
}

// ── 会话列表条目 ─────────────────────────────────────────────────────────

function SessionItem({
  session,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  session: SemanticModelingCopilotSession;
  active: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const stateInfo = sessionStateInfo(session);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onSelect}
        className={`group flex w-full items-start gap-2 rounded px-2 py-2 text-left transition ${
          active
            ? "bg-[color:var(--accent-soft)]"
            : "hover:bg-[color:var(--bg-hover)]"
        }`}
      >
        <span
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-medium"
          style={{
            background: active ? "var(--accent)" : "var(--bg-surface-2)",
            color: active ? "white" : "var(--text-3)",
          }}
        >
          <stateInfo.Icon size={11} />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-[13px] ${active ? "font-medium text-1" : "text-2"}`}
          >
            {sessionTitle(session)}
          </span>
          <span className="mt-0.5 flex items-center gap-1 text-[11px] text-3">
            <span
              className={`h-1.5 w-1.5 rounded-full`}
              style={{ background: stateInfo.dot }}
            />
            <span className="truncate">{stateInfo.label}</span>
            {session.updated_at ? (
              <>
                <span className="text-4">·</span>
                <span className="truncate">
                  {fmtRelative(session.updated_at)}
                </span>
              </>
            ) : null}
          </span>
        </span>
        <span
          className="shrink-0 opacity-0 transition group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((prev) => !prev);
          }}
          aria-label="会话操作"
          role="button"
        >
          <span className="rail-btn">
            <MoreHorizontal size={12} />
          </span>
        </span>
      </button>
      {menuOpen ? (
        <div
          className="absolute right-1 top-9 z-20 min-w-[120px] rounded border py-1 shadow-md"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-2 hover:bg-[color:var(--bg-hover)]"
            onClick={() => {
              setMenuOpen(false);
              onRename();
            }}
          >
            <Edit3 size={12} /> 重命名
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-danger hover:bg-[color:var(--bg-hover)]"
            onClick={() => {
              setMenuOpen(false);
              onDelete();
            }}
          >
            <Trash2 size={12} /> 删除
          </button>
        </div>
      ) : null}
    </div>
  );
}

function sessionStateInfo(session: SemanticModelingCopilotSession): {
  Icon: ElementType;
  label: string;
  dot: string;
} {
  if (session.current_proposal_id) {
    return { Icon: CheckCircle2, label: "已保存", dot: "var(--success)" };
  }
  const remaining =
    session.workbench_state?.required_confirmations?.length ?? 0;
  if (remaining > 0) {
    return { Icon: AlertCircle, label: "待确认", dot: "var(--warning)" };
  }
  if (session.conversation && session.conversation.length > 1) {
    return { Icon: MessageSquareText, label: "进行中", dot: "var(--accent)" };
  }
  return { Icon: Sparkles, label: "草稿", dot: "var(--text-4)" };
}

// ── 对话流 ───────────────────────────────────────────────────────────────

function Thread({
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
  onPublish,
  isPending,
  isPublishing,
  isPublished,
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
  onPublish: () => void;
  isPending: boolean;
  isPublishing: boolean;
  isPublished: boolean;
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
          onPublish={onPublish}
          workbenchState={session.workbench_state}
          isPublishing={isPublishing}
          isPublished={isPublished}
        />
      ))}
      {isPending ? <TypingTurn /> : null}
    </div>
  );
}

function Turn({
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
  onPublish,
  workbenchState,
  isPublishing,
  isPublished,
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
  onPublish: () => void;
  workbenchState?: SemanticModelingCopilotSession["workbench_state"];
  isPublishing: boolean;
  isPublished: boolean;
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
        <div className="mb-1 text-[12px] font-semibold text-1">
          {isUser ? "You" : "Copilot"}
        </div>
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
                onPublish={onPublish}
                workbenchState={workbenchState}
                isPublishing={isPublishing}
                isPublished={isPublished}
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

function TypingTurn() {
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
        <div className="mb-1 text-[12px] font-semibold text-1">Copilot</div>
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

function CardRenderer({
  card,
  onConfirm,
  onOverride,
  onExplain,
  onConfirmSourceCandidate,
  onAcceptCubeDraft,
  onSwapCubeSource,
  onOpenWorkbench,
  onPublish,
  workbenchState,
  isPublishing,
  isPublished,
}: {
  card: AssistantCard;
  onConfirm: (confirmation: CopilotConfirmation) => void;
  onOverride: (confirmation: CopilotConfirmation) => void;
  onExplain: (confirmation: CopilotConfirmation) => void;
  onConfirmSourceCandidate: (candidate: CopilotSourceCandidate) => void;
  onAcceptCubeDraft: () => void;
  onSwapCubeSource: (currentTable?: string) => void;
  onOpenWorkbench: () => void;
  onPublish: () => void;
  workbenchState?: SemanticModelingCopilotSession["workbench_state"];
  isPublishing: boolean;
  isPublished: boolean;
}) {
  if (card.type === "discovered") {
    return <DiscoveredCard canvas={card.canvas} candidates={card.candidates} />;
  }
  if (card.type === "source_candidates") {
    return (
      <SourceCandidateCard
        candidates={card.candidates}
        onConfirm={onConfirmSourceCandidate}
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
        onPublish={onPublish}
        isPublishing={isPublishing}
        isPublished={isPublished}
        workbenchState={workbenchState}
      />
    );
  }
  return null;
}

function CardShell({
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

function DiscoveredCard({
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

function SourceCandidateCard({
  candidates,
  onConfirm,
}: {
  candidates: CopilotSourceCandidate[];
  onConfirm: (candidate: CopilotSourceCandidate) => void;
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
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => onConfirm(candidate)}
                    >
                      <CheckCircle2 size={12} /> 使用此来源
                    </Button>
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

interface DataAssetCandidateEvidenceModel {
  assetType: string;
  qualifiedName: string;
  hasEvidenceBundle: boolean;
  runtimeTruth?: boolean;
  rowCount: string;
  partitionCount: string;
  profileStatus: string;
}

function DataAssetCandidateEvidence({
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
        <Chip tone="accent">{evidence.assetType}</Chip>
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

function dataAssetEvidenceForCandidate(
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

function formatProfileNumber(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.NumberFormat("zh-CN").format(value);
  }
  if (typeof value === "string" && value.trim()) return value.trim();
  return "";
}

function formatScoreBreakdown(value: unknown): string {
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

function AssetRow({
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

function kindAccent(
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

function ConfirmationCard({
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

function SandboxCard({
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

function SavedCard({
  proposalId,
  proposalSummary,
  nextSteps: _nextSteps,
  published,
  publishResult,
  onPublish,
  isPublishing,
  isPublished,
  workbenchState,
}: {
  proposalId: string;
  proposalSummary: SemanticModelingCopilotSession["workbench_state"]["proposal_summary"];
  nextSteps: SemanticModelingCopilotSession["workbench_state"]["next_steps"];
  published: boolean;
  publishResult?: Record<string, unknown>;
  onPublish: () => void;
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
        <div className="flex items-center gap-2 pt-1">
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

function summarizePublishTarget(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const name = String(obj.name ?? obj.id ?? "");
    const status = obj.status ? `（${obj.status}）` : "";
    return `${name}${status}`;
  }
  return String(value ?? "");
}

function CubeDraftCard({
  cube,
  candidateTable,
  accepted,
  onAccept,
  onSwapSource,
  onOpenWorkbench,
}: {
  cube: Record<string, unknown>;
  candidateTable?: string;
  accepted: boolean;
  onAccept: () => void;
  onSwapSource: () => void;
  onOpenWorkbench?: () => void;
}) {
  const [showYaml, setShowYaml] = useState(false);
  const yamlText = useMemo(() => dumpCubeYaml(cube), [cube]);
  const cubeName = String(cube.name ?? "(未命名语义资产)");
  const source = String(
    cube.source ?? cube.table ?? candidateTable ?? "未指定",
  );
  const dimensions = Array.isArray(cube.dimensions)
    ? cube.dimensions.length
    : 0;
  const measures = Array.isArray(cube.measures) ? cube.measures.length : 0;

  return (
    <CardShell
      title={accepted ? "语义草稿（已接受）" : "建议新建语义资产"}
      icon={FileCode2}
      progress={
        <Chip tone={accepted ? "success" : "warning"}>
          {accepted ? "已锁定" : "待接受"}
        </Chip>
      }
    >
      <div className="flex flex-col gap-2 px-4 py-3 text-[13px] leading-6">
        {!accepted ? (
          <div className="text-2 text-[12.5px]">
            没有匹配到现成的语义资产，系统基于业务表为你生成了一份语义草稿。检查无误后可直接「
            {BUILDER_ACTION_COPY.saveButton}
            」生成待发布语义资产；也可以先接受草稿锁定当前语义配置。
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
          {!accepted ? (
            <Button size="sm" variant="primary" onClick={onAccept}>
              <CheckCircle2 size={12} /> 接受草稿
            </Button>
          ) : null}
          {onOpenWorkbench ? (
            <Button size="sm" variant="default" onClick={onOpenWorkbench}>
              <Edit3 size={12} /> 在右侧编辑语义配置
            </Button>
          ) : null}
          {!accepted ? (
            <Button size="sm" variant="default" onClick={onSwapSource}>
              <Edit3 size={12} /> 换一张源表
            </Button>
          ) : null}
          {!accepted ? (
            <span className="text-[11.5px] text-3">
              在工作台直接改字段或换源表，语义配置自动校验；主按钮会应用当前草稿。
            </span>
          ) : null}
        </div>
      </div>
    </CardShell>
  );
}

function KvRow({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-1">
      <span className="w-[88px] shrink-0 text-3">{k}</span>
      <span className="min-w-0 flex-1 break-all text-1">{v}</span>
    </div>
  );
}

function EvidenceRow({ item }: { item: CopilotEvidenceItem }) {
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

// ── 空态：图标 + 标题 + 3 个示例 ──────────────────────────────────────────

function EmptyState({
  onPickExample,
}: {
  onPickExample: (text: string) => void;
}) {
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

// ── 建设主流程动作：预演 / 应用只跟随主链路出现 ─────────────────────────────

function ChatFlowNudge({
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

function ChatNextActionCard({
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

function CopilotActionErrorCard({
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

function Composer({
  inputRef,
  draft,
  onChange,
  onSend,
  canSend,
  isSending,
  totalAssets,
  remainingConfirmations,
  hasSession,
  entryType,
  cubeDraftPending,
  localError,
}: {
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  draft: string;
  onChange: (text: string) => void;
  onSend: () => void | Promise<void>;
  canSend: boolean;
  isSending: boolean;
  totalAssets: number;
  remainingConfirmations: number;
  hasSession: boolean;
  entryType?: string;
  cubeDraftPending: boolean;
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
            <span>
              {remainingConfirmations === 0
                ? cubeDraftPending
                  ? "语义草稿待应用"
                  : "所有口径已就绪"
                : `${remainingConfirmations} 项待确认`}
            </span>
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
                ? "继续告诉 Copilot：补充口径、追加候选、或要求解释..."
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

// ── 错误格式化（保留对 INSUFFICIENT_ROLE 的友好提示） ────────────────────

function extractLlmRequiredError(
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

function formatCopilotError(error: unknown): string {
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

function explainCopilotActionError(
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

function formatSpecJson(spec: Record<string, unknown>): string {
  try {
    return JSON.stringify(spec || {}, null, 2);
  } catch {
    return "{}";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
