import { useMemo, useState } from "react";
import { Badge, Button, Spinner, TextareaField } from "../../../design-system";
import type { ScopeBoardSnapshot, ScopeTopItem } from "../api/cmsClient";
import { TextWithLinks } from "./textWithLinks";

const MAX_TOP_ITEMS = 10;

export function ScopeTopItemsSection({
  snapshot,
  canManage,
  onAddItem,
  onRemoveItem,
}: {
  snapshot: ScopeBoardSnapshot;
  canManage: boolean;
  onAddItem: (text: string) => Promise<void>;
  onRemoveItem: (itemId: string) => Promise<void>;
}) {
  const items = useMemo(() => sortTopItems(snapshot.top_items ?? []), [snapshot.top_items]);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const atLimit = items.length >= MAX_TOP_ITEMS;

  async function handleAdd() {
    const text = draft.trim();
    if (!text || adding || atLimit) return;
    setAdding(true);
    try {
      await onAddItem(text);
      setDraft("");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(itemId: string) {
    if (removingId) return;
    setRemovingId(itemId);
    try {
      await onRemoveItem(itemId);
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <details className="scope-collapsible-card group overflow-hidden rounded-2xl">
      <summary className="scope-section-header cursor-pointer list-none rounded-2xl px-4 py-3 marker:content-none sm:px-5 group-open:rounded-b-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink">Топ-10 вопросов и задач</span>
            <Badge tone={items.length > 0 ? "info" : "neutral"}>{items.length}/{MAX_TOP_ITEMS}</Badge>
          </div>
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-ink">
            <span className="group-open:hidden">Показать</span>
            <span className="hidden group-open:inline">Скрыть</span>
            <span className="scope-section-header-icon inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-transform group-open:rotate-180">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z" />
              </svg>
            </span>
          </span>
        </div>
      </summary>

      <div className="space-y-4 pt-4">
        <div className="rounded-2xl bg-blue/[0.05] px-4 py-3">
          <p className="text-sm font-medium text-ink">Если отчёт будет огромный</p>
          <p className="mt-1 text-sm text-ink2">
            Оставьте здесь только главное для бизнеса: ключевые вопросы, риски и задачи, которые нужно обсудить на
            встрече. Не больше 10 пунктов.
          </p>
        </div>

        {items.length > 0 ? (
          <ol className="space-y-3">
            {items.map((item, index) => (
              <TopItemCard
                key={item.id}
                index={index + 1}
                item={item}
                canManage={canManage}
                removing={removingId === item.id}
                onRemove={() => void handleRemove(item.id)}
              />
            ))}
          </ol>
        ) : (
          <p className="rounded-2xl bg-line2/40 px-4 py-6 text-center text-sm text-ink3">
            Пока нет пунктов — добавьте первый вопрос или задачу для бизнеса.
          </p>
        )}

        {canManage ? (
          <div className="rounded-2xl bg-bg/70 px-3 py-3">
            <TextareaField
              label="Новый пункт"
              rows={2}
              value={draft}
              disabled={adding || atLimit}
              placeholder="Например: Нужно решение по https://jira…/browse/FLEX-123 до пятницы"
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-ink3">
                {atLimit ? "Достигнут лимит 10 пунктов — удалите один, чтобы добавить новый." : "Пункт появится в списке сразу после добавления."}
              </span>
              <Button size="sm" variant="ghost" disabled={adding || atLimit || draft.trim().length === 0} onClick={() => void handleAdd()}>
                {adding ? <Spinner size="sm" /> : null}
                Добавить
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}

function TopItemCard({
  index,
  item,
  canManage,
  removing,
  onRemove,
}: {
  index: number;
  item: ScopeTopItem;
  canManage: boolean;
  removing: boolean;
  onRemove: () => void;
}) {
  const createdLabel = formatTopItemTime(item.created_at);
  const author = item.created_by?.trim();

  return (
    <li className="flex gap-3 rounded-2xl bg-bg/70 px-3 py-3 sm:px-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue/10 text-sm font-bold text-blue">
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <TextWithLinks text={item.text} className="text-sm font-medium text-ink" />
        {author || createdLabel ? (
          <p className="mt-1 text-xs text-ink3">
            {author ? author : null}
            {author && createdLabel ? " · " : null}
            {createdLabel ? createdLabel : null}
          </p>
        ) : null}
      </div>
      {canManage ? (
        <Button size="sm" variant="ghost" disabled={removing} onClick={onRemove}>
          {removing ? <Spinner size="sm" /> : "Удалить"}
        </Button>
      ) : null}
    </li>
  );
}

function sortTopItems(items: ScopeTopItem[]): ScopeTopItem[] {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(left.created_at || "");
    const rightTime = Date.parse(right.created_at || "");
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return left.id.localeCompare(right.id);
  });
}

function formatTopItemTime(iso: string | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}
