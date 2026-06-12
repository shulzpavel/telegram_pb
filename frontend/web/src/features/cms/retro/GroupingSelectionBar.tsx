import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Badge, Button, TextField, motionTokens } from "../../../design-system";
import { groupCreationHint } from "./retroLogic";

/**
 * Floating contextual action bar (Gmail/Photos selection pattern): appears
 * pinned to the bottom of the viewport while the manager is selecting cards,
 * so the group can be named and created without scrolling back to the top.
 */
export function GroupingSelectionBar({
  selectedCount,
  title,
  busy,
  onTitleChange,
  onCreate,
  onClear,
}: {
  selectedCount: number;
  title: string;
  busy: boolean;
  onTitleChange: (value: string) => void;
  onCreate: () => void;
  onClear: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const hint = groupCreationHint(selectedCount, title);
  const canCreate = hint === null && !busy;

  return (
    <AnimatePresence>
      {selectedCount > 0 ? (
        <motion.div
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
          transition={{ duration: motionTokens.base, ease: motionTokens.ease }}
          className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3 sm:px-4 sm:pb-4"
        >
          <div
            role="region"
            aria-label="Группировка выбранных карточек"
            className="pointer-events-auto w-full max-w-2xl rounded-2xl border border-line bg-surface/95 p-3 shadow-card backdrop-blur"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Badge tone={selectedCount >= 2 ? "info" : "neutral"}>Выбрано: {selectedCount}</Badge>
              <TextField
                className="min-w-0 flex-1"
                aria-label="Название группы"
                reserveMessageSpace={false}
                placeholder="Название группы, например: Проблемы с релизами"
                value={title}
                disabled={busy}
                onChange={(event) => onTitleChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && canCreate) {
                    event.preventDefault();
                    onCreate();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    onClear();
                  }
                }}
              />
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="primary" size="sm" onClick={onCreate} disabled={!canCreate} loading={busy}>
                  Сгруппировать
                </Button>
                <Button variant="ghost" size="sm" onClick={onClear} disabled={busy}>
                  Сбросить
                </Button>
              </div>
            </div>
            <p className="mt-1.5 text-xs text-ink3" aria-live="polite">
              {hint ?? "Команда будет голосовать за группу целиком."}
            </p>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
