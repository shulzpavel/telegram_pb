import { arrayMove } from "@dnd-kit/sortable";

export const SCOPE_LAYOUT_BLOCK_KEYS = [
  "topItems",
  "capacity",
  "roleWorkload",
  "planInsights",
  "aiSummary",
  "report",
  "priorityQueues",
  "activity",
  "snapshotSections",
  "settings",
] as const;

export type ScopeLayoutBlockKey = (typeof SCOPE_LAYOUT_BLOCK_KEYS)[number];

export const DEFAULT_SCOPE_LAYOUT_ORDER: ScopeLayoutBlockKey[] = [...SCOPE_LAYOUT_BLOCK_KEYS];

export function isScopeLayoutBlockKey(value: string): value is ScopeLayoutBlockKey {
  return (SCOPE_LAYOUT_BLOCK_KEYS as readonly string[]).includes(value);
}

export function mergeScopeLayoutOrder(
  saved: string[] | null | undefined,
  visibleKeys?: ScopeLayoutBlockKey[],
): ScopeLayoutBlockKey[] {
  const known = new Set<string>(SCOPE_LAYOUT_BLOCK_KEYS);
  const result: ScopeLayoutBlockKey[] = [];
  const seen = new Set<string>();

  for (const key of saved ?? []) {
    if (typeof key !== "string" || !known.has(key) || seen.has(key)) continue;
    result.push(key as ScopeLayoutBlockKey);
    seen.add(key);
  }

  for (const key of DEFAULT_SCOPE_LAYOUT_ORDER) {
    if (!seen.has(key)) {
      result.push(key);
    }
  }

  if (!visibleKeys) return result;
  return result.filter((key) => visibleKeys.includes(key));
}

export function reorderScopeLayoutOrder(
  fullOrder: ScopeLayoutBlockKey[],
  visibleKeys: ScopeLayoutBlockKey[],
  activeId: string,
  overId: string,
): ScopeLayoutBlockKey[] {
  const visibleOrder = fullOrder.filter((key) => visibleKeys.includes(key));
  const oldIndex = visibleOrder.indexOf(activeId as ScopeLayoutBlockKey);
  const newIndex = visibleOrder.indexOf(overId as ScopeLayoutBlockKey);
  if (oldIndex < 0 || newIndex < 0) return fullOrder;

  const nextVisible = arrayMove(visibleOrder, oldIndex, newIndex);
  let visibleIndex = 0;
  return fullOrder.map((key) => (visibleKeys.includes(key) ? nextVisible[visibleIndex++]! : key));
}
