import { useState } from "react";
import { Badge, Button, Surface, TextareaField } from "../../../design-system";
import {
  canAddToSection,
  cardsBySection,
  phaseLabel,
  type RetroLiveState,
} from "./retroLogic";
import { RetroAiView } from "./RetroAiView";

interface RetroBoardProps {
  state: RetroLiveState;
  /** Participant-only handlers. Omit for the read-only manager cockpit board. */
  myVotes?: Set<string>;
  votesRemaining?: number;
  onAddCard?: (sectionId: string, text: string) => Promise<boolean> | void;
  onToggleVote?: (cardId: string) => Promise<boolean> | void;
  countdown?: string | null;
}

export function RetroBoard({
  state,
  myVotes,
  votesRemaining,
  onAddCard,
  onToggleVote,
  countdown,
}: RetroBoardProps) {
  const grouped = cardsBySection(state);
  const voting = state.phase === "voting";
  const [pendingVote, setPendingVote] = useState<string | null>(null);

  async function vote(cardId: string) {
    if (!onToggleVote || pendingVote) return;
    setPendingVote(cardId);
    try {
      await onToggleVote(cardId);
    } finally {
      setPendingVote(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={state.phase === "done" ? "success" : "info"}>{phaseLabel(state.phase)}</Badge>
        <span className="text-sm text-ink3">Участников: {state.participants_count}</span>
        {voting && typeof votesRemaining === "number" ? (
          <Badge tone={votesRemaining > 0 ? "neutral" : "warning"}>
            Голосов осталось: {votesRemaining}
          </Badge>
        ) : null}
        {state.phase === "collecting" && countdown ? (
          <Badge tone={countdown === "0:00" ? "danger" : "neutral"}>Осталось: {countdown}</Badge>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {state.sections.map((section) => {
          const cards = grouped.get(section.section_id) ?? [];
          const isActive = state.active_section_id === section.section_id;
          const canWrite = Boolean(onAddCard) && canAddToSection(state, section.section_id);
          return (
            <Surface
              key={section.section_id}
              className={[
                "flex min-h-72 flex-col gap-4 p-4 sm:p-5",
                isActive && state.phase === "collecting" ? "ring-2 ring-blue/40" : "",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="min-w-0 text-base font-bold text-ink sm:text-lg">{section.title}</h3>
                {isActive && state.phase === "collecting" ? (
                  <Badge tone="info">открыта</Badge>
                ) : state.phase === "collecting" ? (
                  <Badge tone="neutral">закрыта</Badge>
                ) : null}
              </div>

              {cards.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink4">
                  Пока нет карточек
                </p>
              ) : (
                <ul className="space-y-3">
                  {cards.map((card) => {
                    const mine = myVotes?.has(card.card_id) ?? false;
                    const budgetBlocked =
                      !mine && typeof votesRemaining === "number" && votesRemaining <= 0;
                    const disabled = budgetBlocked || pendingVote !== null;
                    return (
                      <li
                        key={card.card_id}
                        className="min-h-24 rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                            {card.text}
                          </span>
                          {voting && onToggleVote ? (
                            <button
                              type="button"
                              onClick={() => void vote(card.card_id)}
                              disabled={disabled}
                              aria-pressed={mine}
                              aria-label={`${mine ? "Убрать голос с карточки" : "Проголосовать за карточку"}, сейчас ${card.vote_count} голосов`}
                              className={[
                                "inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-semibold transition-colors",
                                mine
                                  ? "bg-blue text-white"
                                  : "border border-line text-ink3 hover:bg-line2",
                                disabled ? "cursor-not-allowed opacity-50" : "",
                              ].join(" ")}
                            >
                              ▲ {card.vote_count}
                            </button>
                          ) : (
                            <span className="shrink-0 text-sm font-semibold text-ink3">
                              ▲ {card.vote_count}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {canWrite ? <AddCardForm onSubmit={(text) => onAddCard?.(section.section_id, text)} /> : null}
            </Surface>
          );
        })}
      </div>
    </div>
  );
}

function AddCardForm({ onSubmit }: { onSubmit: (text: string) => Promise<boolean> | void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const ok = await onSubmit(trimmed);
      if (ok !== false) setText("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <TextareaField
        label="Ваша мысль"
        hint="Cmd/Ctrl + Enter — добавить"
        placeholder="Ваша мысль…"
        value={text}
        rows={4}
        reserveMessageSpace={false}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <Button variant="secondary" onClick={() => void submit()} loading={busy} disabled={!text.trim()}>
        Добавить карточку
      </Button>
    </div>
  );
}

export function RetroOutcomesPanel({
  state,
  className = "",
  showAi = true,
}: {
  state: RetroLiveState;
  className?: string;
  showAi?: boolean;
}) {
  const hasActions = state.action_items.length > 0;
  const hasAi = showAi && state.ai_summary !== null;
  if (!hasActions && !hasAi) return null;

  return (
    <div className={["space-y-4", className].filter(Boolean).join(" ")}>
      {hasActions ? (
        <Surface className="space-y-3 p-4 sm:p-5">
          <h3 className="text-base font-bold text-ink">Выводы по ретро</h3>
          <ul className="space-y-2">
            {state.action_items.map((item) => (
              <li
                key={item.item_id}
                className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink2 sm:text-base"
              >
                <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{item.text}</span>
                {item.assignee ? <span className="ml-2 text-ink3">· {item.assignee}</span> : null}
              </li>
            ))}
          </ul>
        </Surface>
      ) : null}
      {hasAi ? <RetroAiView summary={state.ai_summary!} /> : null}
    </div>
  );
}
