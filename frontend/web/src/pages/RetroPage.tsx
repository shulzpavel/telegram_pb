import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AutoHideAppHeader, Alert, BrandHomeLink, Spinner, ThemeToggle } from "../design-system";
import { RetroBoard, RetroOutcomesPanel } from "../features/cms/retro/RetroBoard";
import { formatCountdown, phaseLabel } from "../features/cms/retro/retroLogic";
import { useRetro } from "../features/cms/retro/useRetro";

export default function RetroPage() {
  const { token } = useParams<{ token: string }>();
  if (!token) {
    return (
      <Shell>
        <Alert tone="danger">Неверная ссылка на ретро.</Alert>
      </Shell>
    );
  }
  return <RetroInner token={token} />;
}

function RetroInner({ token }: { token: string }) {
  const { state, phase, myVotes, votesRemaining, join, addCard, toggleVote, error } = useRetro(token, {
    participant: true,
  });
  const [now, setNow] = useState(Date.now());

  void join;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!state) {
    return (
      <Shell>
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : (
          <div className="flex flex-col items-center gap-3 py-10">
            <Spinner size="lg" />
            <p className="text-sm text-ink3">
              {phase === "joining" ? "Подключаем к ретро…" : "Подключение к ретро…"}
            </p>
          </div>
        )}
      </Shell>
    );
  }

  const countdown = formatCountdown(state.section_deadline, now);

  return (
    <Shell title={state.title} subtitle={phaseLabel(state.phase)}>
      {error ? <Alert tone="warning" className="mb-4">{error}</Alert> : null}
      <PhaseHint phase={state.phase} />
      <RetroBoard
        state={state}
        myVotes={myVotes}
        votesRemaining={votesRemaining}
        onAddCard={addCard}
        onToggleVote={toggleVote}
        countdown={countdown}
      />
      <RetroOutcomesPanel state={state} className="mt-5" />
    </Shell>
  );
}

function PhaseHint({ phase }: { phase: string }) {
  const text =
    phase === "lobby"
      ? "Вы уже подключены. Ждём, пока ведущий откроет первую секцию."
      : phase === "collecting"
        ? "Пишите карточки в открытую секцию — анонимно для всех."
        : phase === "voting"
          ? "Отметьте самые важные карточки своими голосами."
          : phase === "discussing"
            ? "Идёт обсуждение. Карточки отсортированы по голосам."
            : "Ретро завершено. Спасибо за участие!";
  return <p className="mb-4 text-sm text-ink3">{text}</p>;
}

function Shell({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="flex min-h-screen-mobile flex-col app-gradient-bg">
      <AutoHideAppHeader className="z-10 border-line/60 bg-surface/85">
        <div className="flex min-h-14 w-full items-center px-3 pt-safe sm:px-4 lg:px-6">
          <BrandHomeLink size="sm" showWordmark={false} />
          <div className="ml-2 min-w-0">
            <h1 className="block truncate text-sm font-semibold text-ink2">{title ?? "Ретроспектива"}</h1>
            {subtitle ? <span className="block text-[11px] text-ink3">{subtitle}</span> : null}
          </div>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </AutoHideAppHeader>
      <div className="mx-auto w-full max-w-6xl flex-1 px-3 py-5 pb-safe-6 sm:px-4">{children}</div>
    </div>
  );
}
