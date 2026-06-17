// frontend/src/v2/pages/semantic/modeling-copilot/components/SessionRail.tsx
/* eslint-disable react-refresh/only-export-components -- 组件与同区块 helper 同文件导出，沿用项目共享约定。 */
//
// 工作台左侧会话列表区块（会话项 / 最近分组 / 分页）。

import {
  useState,
  type Dispatch,
  type ElementType,
  type SetStateAction,
} from "react";
import {
  CheckCircle2,
  AlertCircle,
  Edit3,
  MessageSquareText,
  MoreHorizontal,
  Sparkles,
  Trash2,
  TrendingUp,
} from "lucide-react";
import type {
  SemanticModelingCopilotSession,
} from "@v2/api/semantic";
import { Can } from "@v2/components/Can";
import {
  sessionTitle,
} from "@v2/lib/copilot";
import {
  fmtRelative,
} from "@v2/lib/format";


export const RECENT_SESSION_DAYS = 3;

export const SESSION_PAGE_SIZE = 8;


export function SessionRail({
  activeSessionId,
  hiddenOlderSessions,
  onCreate,
  onDelete,
  onRename,
  onSelect,
  recentSessions,
  sessionPage,
  sessionsLoading,
  setSessionPage,
  totalSessionPages,
  visibleSessions,
}: {
  activeSessionId: string | null;
  hiddenOlderSessions: number;
  onCreate: () => void;
  onDelete: (target: SemanticModelingCopilotSession) => void;
  onRename: (target: SemanticModelingCopilotSession) => void;
  onSelect: (target: SemanticModelingCopilotSession) => void;
  recentSessions: SemanticModelingCopilotSession[];
  sessionPage: number;
  sessionsLoading: boolean;
  setSessionPage: Dispatch<SetStateAction<number>>;
  totalSessionPages: number;
  visibleSessions: SemanticModelingCopilotSession[];
}) {
  return (
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
          onClick={onCreate}
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
        {sessionsLoading ? (
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
                onSelect={() => onSelect(s)}
                onRename={() => onRename(s)}
                onDelete={() => onDelete(s)}
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
                  onClick={() => setSessionPage((page) => Math.max(0, page - 1))}
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
  );
}


export function isRecentSession(
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


export function SessionItem({
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
          <Can action="semantic.write">
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
          </Can>
        </div>
      ) : null}
    </div>
  );
}


export function sessionStateInfo(session: SemanticModelingCopilotSession): {
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
