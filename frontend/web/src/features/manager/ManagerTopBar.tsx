import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BackLink,
  BottomSheet,
  Button,
  SheetItem,
  Spinner,
  ThemeMenuControl,
} from "../../design-system";
import { keepFocusedFieldVisible } from "../../design-system/mobileKeyboard";
import type { CmsPrincipal } from "../cms/api/cmsTypes";
import { CMS_PERMISSIONS, hasPermission } from "../cms/navigation";
import { SessionTabsSegment } from "./SessionTabsBar";

/**
 * Compact session command bar for cockpit and report screens.
 *
 * One row: back · editable session title · Управление/Отчёт · actions · ⋯
 * Mobile keeps invite/finish in `ManagerBottomDock`; desktop shows them here.
 */
export function ManagerTopBar({
  principal,
  title = "Planning Poker",
  chatId,
  inviteUrl,
  onFinishSession,
  finishBusy,
  onRename,
  renameBusy,
  trailingActions,
}: {
  principal: CmsPrincipal;
  title?: string;
  chatId?: number;
  inviteUrl?: string;
  onFinishSession?: () => void;
  finishBusy?: boolean;
  onRename?: (title: string) => Promise<boolean>;
  renameBusy?: boolean;
  trailingActions?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(title);

  useEffect(() => {
    if (renameOpen) setRenameValue(title);
  }, [renameOpen, title]);

  async function copyInvite() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(new URL(inviteUrl, window.location.origin).toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard rejected — ignored */
    }
  }

  const canSeeSessions = hasPermission(principal, CMS_PERMISSIONS.sessions);
  const backTo = canSeeSessions ? "/cms/sessions" : "/cms";
  const backLabel = canSeeSessions ? "Сессии" : "CMS";
  const userLabel = principal.display_name ?? principal.username;
  const showSessionTabs = typeof chatId === "number" && Number.isFinite(chatId);

  return (
    <>
      <header className="pt-safe">
        <div className="flex min-h-14 w-full items-center gap-2 overflow-x-auto px-3 py-2 sm:gap-3 sm:px-4 lg:px-6">
          <BackLink
            to={backTo}
            label={backLabel}
            size="sm"
            className="shrink-0"
          />

          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <div className="min-w-0 flex-1">
              <SessionTitleEditor
                title={title}
                onRename={onRename}
                busy={Boolean(renameBusy)}
              />
            </div>
            {showSessionTabs ? (
              <SessionTabsSegment chatId={chatId} />
            ) : null}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
            {trailingActions}
            {inviteUrl ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={copyInvite}
                className="hidden md:inline-flex"
              >
                {copied ? "Скопировано" : "Invite"}
              </Button>
            ) : null}
            {onFinishSession ? (
              <Button
                size="sm"
                variant="danger"
                onClick={onFinishSession}
                loading={Boolean(finishBusy)}
                className="hidden md:inline-flex"
              >
                Завершить
              </Button>
            ) : null}
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Меню сессии"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface text-ink transition-colors hover:bg-line2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/40 active:scale-[0.96] motion-reduce:active:scale-100 md:inline-flex"
            >
              <DotsIcon />
            </button>
          </div>
        </div>

      </header>

      <BottomSheet
        open={menuOpen}
        onClose={() => {
          setMenuOpen(false);
          setRenameOpen(false);
        }}
        title={renameOpen ? "Переименовать сессию" : "Меню сессии"}
        description={
          renameOpen
            ? "Название видно участникам и в CMS"
            : `Вы вошли как ${userLabel}`
        }
        footer={
          renameOpen ? (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setRenameOpen(false)} disabled={Boolean(renameBusy)}>
                Назад
              </Button>
              <Button
                variant="primary"
                disabled={!renameValue.trim() || renameValue.trim() === title || Boolean(renameBusy)}
                loading={Boolean(renameBusy)}
                onClick={() => {
                  if (!onRename) return;
                  void onRename(renameValue.trim()).then((ok) => {
                    if (ok) {
                      setMenuOpen(false);
                      setRenameOpen(false);
                    }
                  });
                }}
              >
                Сохранить
              </Button>
            </div>
          ) : undefined
        }
      >
        {renameOpen ? (
          <form
            className="px-3 pb-3 pt-1"
            onSubmit={(event) => {
              event.preventDefault();
              if (!onRename || !renameValue.trim() || renameValue.trim() === title || renameBusy) return;
              void onRename(renameValue.trim()).then((ok) => {
                if (ok) {
                  setMenuOpen(false);
                  setRenameOpen(false);
                }
              });
            }}
          >
            <input
              autoFocus
              value={renameValue}
              maxLength={120}
              onChange={(event) => setRenameValue(event.target.value)}
              onFocus={(event) => keepFocusedFieldVisible(event.currentTarget)}
              aria-label="Название сессии"
              className="w-full rounded-md border border-line bg-surface px-3 py-2.5 text-base font-medium text-ink outline-none ring-blue/30 focus:ring-2"
            />
            <p className="mt-2 text-xs text-ink3">Максимум 120 символов.</p>
          </form>
        ) : (
          <div className="space-y-0.5 px-2 pb-2">
            {onRename ? (
              <SheetItem
                icon={<PencilIcon />}
                label="Переименовать сессию"
                description={title || "Без названия"}
                onClick={() => setRenameOpen(true)}
              />
            ) : null}
            {inviteUrl ? (
              <div className="md:hidden">
                <SheetItem
                  icon={<LinkIcon />}
                  label={copied ? "Invite скопирован" : "Скопировать invite"}
                  onClick={() => {
                    void copyInvite();
                  }}
                />
              </div>
            ) : null}
            {onFinishSession ? (
              <div className="md:hidden">
                <SheetItem
                  icon={<StopIcon />}
                  label="Завершить сессию"
                  tone="danger"
                  onClick={() => {
                    setMenuOpen(false);
                    onFinishSession();
                  }}
                />
              </div>
            ) : null}
            <ThemeMenuControl />
          </div>
        )}
      </BottomSheet>
    </>
  );
}

