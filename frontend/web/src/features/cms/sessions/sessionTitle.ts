import type { SessionItem } from "../api/cmsTypes";

/**
 * Returns a human-readable session label. Falls back to `Сессия #<id>` when
 * the manager has not set a title yet — the legacy `session_key` (a long
 * negative chat_id) is never user-friendly enough to surface as a name.
 */
export function displaySessionTitle(
  item: Pick<SessionItem, "title" | "id">
): string {
  const trimmed = (item.title ?? "").trim();
  if (trimmed) return trimmed;
  return `Сессия #${item.id}`;
}

/**
 * Short technical chip for badges/secondary lines: shows only the last
 * significant digits of chat_id so we never expose a long negative id.
 */
export function sessionKeyChip(
  item: Pick<SessionItem, "chat_id">
): string {
  const num = Math.abs(item.chat_id).toString();
  const tail = num.length > 6 ? num.slice(-6) : num;
  return `#${tail}`;
}
