import { motion, useReducedMotion } from "framer-motion";
import { useParams } from "react-router-dom";
import { Spinner as DsSpinner, Surface } from "../design-system";
import { useSession } from "../hooks/useSession";
import JoinPage from "./JoinPage";
import ResultsPage from "./ResultsPage";
import VotePage from "./VotePage";

export default function SessionPage() {
  const { token } = useParams<{ token: string }>();
  if (!token) return <FullScreen><ErrorMessage text="Неверная ссылка на сессию" /></FullScreen>;
  return <SessionInner token={token} />;
}

function SessionInner({ token }: { token: string }) {
  const reduceMotion = useReducedMotion();
  const { state, phase, join, vote, error } = useSession(token);

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
      <FullScreen>
        <Spinner />
        <p className="text-base text-ink2 font-semibold mt-5">Ожидание начала</p>
        <p className="text-sm text-ink3 mt-1">Лид скоро запустит голосование</p>
      </FullScreen>
    );
  }

  if (phase === "voting" && state?.task) {
    return (
      <VotePage
        task={state.task}
        participants={state.participants}
        onVote={vote}
        error={error}
      />
    );
  }

  if (phase === "results" && state?.results) {
    return <ResultsPage task={state.task ?? null} results={state.results} />;
  }

  if (phase === "complete") {
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
        <p className="text-xl font-bold text-ink mt-5">Голосование завершено</p>
        <p className="text-sm text-ink3 mt-1">Спасибо за участие!</p>
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

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas flex flex-col items-center justify-center gap-0">
      <motion.div
        className="flex flex-col items-center text-center px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {children}
      </motion.div>
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
