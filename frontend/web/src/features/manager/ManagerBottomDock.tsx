import { useEffect, useState } from "react";
import { BottomSheet, Button, MobileBottomDock, SheetItem, ThemeMenuControl } from "../../design-system";
import { keepFocusedFieldVisible } from "../../design-system/mobileKeyboard";
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
  const [sheetMode, setSheetMode] = useState<"menu" | "rename" | null>(null);
  const [renameValue, setRenameValue] = useState(currentTitle);

  useEffect(() => {
    if (sheetMode === "rename") setRenameValue(currentTitle);
  }, [currentTitle, sheetMode]);

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
      <MobileBottomDock aria-label="Действия сессии" className="shrink-0" contentClassName="max-w-[1440px]">
          {inviteUrl ? (
            <Button
              variant={copied ? "success" : "primary"}
              size="md"
              className="flex-1 min-h-12"
              onClick={copyInvite}
            >
              <span className="shrink-0">{copied ? <CheckIcon /> : <LinkIcon />}</span>
              <span className="whitespace-normal break-words">{copied ? "Скопировано" : "Скопировать invite"}</span>
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
            onClick={() => setSheetMode("menu")}
            aria-label="Открыть меню"
            className="inline-flex min-h-12 w-12 items-center justify-center rounded-md border border-line bg-surface text-ink transition-colors hover:bg-line2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/40 active:scale-[0.96] motion-reduce:active:scale-100"
          >
            <DotsIcon />
          </button>
      </MobileBottomDock>

      <BottomSheet
        open={sheetMode !== null}
        onClose={() => setSheetMode(null)}
        title={sheetMode === "rename" ? "Переименовать сессию" : "Меню сессии"}
        description={
          sheetMode === "rename"
            ? "Название видно участникам и в CMS"
            : `Вы вошли как ${principal.display_name ?? principal.username}`
        }
        footer={
          sheetMode === "rename" ? (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setSheetMode("menu")} disabled={Boolean(renameBusy)}>Назад</Button>
              <Button
                variant="primary"
                disabled={!renameValue.trim() || renameValue.trim() === currentTitle || Boolean(renameBusy)}
                loading={Boolean(renameBusy)}
                onClick={() => {
                  if (!onRename) return;
                  void onRename(renameValue.trim()).then((ok) => {
                    if (ok) setSheetMode(null);
                  });
                }}
              >
                Сохранить
              </Button>
            </div>
          ) : undefined
        }
      >
        {sheetMode === "rename" ? (
          <form
            className="px-3 pb-3 pt-1"
            onSubmit={(event) => {
              event.preventDefault();
              if (!onRename || !renameValue.trim() || renameValue.trim() === currentTitle || renameBusy) return;
              void onRename(renameValue.trim()).then((ok) => {
                if (ok) setSheetMode(null);
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
                description={currentTitle || "Без названия"}
                onClick={() => setSheetMode("rename")}
              />
            ) : null}
            <ThemeMenuControl />
          </div>
        )}
      </BottomSheet>
    </>
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
