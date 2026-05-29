import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { UNSAFE_NavigationContext, useNavigate } from "react-router-dom";
import { ConfirmDialog } from "../../../design-system";

interface UnsavedChangesGuardOptions {
  when: boolean;
  title?: string;
  description?: ReactNode;
}

type PendingAction = () => void | Promise<void>;

/**
 * Guards in-progress create forms from accidental navigation.
 *
 * React Router's low-level navigator still exposes `block()` under
 * BrowserRouter. When it is unavailable, we still catch same-origin links and
 * native tab closing, while explicit buttons can call `confirmIfNeeded`.
 */
export function useUnsavedChangesGuard({
  when,
  title = "Покинуть страницу?",
  description = "Данные не сохранятся. Точно хотите перейти на другую страницу?",
}: UnsavedChangesGuardOptions) {
  const navigate = useNavigate();
  const { navigator } = useContext(UNSAFE_NavigationContext);
  const [open, setOpen] = useState(false);
  const pendingActionRef = useRef<PendingAction | null>(null);
  const bypassRef = useRef(false);

  const runWithoutPrompt = useCallback((action: PendingAction) => {
    bypassRef.current = true;
    const reset = () => {
      window.setTimeout(() => {
        bypassRef.current = false;
      }, 0);
    };
    const result = action();
    if (result && typeof (result as Promise<void>).finally === "function") {
      void (result as Promise<void>).finally(reset);
    } else {
      reset();
    }
    return result;
  }, []);

  const confirmIfNeeded = useCallback(
    (action: PendingAction) => {
      if (!when || bypassRef.current) {
        action();
        return;
      }
      pendingActionRef.current = action;
      setOpen(true);
    },
    [when],
  );

  const proceed = useCallback(() => {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    setOpen(false);
    if (action) runWithoutPrompt(action);
  }, [runWithoutPrompt]);

  const cancel = useCallback(() => {
    pendingActionRef.current = null;
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!when) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (bypassRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [when]);

  useEffect(() => {
    if (!when) return;
    const block = (navigator as { block?: (callback: (tx: { retry: () => void }) => void) => () => void }).block;
    if (typeof block !== "function") return;
    const unblock = block.call(navigator, (tx: { retry: () => void }) => {
      if (bypassRef.current) {
        tx.retry();
        return;
      }
      pendingActionRef.current = () => {
        unblock();
        tx.retry();
      };
      setOpen(true);
    });
    return unblock;
  }, [navigator, when]);

  useEffect(() => {
    if (!when) return;
    const hasRouterBlock =
      typeof (navigator as { block?: unknown }).block === "function";
    if (hasRouterBlock) return;

    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const nextPath = `${url.pathname}${url.search}${url.hash}`;
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextPath === currentPath) return;
      event.preventDefault();
      confirmIfNeeded(() => navigate(nextPath));
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [confirmIfNeeded, navigate, navigator, when]);

  const dialog = useMemo(
    () => (
      <ConfirmDialog
        open={open}
        title={title}
        description={description}
        confirmLabel="Покинуть"
        cancelLabel="Остаться"
        tone="danger"
        onConfirm={proceed}
        onCancel={cancel}
      />
    ),
    [cancel, description, open, proceed, title],
  );

  return { confirmIfNeeded, dialog, runWithoutPrompt };
}
