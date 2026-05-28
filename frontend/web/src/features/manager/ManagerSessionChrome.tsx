import { type ReactNode } from "react";
import type { CmsPrincipal } from "../cms/api/cmsTypes";
import { ManagerTopBar } from "./ManagerTopBar";

type ManagerSessionChromeProps = {
  principal: CmsPrincipal;
  title?: string;
  chatId?: number;
  inviteUrl?: string;
  onFinishSession?: () => void;
  finishBusy?: boolean;
  onRename?: (title: string) => Promise<boolean>;
  renameBusy?: boolean;
  trailingActions?: ReactNode;
};

/**
 * Sticky session header for cockpit + report. One block: back, editable title,
 * Управление/Отчёт tabs, primary actions, overflow menu. Height stays stable
 * while content scrolls so the cockpit does not jump.
 */
export function ManagerSessionChrome({
  trailingActions,
  chatId,
  ...topBarProps
}: ManagerSessionChromeProps) {
  return (
    <div
      className="sticky top-0 z-40 shrink-0 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85"
    >
      <ManagerTopBar
        {...topBarProps}
        chatId={chatId}
        trailingActions={trailingActions}
      />
    </div>
  );
}
