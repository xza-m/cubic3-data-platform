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
} from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  AlertCircle,
  Sparkles,
} from "lucide-react";
import {
  Button,
  Chip,
  useConfirm,
  useToast,
  type ChipTone,
} from "@v2/components/ui";
import {
  t,
} from "@v2/i18n";
import type {
  AgentRuntimeManagementSnapshot,
} from "@v2/api/agent-runtime";
import {
  useAgentRuntimeStatus,
} from "@v2/hooks/agent-runtime";
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
import {
  Dialog,
} from "@v2/components/ui/Dialog";
import {
  CubeEditor,
  type CubeFieldIssue,
  type CubeSpecValue,
} from "./components/CubeEditor";
import {
  FieldCandidateReview,
} from "./components/FieldCandidateReview";
import type {
  CopilotConfirmation,
  CopilotSourceCandidate,
  SemanticModelingCopilotSession,
} from "@v2/api/semantic";
import {
  countCanvasAssets,
  entryTypeLabel,
  hasCubeDraft,
  inferEntryType,
  isCubeDraftAccepted,
  readinessLabel,
  readinessTone,
  sessionTitle,
} from "@v2/lib/copilot";
import {
  BUILDER_STEPS,
  getActiveBuilderStepId,
  type BuilderStepId,
} from "./builderSteps";
import {
  getBuilderAiActions,
  type BuilderAiAction,
} from "./builderAiActions";
import {
  batchModelingRiskLabel,
  batchModelingRiskTone,
} from "./batchModeling";
import type {
  WorkbenchCandidateState,
} from "./workbenchContext";

import {
  CopilotActionError,
  fieldCandidateItemsForSession,
  buildChatFlowNudge,
  pendingCopilotRunLabel,
  releasePreviewSampleQuestions,
  composerProgressLabel,
  getSemanticCenterPublishGuard,
  extractLlmRequiredError,
  formatCopilotError,
  explainCopilotActionError,
  isRecord,
  runtimeProvider,
  type CubeDraftAcceptanceMode,
} from "./modelingAgentModel";
import {
  RECENT_SESSION_DAYS,
  SESSION_PAGE_SIZE,
  SessionRail,
  isRecentSession,
} from "./components/SessionRail";
import {
  Thread,
  EmptyState,
  ChatFlowNudge,
  ChatNextActionCard,
  CopilotActionErrorCard,
  Composer,
} from "./components/ChatThread";
import {
  ArtifactTab,
  ArtifactPanel,
  CopilotRunStateBar,
} from "./components/ArtifactPanel";

interface ModelingAgentProps {
  workbenchContext?: WorkbenchCandidateState | null;
  embeddedInWorkbench?: boolean;
}




function buildWorkbenchInitialGoal(context: WorkbenchCandidateState | null): string {
  if (!context) return "";
  const title =
    context.candidateTitle ||
    t("semantic.modelingWorkbench.initialGoal.candidate", "语义资产候选");
  const source =
    context.source ||
    t("semantic.modelingWorkbench.initialGoal.source", "待确认源表");
  const grain =
    context.grain ||
    t("semantic.modelingWorkbench.initialGoal.grain", "待确认粒度");
  return t(
    "semantic.modelingWorkbench.initialGoal.template",
    "基于 {source} 建设「{title}」，粒度为{grain}，先确认来源证据、字段候选和 Cube/本体口径，再发布到语义中心。",
    { source, title, grain },
  );
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
    ...(context.modelingSource ? { modeling_source: context.modelingSource } : {}),
  };
}


