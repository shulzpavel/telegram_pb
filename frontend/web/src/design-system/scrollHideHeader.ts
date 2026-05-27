export type ScrollDirection = "up" | "down" | "none";

/** Minimum scroll delta before we treat direction as intentional. */
export const SCROLL_HIDE_THRESHOLD_PX = 12;

export function resolveScrollDirection(
  previousY: number,
  currentY: number,
  threshold = SCROLL_HIDE_THRESHOLD_PX,
): ScrollDirection {
  const delta = currentY - previousY;
  if (Math.abs(delta) < threshold) return "none";
  return delta > 0 ? "down" : "up";
}

export function resolveHeaderVisible(
  direction: ScrollDirection,
  currentVisible: boolean,
  scrollY: number,
): boolean {
  if (scrollY <= 0) return true;
  if (direction === "up") return true;
  if (direction === "down") return false;
  return currentVisible;
}
