const LOAD_MORE_LABEL = "Показать ещё";
const MAX_LOAD_MORE_ROUNDS = 100;

function expandDetails(root: HTMLElement): HTMLDetailsElement[] {
  const opened: HTMLDetailsElement[] = [];
  root.querySelectorAll("details").forEach((element) => {
    if (element instanceof HTMLDetailsElement && !element.open) {
      element.open = true;
      opened.push(element);
    }
  });
  return opened;
}

function expandIncrementalLists(root: HTMLElement): void {
  for (let round = 0; round < MAX_LOAD_MORE_ROUNDS; round += 1) {
    const buttons = Array.from(root.querySelectorAll("button")).filter(
      (button) => button.textContent?.trim() === LOAD_MORE_LABEL && !button.disabled
    );
    if (buttons.length === 0) break;
    buttons.forEach((button) => button.click());
  }
}

/** Opens collapsed sections and triggers the browser print dialog (Save as PDF). */
export function printScopeReport(root: HTMLElement | null): void {
  if (typeof window === "undefined") return;

  const html = document.documentElement;
  const previousTheme = html.getAttribute("data-theme");
  html.setAttribute("data-theme", "light");

  const openedDetails = root ? expandDetails(root) : [];
  if (root) {
    expandIncrementalLists(root);
  }

  document.body.classList.add("scope-print-mode");

  const cleanup = () => {
    document.body.classList.remove("scope-print-mode");
    openedDetails.forEach((details) => {
      details.open = false;
    });
    if (previousTheme) {
      html.setAttribute("data-theme", previousTheme);
    } else {
      html.removeAttribute("data-theme");
    }
    window.removeEventListener("afterprint", cleanup);
  };

  window.addEventListener("afterprint", cleanup);
  window.print();
}
