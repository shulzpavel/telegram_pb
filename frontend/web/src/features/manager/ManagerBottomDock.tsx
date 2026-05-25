import { useEffect, useState } from "react";
import { BottomSheet, Button, SheetItem, useTheme } from "../../design-system";
import type { CmsPrincipal } from "../cms/api/cmsTypes";

/**
 * Mobile-only sticky action dock for the manager cockpit.
 *
 * Why this exists: cramming "back / title / copy invite / finish /
 * theme toggle / user badge" into one row at 320px is what made the
 * old header break. Instead we keep the header lean (title + back +
 * single overflow trigger) and surface the real working actions in
 * a thumb-reachable strip at the bottom of the screen.
 *
 * Layout: three slots. Slot 1 is the primary CTA (Copy invite, since
 * sharing the link is the #1 mobile action for a fresh session).
 * Slot 2 only renders when there is something to finish — keeps the
 * destructive button out of the way otherwise. Slot 3 is always the
 * overflow menu (rename / theme / leave).
 *
 * Desktop hides the whole strip — the same actions live in
 * `ManagerTopBar` then.
 */
export function ManagerBottomDock({
  inviteUrl,
  onFinishSession,
  finishBusy,
  onRename,
  renameBusy,
  currentTitle,
  principal,
}: {
  inviteUrl?: string;
  onFinishSession?: () => void;
  finishBusy?: boolean;
  onRename?: (title: string) => Promise<boolean>;
  renameBusy?: boolean;
  currentTitle: string;
  principal: CmsPrincipal;
}) {
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);

  async function copyInvite() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(new URL(inviteUrl, window.location.origin).toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard rejected — silent */
    }
  }

  return (
    <>
      {/* The dock itself. `md:hidden` so it never reaches desktop; on
          mobile we use fixed positioning + safe-area inset so iOS
          home-indicator doesn't eat the buttons. `motion-safe`
          animation gives a small slide-up on first paint without
          impacting users with reduced motion. */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-3 pb-safe-4 pt-2 backdrop-blur md:hidden motion-safe:animate-fade-up"
        role="toolbar"
        aria-label="Действия сессии"
      >
        <div className="mx-auto flex max-w-[1440px] items-stretch gap-2">
          {inviteUrl ? (
            <Button
              variant={copied ? "success" : "primary"}
              size="md"
              className="flex-1 min-h-12"
              onClick={copyInvite}
            >
              <span className="shrink-0">{copied ? <CheckIcon /> : <LinkIcon />}</span>
              <span className="truncate">{copied ? "Скопировано" : "Скопировать invite"}</span>
            </Button>
          ) : null}
          {onFinishSession ? (
            <Button
              variant="danger"
              size="md"
              className="min-h-12 px-3"
              onClick={onFinishSession}
              loading={Boolean(finishBusy)}
              aria-label="Завершить сессию"
            >
              Завершить
            </Button>
          ) : null}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Открыть меню"
            className="inline-flex min-h-12 w-12 items-center justify-center rounded-md border border-line bg-surface text-ink transition-colors hover:bg-line2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/40 active:scale-[0.96] motion-reduce:active:scale-100"
          >
            <DotsIcon />
          </button>
        </div>
      </div>

      <BottomSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Меню сессии"
        description={`Вы вошли как ${principal.display_name ?? principal.username}`}
      >
        <div className="space-y-0.5 px-2 pb-2">
          {onRename ? (
            <SheetItem
              icon={<PencilIcon />}
              label="Переименовать сессию"
              description={currentTitle || "Без названия"}
              onClick={() => {
                setMenuOpen(false);
                setRenameOpen(true);
              }}
            />
          ) : null}
          <ThemeChooser />
        </div>
      </BottomSheet>

      <RenameSheet
        open={renameOpen}
        title={currentTitle}
        busy={Boolean(renameBusy)}
        onClose={() => setRenameOpen(false)}
        onSubmit={async (next) => {
          if (!onRename) return true;
          const ok = await onRename(next);
          if (ok) setRenameOpen(false);
          return ok;
        }}
      />
    </>
  );
}

/**
 * Inline theme picker rendered as three radio-style rows in the
 * sheet. Reads/writes via `useTheme`, so dark/light/system stays in
 * sync with the rest of the app and the persisted CMS preference.
 */
function ThemeChooser() {
  const { mode, setMode } = useTheme();
  const options: Array<{ value: "light" | "dark" | "system"; label: string; icon: JSX.Element }> = [
    { value: "light", label: "Светлая", icon: <SunIcon /> },
    { value: "dark", label: "Тёмная", icon: <MoonIcon /> },
    { value: "system", label: "Системная", icon: <DeviceIcon /> },
  ];
  return (
    <div className="rounded-lg border border-line bg-canvas/40 px-1 py-1">
      <p className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-ink3">Тема интерфейса</p>
      <div className="mt-1 space-y-0.5">
        {options.map((option) => (
          <SheetItem
            key={option.value}
            icon={option.icon}
            label={option.label}
            trailing={mode === option.value ? <CheckIcon /> : undefined}
            onClick={() => setMode(option.value)}
          />
        ))}
      </div>
    </div>
  );
}

function RenameSheet({
  open,
  title,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (next: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState(title);

  useEffect(() => {
    if (open) setValue(title);
  }, [open, title]);

  const trimmed = value.trim();
  const dirty = trimmed.length > 0 && trimmed !== title;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Переименовать сессию"
      description="Название видно участникам и в CMS"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Отменить</Button>
          <Button
            variant="primary"
            disabled={!dirty || busy}
            loading={busy}
            onClick={() => { void onSubmit(trimmed); }}
          >
            Сохранить
          </Button>
        </div>
      }
    >
      <form
        className="px-3 pb-3 pt-1"
        onSubmit={(event) => {
          event.preventDefault();
          if (!dirty || busy) return;
          void onSubmit(trimmed);
        }}
      >
        <input
          autoFocus
          value={value}
          maxLength={120}
          onChange={(event) => setValue(event.target.value)}
          aria-label="Название сессии"
          className="w-full rounded-md border border-line bg-surface px-3 py-2.5 text-base font-medium text-ink outline-none ring-blue/30 focus:ring-2"
        />
        <p className="mt-2 text-xs text-ink3">Максимум 120 символов.</p>
      </form>
    </BottomSheet>
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

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M4 10.5L8 14.5L16 6" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M3 14.25V17h2.75L14.81 7.94l-2.75-2.75L3 14.25z" />
      <path d="M14.06 4.94l1.41-1.41a1.5 1.5 0 0 1 2.12 0l.88.88a1.5 1.5 0 0 1 0 2.12L17.06 7.94" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <circle cx="10" cy="10" r="3" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M16 11.5a6.5 6.5 0 1 1-7.5-7.5 5 5 0 0 0 7.5 7.5z" />
    </svg>
  );
}

function DeviceIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <rect x="3" y="4" width="14" height="9" rx="1.5" />
      <path d="M7 17h6M10 13v4" />
    </svg>
  );
}
