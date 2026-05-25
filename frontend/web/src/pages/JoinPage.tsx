import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import TaskTextBlock from "../components/TaskTextBlock";
import { Alert, Badge, BrandMark, Button, ProgressBar, Surface, TextField, ThemeToggle, cn } from "../design-system";
import { ParticipantRole, TaskInfo } from "../hooks/useSession";
import {
  PARTICIPANT_EMAIL_DOMAIN,
  loadWebIdentity,
  validateParticipantEmail,
} from "../shared/lib/participantIdentity";

interface JoinPageProps {
  task: TaskInfo | null;
  onJoin: (name: string, role: ParticipantRole) => Promise<void>;
  error: string | null;
}

const ROLES: { value: ParticipantRole; label: string; icon: string }[] = [
  { value: "backend",  label: "Backend",  icon: "⚙️" },
  { value: "frontend", label: "Frontend", icon: "🎨" },
  { value: "qa",       label: "QA",       icon: "🔍" },
  { value: "product",  label: "Product",  icon: "📋" },
  { value: "design",   label: "Design",   icon: "✦" },
];

export default function JoinPage({ task, onJoin, error }: JoinPageProps) {
  const reduceMotion = useReducedMotion();
  const saved = loadWebIdentity();
  const [name, setName] = useState(saved?.email ?? "");
  const [role, setRole] = useState<ParticipantRole | null>(saved?.role ?? null);
  // Validation is field-scoped so blurring the name input doesn't suddenly
  // flash "Выберите роль" before the user has even reached the role picker.
  const [nameTouched, setNameTouched] = useState(false);
  const [roleTouched, setRoleTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const nameError = nameTouched || submitAttempted ? validateParticipantEmail(name) : null;
  const roleError = (roleTouched || submitAttempted) && !role ? "Выберите роль" : null;
  const canSubmit = !loading && validateParticipantEmail(name) === null && role !== null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitAttempted(true);
    if (!canSubmit || !role) return;
    setLoading(true);
    setSubmitError(null);
    try {
      await onJoin(name.trim().toLowerCase(), role);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Ошибка подключения");
      setLoading(false);
    }
  }

  const displayError = submitError ?? error;

  return (
    <div className="relative flex min-h-screen-mobile flex-col app-gradient-bg px-4 pb-safe-6 pt-safe">
      {/* Floating theme toggle — kept out of the form flow so the join
          screen stays a single centered card on mobile. `safe-area`
          padding is inherited from the parent's `pt-safe`. */}
      <div className="absolute right-3 top-3 z-10 sm:right-4 sm:top-4">
        <ThemeToggle size="sm" tone="ghost" />
      </div>
      <motion.div
        className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-6"
        initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.2, 0, 0, 1] }}
      >
        <div className="mb-6 flex items-center justify-center md:mb-8">
          <BrandMark size="sm" />
        </div>

        <Surface className="p-5 sm:p-6 md:p-8">
          <div className="space-y-5 md:space-y-6">
            {/* Task preview slot — reserves vertical space whether or not a
                task is loaded yet so the form below doesn't jump when the
                websocket state arrives. */}
            <div className="min-h-[5.5rem]">
              {task ? (
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    {task.jira_key ? <Badge tone="info">{task.jira_key}</Badge> : null}
                    <span className="text-xs tabular-nums text-ink3">{task.index}&thinsp;/&thinsp;{task.total}</span>
                  </div>
                  <TaskTextBlock
                    as="h1"
                    text={task.text}
                    fallback="Без названия"
                    titleClassName="text-base sm:text-lg"
                  />
                  <div className="mt-3"><ProgressBar value={task.index / task.total} /></div>
                </div>
              ) : (
                <div className="text-center">
                  <h1 className="text-lg font-bold text-ink sm:text-xl">Сессия голосования</h1>
                  <p className="mt-1 text-sm text-ink3">Ожидание задачи…</p>
                </div>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5" noValidate>
              <TextField
                label="Корпоративная почта"
                type="email"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setNameTouched(true)}
                placeholder={`name@${PARTICIPANT_EMAIL_DOMAIN}`}
                hint={`Например: paul_s@${PARTICIPANT_EMAIL_DOMAIN}`}
                autoFocus
                autoComplete="email"
                inputMode="email"
                maxLength={64}
                disabled={loading}
                error={nameError}
              />

              <div>
                <label className="mb-2 block text-xs font-semibold text-ink3">
                  Роль в команде
                </label>
                {/* 2 cols on the smallest viewports (320–375) keeps labels
                    one-line; 3 cols on 376+ shows all five roles in two
                    rows with a balanced grid. */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {ROLES.map((r) => {
                    const active = role === r.value;
                    return (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => { setRole(r.value); setRoleTouched(true); }}
                        disabled={loading}
                        aria-pressed={active}
                        className={cn(
                          "flex min-h-12 items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-semibold sm:gap-2.5 sm:px-4 sm:py-3",
                          "transition-[background-color,border-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/30 active:scale-[0.98]",
                          active
                            ? "border-blue bg-blue/8 text-blue"
                            : "border-line bg-surface text-ink2 hover:border-blue/30 hover:bg-line2",
                          loading ? "pointer-events-none opacity-50" : "",
                        )}
                      >
                        <span className="text-base leading-none">{r.icon}</span>
                        <span className="truncate">{r.label}</span>
                        {active && (
                          <motion.div
                            className="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ duration: reduceMotion ? 0 : 0.14 }}
                          >
                            <svg width="8" height="6" viewBox="0 0 8 6" fill="none" aria-hidden="true">
                              <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </motion.div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {/* Reserve a row for the inline error so the CTA below
                    stays at a stable Y coordinate. */}
                <p
                  className={cn(
                    "mt-1.5 min-h-[1rem] text-xs text-red transition-opacity duration-150",
                    roleError ? "opacity-100" : "opacity-0",
                  )}
                  aria-live="polite"
                >
                  {roleError ?? "\u00a0"}
                </p>
              </div>

              {/* Pre-reserved error slot — Alert renders inside, so the
                  CTA position is stable even when a server error surfaces
                  after the form has been submitted.

                  Recovery: when an error appears, we also surface a
                  small "go home / ask for a new link" footer so the
                  user is never stuck on a broken invite. */}
              <div className="min-h-[3.25rem]">
                <AnimatePresence initial={false}>
                  {displayError ? (
                    <motion.div
                      key="join-err"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: reduceMotion ? 0 : 0.16 }}
                      className="space-y-2"
                    >
                      <Alert tone="danger">{displayError}</Alert>
                      <p className="text-xs text-ink3">
                        Если ссылка не работает — попросите фасилитатора прислать новую.
                        Иногда invite-ссылки живут несколько часов и истекают.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Link to="/">
                          <Button variant="ghost" size="sm">На главную</Button>
                        </Link>
                        <Link to="/demo?mock=1">
                          <Button variant="ghost" size="sm">Попробовать demo</Button>
                        </Link>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>

              <Button type="submit" variant="primary" size="lg" className="w-full" disabled={!canSubmit} loading={loading}>
                {loading ? "Подключение…" : "Войти в сессию"}
              </Button>
            </form>
          </div>
        </Surface>

        <p className="mt-5 text-center text-xs text-ink4">Ссылка действительна 8 часов</p>
      </motion.div>
    </div>
  );
}
