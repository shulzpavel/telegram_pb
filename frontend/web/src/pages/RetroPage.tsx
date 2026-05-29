import { useState } from "react";
import { useParams } from "react-router-dom";
import { AutoHideAppHeader, Alert, BrandHomeLink, Button, Spinner, Surface, TextField, ThemeToggle } from "../design-system";
import type { ParticipantRole } from "../hooks/useSession";
import {
  loadWebIdentity,
  PARTICIPANT_EMAIL_DOMAIN,
  validateParticipantEmail,
} from "../shared/lib/participantIdentity";
import { RetroBoard } from "../features/cms/retro/RetroBoard";
import { phaseLabel } from "../features/cms/retro/retroLogic";
import { useRetro } from "../features/cms/retro/useRetro";

const ROLES: { id: ParticipantRole; label: string }[] = [
  { id: "backend", label: "Backend" },
  { id: "frontend", label: "Frontend" },
  { id: "qa", label: "QA" },
];

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

  if (phase === "joining") {
    return (
      <Shell>
        <JoinForm onJoin={join} error={error} />
      </Shell>
    );
  }

  if (!state) {
    return (
      <Shell>
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : (
          <div className="flex flex-col items-center gap-3 py-10">
            <Spinner size="lg" />
            <p className="text-sm text-ink3">Подключение к ретро…</p>
          </div>
        )}
      </Shell>
    );
  }

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
      />
    </Shell>
  );
}

function PhaseHint({ phase }: { phase: string }) {
  const text =
    phase === "lobby"
      ? "Ждём, пока ведущий откроет первую секцию."
      : phase === "collecting"
        ? "Пишите карточки в открытую секцию — анонимно для всех."
        : phase === "voting"
          ? "Отметьте самые важные карточки своими голосами."
          : phase === "discussing"
            ? "Идёт обсуждение. Карточки отсортированы по голосам."
            : "Ретро завершено. Спасибо за участие!";
  return <p className="mb-4 text-sm text-ink3">{text}</p>;
}

function JoinForm({
  onJoin,
  error,
}: {
  onJoin: (name: string, role: ParticipantRole) => Promise<void>;
  error: string | null;
}) {
  const saved = loadWebIdentity();
  const [email, setEmail] = useState(saved?.email ?? "");
  const [role, setRole] = useState<ParticipantRole>(saved?.role ?? "backend");
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const validation = validateParticipantEmail(email);
    if (validation) {
      setLocalError(validation);
      return;
    }
    setLocalError(null);
    setBusy(true);
    try {
      await onJoin(email, role);
    } catch {
      // hook surfaces error
    } finally {
      setBusy(false);
    }
  }

  return (
    <Surface className="mx-auto w-full max-w-sm space-y-4 p-6">
      <div className="space-y-1 text-center">
        <h1 className="text-lg font-bold text-ink">Ретроспектива команды</h1>
        <p className="text-sm text-ink3">Войдите, чтобы участвовать анонимно.</p>
      </div>
      {(localError || error) && <Alert tone="danger">{localError ?? error}</Alert>}
      <TextField
        label="Корпоративная почта"
        type="email"
        inputMode="email"
        autoCapitalize="none"
        autoComplete="email"
        autoFocus
        placeholder={`name@${PARTICIPANT_EMAIL_DOMAIN}`}
        value={email}
        reserveMessageSpace={false}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void submit()}
      />
      <div className="space-y-1">
        <div className="block text-sm font-semibold text-ink3" id="retro-role-label">Роль</div>
        <div className="flex gap-2" role="radiogroup" aria-labelledby="retro-role-label">
          {ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={role === r.id}
              onClick={() => setRole(r.id)}
              className={[
                "flex-1 min-h-10 rounded-lg border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/40",
                role === r.id ? "border-blue bg-blue text-white" : "border-line text-ink3 hover:bg-line2",
              ].join(" ")}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <Button variant="primary" className="w-full" onClick={() => void submit()} loading={busy}>
        Войти в ретро
      </Button>
    </Surface>
  );
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
