import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Badge, BackLink, BrandHomeLink, Button, Spinner, ThemeToggle } from "../../design-system";
import type { CmsPrincipal } from "../cms/api/cmsTypes";
import { CMS_PERMISSIONS, hasPermission } from "../cms/navigation";

/**
 * Manager cockpit header.
 *
 * Two layouts, one component:
 *  - Mobile (< md): BrandMark icon · editable title · "•••" menu.
 *    All action buttons (copy invite, finish, theme, user) move to
 *    `ManagerBottomDock` / a bottom sheet.
 *  - Desktop (≥ md): the full action group is restored on the right.
 *
 * The mobile "•••" button calls `onOpenMenu` so the consumer can decide
 * what to render — this header doesn't own the sheet itself (keeps the
 * z-index/scroll-lock logic in one place at the page level).
 */
export function ManagerTopBar({
  principal,
  title = "Planning Poker",
  inviteUrl,
  onFinishSession,
  finishBusy,
  onRename,
  renameBusy,
  onOpenMenu,
  onLogoClick,
}: {
  principal: CmsPrincipal;
  title?: string;
  inviteUrl?: string;
  onFinishSession?: () => void;
  finishBusy?: boolean;
  onRename?: (title: string) => Promise<boolean>;
  renameBusy?: boolean;
  onOpenMenu?: () => void;
  onLogoClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const [copied, setCopied] = useState(false);
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
  // Unified back-label across detail screens: "К <раздел>".
  const backLabel = canSeeSessions ? "К сессиям" : "В CMS";
  const userLabel = principal.display_name ?? principal.username;
  return (
    <header className="pt-safe">
      <div className="flex min-h-14 w-full items-center gap-2 px-3 py-2 sm:px-4 md:min-h-16 md:gap-3 lg:px-6">
        {/* Brand is icon-only on mobile so the editable title has room to breathe. */}
        <BrandHomeLink size="sm" showWordmark={false} className="shrink-0" onClick={onLogoClick} />

        {/* Middle: editable title. Wraps instead of hiding the full
            session name. Uses min-w-0 so flex children don't push the
            cluster off-screen at 320px. */}
        <div className="min-w-0 flex-1">
          <SessionTitleEditor title={title} onRename={onRename} busy={Boolean(renameBusy)} />
        </div>

        {/* Right cluster: desktop action group + a single mobile menu
            button. We never render Finish or Copy-invite on mobile —
            those live in the bottom dock so the header stays a
            single, stable 56px row. */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          {inviteUrl ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={copyInvite}
              className="hidden md:inline-flex"
            >
              {copied ? "Скопировано" : "Скопировать invite"}
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
          <ThemeToggle className="hidden md:inline-flex" />
          <Badge tone="info" className="hidden md:inline-flex">{userLabel}</Badge>

          {/* Mobile-only overflow trigger. The same set of actions
              appears here (rename, theme, leave) plus the user
              identity row, so nothing is lost when the desktop
              buttons hide. */}
          {onOpenMenu ? (
            <button
              type="button"
              onClick={onOpenMenu}
              aria-label="Открыть меню"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-line bg-surface text-ink transition-colors hover:bg-line2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/40 active:scale-[0.96] motion-reduce:active:scale-100 md:hidden"
            >
              <DotsIcon />
            </button>
          ) : null}
        </div>
      </div>
      <div className="flex w-full border-t border-line/70 px-3 py-1.5 sm:px-4 lg:px-6">
        <BackLink to={backTo} label={backLabel} size="sm" className="shrink-0" />
      </div>
    </header>
  );
}

/**
 * Click-to-edit session title in the manager TopBar. Single-line input,
 * commits on Enter or blur (when value changed), cancels on Escape. The
 * resolved title is propagated upstream so it lands on `cms_sessions.title`
 * and the CMS shows the same friendly name.
 *
 * When no `onRename` is provided (e.g. legacy callers) the component falls
 * back to a static heading so the existing layout is unaffected.
 */
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
    if (editing) {
      const id = window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [editing]);

  if (!onRename) {
    return <h1 className="break-words text-sm font-bold leading-snug text-ink md:text-base">{title}</h1>;
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
        className="flex min-w-0 items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void commit();
        }}
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
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
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 text-sm font-bold text-ink outline-none ring-blue/30 focus:ring-2 md:text-base"
        />
        {busy ? <Spinner size="sm" /> : null}
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Кликните, чтобы переименовать"
      className="group flex min-w-0 max-w-full items-start gap-1.5 rounded-md -mx-1 px-1 text-left transition hover:bg-line2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/40"
    >
      <span className="min-w-0 whitespace-normal break-words text-sm font-bold leading-snug text-ink md:text-base">{title}</span>
      <PencilIcon className="mt-0.5 hidden h-3.5 w-3.5 shrink-0 text-ink3 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100 md:inline-block" />
    </button>
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
