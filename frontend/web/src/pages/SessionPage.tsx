import { motion, useReducedMotion } from "framer-motion";
import { type MouseEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AutoHideAppHeader, BrandHomeLink, Button, ConfirmDialog, Spinner as DsSpinner, Surface, ThemeToggle } from "../design-system";
import { useSession } from "../hooks/useSession";
import JoinPage from "./JoinPage";
import ResultsPage from "./ResultsPage";
import VotePage from "./VotePage";

export default function SessionPage() {
  const { token } = useParams<{ token: string }>();
  return token ? (
    <SessionInner token={token} />
  ) : (
    <FullScreen>
      <ErrorMessage text="Неверная ссылка на сессию" />
    </FullScreen>
  );
}

function SessionInner({ token }: { token: string }) {
  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();
  const { state, phase, join, vote, error } = useSession(token);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  function requestLeaveSession(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    setLeaveConfirmOpen(true);
  }

  const leaveConfirm = (
    <ConfirmDialog
      open={leaveConfirmOpen}
      title="Покинуть сессию?"
      description="Вы точно хотите покинуть текущую сессию и перейти на главную страницу?"
      confirmLabel="Перейти на главную"
      cancelLabel="Остаться"
      tone="primary"
      onConfirm={() => navigate("/")}
      onCancel={() => setLeaveConfirmOpen(false)}
    />
  );

  if (phase === "joining") {
    return (
      <JoinPage
        task={state?.task ?? null}
        onJoin={(name, role) => join(name, role)}
        error={error}
      />
    );
  }

  if (phase === "waiting") {
    return (
      <>
        <FullScreen onLogoClick={requestLeaveSession}>
          <Spinner />
          <p className="text-base text-ink2 font-semibold mt-5">Ожидание начала</p>
          <p className="text-sm text-ink3 mt-1">Лид скоро запустит голосование</p>
        </FullScreen>
        {leaveConfirm}
      </>
    );
  }

  if (phase === "voting" && state?.task) {
    return (
      <>
        <VotePage
          task={state.task}
          participants={state.participants}
          onVote={vote}
          error={error}
          onLogoClick={requestLeaveSession}
        />
        {leaveConfirm}
      </>
    );
  }

  if (phase === "results" && state?.results) {
    return (
      <>
        <ResultsPage task={state.task ?? null} results={state.results} onLogoClick={requestLeaveSession} />
        {leaveConfirm}
      </>
    );
  }

  if (phase === "complete") {
    // Voting Complete was previously a true dead-end — a thank-you
    // message with no next step. We now give the user a "go home" CTA
    // and a secondary route into the demo so the screen is actionable.
    return (
      <FullScreen>
        <motion.div
          className="w-20 h-20 rounded-full bg-green/12 flex items-center justify-center"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
        >
          <svg width="36" height="28" viewBox="0 0 36 28" fill="none">
            <path d="M3 14L13 24L33 4" stroke="#30D158" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.div>
        <p className="mt-5 text-xl font-bold text-ink">Голосование завершено</p>
        <p className="mt-1 max-w-sm text-sm text-ink3">
          Спасибо за участие! Эта вкладка больше не получает обновлений — её можно
          закрыть, или вернитесь на главную, если хотите попробовать ещё.
        </p>
        <div className="mt-6 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <Link to="/">
            <Button variant="primary" className="w-full sm:w-auto">На главную</Button>
          </Link>
          <Link to="/demo">
            <Button variant="ghost" className="w-full sm:w-auto">Пройти demo</Button>
          </Link>
        </div>
      </FullScreen>
    );
  }

  return (
    <FullScreen>
      <Spinner />
      <p className="text-sm text-ink3 mt-4">Подключение...</p>
    </FullScreen>
  );
}

function FullScreen({ children, onLogoClick }: { children: React.ReactNode; onLogoClick?: (event: MouseEvent<HTMLAnchorElement>) => void }) {
  // Shared "single message + brand" layout used by all transient
  // session states (joining / waiting / complete / error). Keeping the
  // brand visible avoids the "where am I?" feeling between phases and
  // gives the ThemeToggle a stable anchor instead of a floating overlay.
  return (
    <div className="flex min-h-screen-mobile flex-col app-gradient-bg">
      <AutoHideAppHeader className="z-10 border-line/60 bg-surface/85">
        <div className="flex min-h-14 w-full items-center px-3 pt-safe sm:px-4 lg:px-6">
          <BrandHomeLink size="sm" showWordmark={false} onClick={onLogoClick} />
          <span className="ml-2 text-sm font-semibold text-ink2">Planning Poker</span>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </AutoHideAppHeader>
      <div className="flex flex-1 items-center justify-center px-4 py-10 pb-safe-6">
        <motion.div
          className="flex flex-col items-center text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}

function Spinner() {
  return <DsSpinner size="lg" />;
}

function ErrorMessage({ text }: { text: string }) {
  return (
    <Surface className="px-6 py-5 max-w-xs text-center">
      <div className="w-10 h-10 rounded-full bg-red/10 flex items-center justify-center mx-auto mb-3">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M9 6v4M9 12.5v.5" stroke="#FF3B30" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="9" cy="9" r="7.5" stroke="#FF3B30" strokeWidth="1.5" />
        </svg>
      </div>
      <p className="text-base font-semibold text-ink">{text}</p>
    </Surface>
  );
}