function SessionTitleEditor({
  title,
  onRename,
  busy,
}: {
  title: string;
  onRename?: (title: string) => Promise<boolean>;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  useEffect(() => {
    if (!editing) return undefined;
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [editing]);

  if (!onRename) {
    return (
      <div className="min-w-0">
        <h1
          className="truncate text-sm font-bold text-ink md:text-base"
          title={`Название сессии: ${title}`}
        >
          {title}
        </h1>
      </div>
    );
  }

  async function commit() {
    if (!onRename) return;
    const next = draft.trim();
    if (!next || next === title) {
      setDraft(title);
      setEditing(false);
      return;
    }
    const ok = await onRename(next);
    if (ok) {
      setEditing(false);
    } else {
      setDraft(title);
    }
  }

  function cancel() {
    setDraft(title);
    setEditing(false);
  }

  if (editing) {
    return (
      <form
        className="min-w-0"
        onSubmit={(event) => {
          event.preventDefault();
          void commit();
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={(event) => keepFocusedFieldVisible(event.currentTarget)}
            onBlur={() => { void commit(); }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancel();
              }
            }}
            disabled={busy}
            maxLength={120}
            aria-label="Название сессии"
            title="Название сессии"
            className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 text-sm font-bold text-ink outline-none ring-blue/30 focus:ring-2 md:text-base"
          />
          {busy ? <Spinner size="sm" /> : null}
        </div>
      </form>
    );
  }

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Название сессии. Нажмите, чтобы переименовать"
        className="group flex min-w-0 max-w-full items-center gap-1 rounded-md px-0.5 text-left transition hover:bg-line2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/40"
      >
        <span className="hidden shrink-0 text-[11px] font-semibold uppercase tracking-wide text-ink3 sm:inline">
          Название
        </span>
        <span
          className="min-w-0 truncate text-sm font-bold text-ink md:text-base"
          title={title}
        >
          {title}
        </span>
        <PencilIcon
          className="h-3.5 w-3.5 shrink-0 text-ink3 opacity-70 group-hover:opacity-100"
        />
      </button>
    </div>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 14.25V17h2.75L14.81 7.94l-2.75-2.75L3 14.25z" />
      <path d="M14.06 4.94l1.41-1.41a1.5 1.5 0 0 1 2.12 0l.88.88a1.5 1.5 0 0 1 0 2.12L17.06 7.94" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <circle cx="4.5" cy="10" r="1.5" />
      <circle cx="10" cy="10" r="1.5" />
      <circle cx="15.5" cy="10" r="1.5" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M8.5 11.5a3 3 0 0 0 4.243 0l2-2a3 3 0 1 0-4.243-4.243L9.5 6.25" />
      <path d="M11.5 8.5a3 3 0 0 0-4.243 0l-2 2a3 3 0 0 0 4.243 4.243L10.5 13.75" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <rect x="5" y="5" width="10" height="10" rx="1.5" />
    </svg>
  );
}