export default function ModelingAgent({
  workbenchContext = null,
  embeddedInWorkbench = false,
}: ModelingAgentProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { sessionId: routeSessionId } = useParams<{ sessionId?: string }>();
  const toast = useToast();
  const confirm = useConfirm();

  const sessionsQ = useSemanticModelingCopilotSessions({ limit: 50 });
  const sessions = useMemo(
    () => sessionsQ.data?.items ?? [],
    [sessionsQ.data?.items],
  );

  const querySessionId = searchParams.get("sessionId");
  const [workbenchSessionId, setWorkbenchSessionId] = useState<string | null>(
    querySessionId,
  );
  const activeSessionId =
    routeSessionId && routeSessionId !== "new"
      ? routeSessionId
      : workbenchSessionId;
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

  useEffect(() => {
    setWorkbenchSessionId(querySessionId);
  }, [querySessionId]);

  const openSession = useCallback(
    (sessionId: string, options?: { replace?: boolean }) => {
      if (!embeddedInWorkbench) {
        navigate(`/semantic/modeling-workbench/quick?sessionId=${encodeURIComponent(sessionId)}`, options);
        return;
      }
      setWorkbenchSessionId(sessionId);
      const nextSearch = new URLSearchParams(location.search);
      nextSearch.set("sessionId", sessionId);
      const query = nextSearch.toString();
      navigate(
        {
          pathname: location.pathname,
          search: query ? `?${query}` : "",
        },
        options,
      );
    },
    [embeddedInWorkbench, location.pathname, location.search, navigate],
  );

  const clearWorkbenchSession = useCallback(() => {
    setWorkbenchSessionId(null);
    if (!embeddedInWorkbench) return;
    const nextSearch = new URLSearchParams(location.search);
    nextSearch.delete("sessionId");
    const query = nextSearch.toString();
    navigate(
      {
        pathname: location.pathname,
        search: query ? `?${query}` : "",
      },
      { replace: true },
    );
  }, [embeddedInWorkbench, location.pathname, location.search, navigate]);
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
      if (embeddedInWorkbench) {
        clearWorkbenchSession();
      } else {
        navigate("/semantic/modeling-workbench/quick", { replace: true });
      }
    }
  }, [clearWorkbenchSession, embeddedInWorkbench, navigate, sessionQ.isError]);

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
        openSession(target.id);
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
  }, [draft, session, createSession, sendMessage, openSession, workbenchContext]);

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
    const ok = await confirm({
      title: `确认删除会话「${sessionTitle(target)}」？此操作不可撤销。`,
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteSession.mutateAsync(target.id);
      toast.show({ tone: "success", title: "会话已删除" });
      if (target.id === activeSessionId) {
        if (embeddedInWorkbench) {
          clearWorkbenchSession();
        } else {
          navigate("/semantic/modeling-workbench/quick");
        }
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
  const isBatchCandidateMode = workbenchContext?.workbenchMode === "batch";
  const sourceCandidateActionsLocked = Boolean(
    isBatchCandidateMode &&
      (hasReviewableSpec || session?.current_proposal_id || isPublished),
  );
  const cubeDraftAcceptanceMode: CubeDraftAcceptanceMode =
    isBatchCandidateMode ? "candidate_locked" : "explicit";
  const cubeDraftChangeActionsLocked = Boolean(
    isBatchCandidateMode && (session?.current_proposal_id || isPublished),
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

      {!embeddedInWorkbench ? (
        <SessionRail
          activeSessionId={activeSessionId}
          hiddenOlderSessions={hiddenOlderSessions}
          onCreate={() => navigate("/semantic/modeling-workbench/quick")}
          onDelete={handleDeleteSession}
          onRename={handleRenameSession}
          onSelect={(target) => openSession(target.id)}
          recentSessions={recentSessions}
          sessionPage={sessionPage}
          sessionsLoading={sessionsQ.isLoading}
          setSessionPage={setSessionPage}
          totalSessionPages={totalSessionPages}
          visibleSessions={visibleSessions}
        />
      ) : null}

      {/* 主区：topbar + 建设主流程 + 右侧 Artifact Panel */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <CopilotTopbar
          session={session}
          workbenchContext={workbenchContext}
          runtimeSnapshot={runtimeStatusQ.data}
          runtimeLoading={runtimeStatusQ.isLoading}
        />

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <main
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
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
              className="min-h-0 flex-1 overflow-y-auto scroll-pb-40 scroll-pt-24 scroll-thin"
              ref={threadRef}
            >
              {!session ? (
                <EmptyState
                  workbenchContext={workbenchContext}
                  onPickExample={(text) => setDraft(text)}
                />
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
                    onReleasePreview={handleReleasePreview}
                    onPublish={handlePublish}
                    isPending={isPending}
                    isReleasePreviewing={previewRelease.isPending}
                    isPublishing={publishProposal.isPending}
                    isPublished={isPublished}
                    sourceCandidateActionsLocked={sourceCandidateActionsLocked}
                    cubeDraftAcceptanceMode={cubeDraftAcceptanceMode}
                    cubeDraftChangeActionsLocked={cubeDraftChangeActionsLocked}
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
              hasSession={!!session}
              entryType={session?.entry_type}
              progressLabel={
                session
                  ? composerProgressLabel({
                      session,
                      totalAssets,
                      remainingConfirmations,
                      cubeDraftPending,
                    })
                  : ""
              }
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
  workbenchContext,
  runtimeSnapshot,
  runtimeLoading,
}: {
  session: SemanticModelingCopilotSession | null;
  workbenchContext?: WorkbenchCandidateState | null;
  runtimeSnapshot?: AgentRuntimeManagementSnapshot;
  runtimeLoading?: boolean;
}) {
  const label = readinessLabel(session);
  const tone = readinessTone(session);
  const hasWorkbenchCandidate = !session && Boolean(workbenchContext);
  const title = session
    ? sessionTitle(session) || "准备开始"
    : workbenchContext?.candidateTitle || "准备开始";

  return (
    <div
      className="flex shrink-0 items-center gap-3 border-b px-5 py-3"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[15px] font-semibold text-1">
          {title}
        </h1>
        {session?.user_goal && session.user_goal !== sessionTitle(session) ? (
          <div className="mt-0.5 truncate text-[11px] text-3">
            {session.user_goal}
          </div>
        ) : hasWorkbenchCandidate ? (
          <div className="mt-0.5 truncate text-[11px] text-3">
            批量候选详情 · {workbenchContext?.source} ·{" "}
            {workbenchContext?.grain}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {hasWorkbenchCandidate && workbenchContext ? (
          <>
            <Chip tone={batchModelingRiskTone(workbenchContext.risk) as ChipTone}>
              {batchModelingRiskLabel(workbenchContext.risk)}
            </Chip>
            <Chip tone="accent">语义中心</Chip>
            <Chip tone="neutral">待审阅候选</Chip>
          </>
        ) : (
          <>
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
          </>
        )}
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
  const codex = runtimeProvider(snapshot, "codex_sdk");
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



// ── 右侧资产审阅：建设摘要 / 语义草案 / 来源证据 / 可用性验证 / 审计记录 ─────────
