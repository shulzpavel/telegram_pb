import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Badge, Button, CheckboxField, Surface, TextField } from "../../../design-system";
import type { ScopeTodoItem } from "../api/cmsClient";

interface TodoPosition {
  x: number;
  y: number;
}

const PANEL_WIDTH = 360;
const PANEL_HEIGHT = 420;
const EDGE_PADDING = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function defaultPosition(): TodoPosition {
  if (typeof window === "undefined") {
    return { x: 720, y: 120 };
  }
  return {
    x: Math.max(EDGE_PADDING, window.innerWidth - PANEL_WIDTH - 32),
    y: 128,
  };
}

function readJson<T>(key: string, fallback: T): T {
  try {
    if (typeof window === "undefined") return fallback;
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local notes should never break the report page.
  }
}

export function ScopeFloatingTodo({
  boardId,
  items,
  onAdd,
  onToggle,
  onDelete,
}: {
  boardId: number;
  items: ScopeTodoItem[];
  onAdd: (text: string) => Promise<void>;
  onToggle: (itemId: string, done: boolean) => Promise<void>;
  onDelete: (itemId: string) => Promise<void>;
}) {
  const storagePrefix = useMemo(() => `cms.scope.todo.${boardId}`, [boardId]);
  const openKey = `${storagePrefix}.open`;
  const positionKey = `${storagePrefix}.position`;

  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(() => readJson<boolean>(openKey, false));
  const [position, setPosition] = useState<TodoPosition>(() => readJson<TodoPosition>(positionKey, defaultPosition()));
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);

  useEffect(() => writeJson(openKey, open), [open, openKey]);
  useEffect(() => writeJson(positionKey, position), [position, positionKey]);

  useEffect(() => {
    function handleResize() {
      setPosition((current) => ({
        x: clamp(current.x, EDGE_PADDING, Math.max(EDGE_PADDING, window.innerWidth - PANEL_WIDTH - EDGE_PADDING)),
        y: clamp(current.y, EDGE_PADDING, Math.max(EDGE_PADDING, window.innerHeight - PANEL_HEIGHT - EDGE_PADDING)),
      }));
    }
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  async function addItem() {
    const text = draft.trim();
    if (!text || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onAdd(text);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Todo не сохранён");
    } finally {
      setSaving(false);
    }
  }

  async function toggleItem(item: ScopeTodoItem) {
    if (pendingIds.has(item.id)) return;
    setPendingIds((current) => new Set(current).add(item.id));
    setError(null);
    try {
      await onToggle(item.id, !item.done);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Todo не обновлён");
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function removeItem(id: string) {
    if (pendingIds.has(id)) return;
    setPendingIds((current) => new Set(current).add(id));
    setError(null);
    try {
      await onDelete(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Todo не удалён");
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - position.x,
      offsetY: event.clientY - position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPosition({
      x: clamp(event.clientX - drag.offsetX, EDGE_PADDING, Math.max(EDGE_PADDING, window.innerWidth - PANEL_WIDTH - EDGE_PADDING)),
      y: clamp(event.clientY - drag.offsetY, EDGE_PADDING, Math.max(EDGE_PADDING, window.innerHeight - PANEL_HEIGHT - EDGE_PADDING)),
    });
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }

  const activeCount = items.filter((item) => !item.done).length;
  const panelStyle: CSSProperties = { left: position.x, top: position.y, width: PANEL_WIDTH };

  if (!open) {
    return (
      <div className="scope-no-print fixed bottom-5 right-5 z-40 hidden md:block">
        <Button variant="secondary" className="border-amber/30 bg-surface" onClick={() => setOpen(true)}>
          <span className="inline-flex h-2 w-2 rounded-full bg-amber" aria-hidden="true" />
          Мини todo
          {activeCount > 0 ? <Badge tone="warning">{activeCount}</Badge> : null}
        </Button>
      </div>
    );
  }

  return (
    <Surface
      className="scope-no-print fixed z-40 hidden max-h-[min(70vh,420px)] overflow-hidden border-line bg-surface p-0 ring-1 ring-amber/20 md:block"
      style={panelStyle}
      aria-label="Мини todo"
    >
      <div className="h-1 bg-amber/70" aria-hidden="true" />
      <div
        className="scope-section-header flex cursor-move touch-none items-center justify-between gap-3 px-4 py-3"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2 w-2 rounded-full bg-amber" aria-hidden="true" />
            <p className="text-sm font-semibold text-ink">Мини todo</p>
            {activeCount > 0 ? <Badge tone="warning">{activeCount}</Badge> : null}
          </div>
          <p className="scope-section-header-subtitle mt-1 text-xs">Короткие действия по ходу отчёта</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="cursor-pointer text-xs"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setOpen(false)}
        >
          Свернуть
        </Button>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex gap-2 rounded-xl bg-bg/70 p-2">
          <TextField
            aria-label="Новая todo задача"
            placeholder="Что записать?"
            value={draft}
            reserveMessageSpace={false}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void addItem();
              }
            }}
          />
          <Button size="sm" variant="primary" loading={saving} onClick={() => void addItem()} disabled={draft.trim().length === 0}>
            Добавить
          </Button>
        </div>
        {error ? <p className="rounded-md border border-red/20 bg-red/5 px-2 py-1.5 text-xs text-red">{error}</p> : null}

        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-bg/50 px-3 py-7 text-center text-sm text-ink3">
            Запишите короткие действия по ходу отчёта.
          </p>
        ) : (
          <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {items.map((item) => (
              <li key={item.id} className="flex items-start gap-1 rounded-xl bg-bg/70 px-2 py-1.5">
                <CheckboxField
                  className="min-w-0 flex-1 hover:bg-transparent"
                  checked={item.done}
                  disabled={pendingIds.has(item.id)}
                  onChange={() => void toggleItem(item)}
                  label={
                    <span className={item.done ? "text-ink3 line-through" : "text-ink"}>
                      {item.text}
                    </span>
                  }
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-0.5 min-h-8 px-2 text-xs text-ink3 hover:text-red"
                  disabled={pendingIds.has(item.id)}
                  onClick={() => void removeItem(item.id)}
                >
                  Удалить
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Surface>
  );
}
