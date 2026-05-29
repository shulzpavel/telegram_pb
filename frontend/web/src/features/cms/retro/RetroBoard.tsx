import { useState } from "react";
import { Badge, Button, Surface, TextareaField } from "../../../design-system";
import {
  canAddToSection,
  cardsBySection,
  phaseLabel,
  type RetroLiveState,
} from "./retroLogic";

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {state.sections.map((section) => {
          const cards = grouped.get(section.section_id) ?? [];
          const isActive = state.active_section_id === section.section_id;
          const canWrite = Boolean(onAddCard) && canAddToSection(state, section.section_id);
          return (
            <Surface
              key={section.section_id}
              className={[
                "flex flex-col gap-3 p-4",
                isActive && state.phase === "collecting" ? "ring-2 ring-blue/40" : "",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-ink">{section.title}</h3>
                {isActive && state.phase === "collecting" ? (
                  <Badge tone="info">открыта</Badge>
                ) : state.phase === "collecting" ? (
                  <Badge tone="neutral">закрыта</Badge>
                ) : null}
              </div>

              {cards.length === 0 ? (
                <p className="text-xs text-ink4">Пока нет карточек</p>
              ) : (
                <ul className="space-y-2">
                  {cards.map((card) => {
                    const mine = myVotes?.has(card.card_id) ?? false;
                    const budgetBlocked =
                      !mine && typeof votesRemaining === "number" && votesRemaining <= 0;
                    const disabled = budgetBlocked || pendingVote !== null;
                    return (
                      <li
                        key={card.card_id}
                        className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="whitespace-pre-wrap break-words">{card.text}</span>
                          {voting && onToggleVote ? (
                            <button
                              type="button"
                              onClick={() => void vote(card.card_id)}
                              disabled={disabled}
                              aria-pressed={mine}
                              aria-label={`${mine ? "Убрать голос с карточки" : "Проголосовать за карточку"}, сейчас ${card.vote_count} голосов`}
                              className={[
                                "shrink-0 inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 text-xs font-semibold transition-colors",
                                mine
                                  ? "bg-blue text-white"
                                  : "border border-line text-ink3 hover:bg-line2",
                                disabled ? "cursor-not-allowed opacity-50" : "",
                              ].join(" ")}
                            >
                              ▲ {card.vote_count}
                            </button>
                          ) : (
                            <span className="shrink-0 text-xs font-semibold text-ink3">
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
        rows={2}
        reserveMessageSpace={false}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <Button variant="secondary" size="sm" onClick={() => void submit()} loading={busy} disabled={!text.trim()}>
        Добавить карточку
      </Button>
    </div>
  );
}
