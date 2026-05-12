import { motion, useReducedMotion } from "framer-motion";
import { FormEvent, useState } from "react";
import { Alert, Badge, Button, ProgressBar, Surface, TextField, cn } from "../design-system";
import { ParticipantRole, TaskInfo } from "../hooks/useSession";

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

function validateName(v: string): string | null {
  const t = v.trim();
  if (!t) return "Введите имя";
  if (t.length < 2) return "Имя должно быть минимум 2 символа";
  if (t.length > 40) return "Имя не должно превышать 40 символов";
  return null;
}

export default function JoinPage({ task, onJoin, error }: JoinPageProps) {
  const reduceMotion = useReducedMotion();
  const [name, setName]       = useState("");
  const [role, setRole]       = useState<ParticipantRole | null>(null);
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const nameError = touched ? validateName(name) : null;
  const roleError = touched && !role ? "Выберите роль" : null;
  const canSubmit = !loading && validateName(name) === null && role !== null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit || !role) return;
    setLoading(true);
    setSubmitError(null);
    try {
      await onJoin(name.trim(), role);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Ошибка подключения");
      setLoading(false);
    }
  }

  const displayError = submitError ?? error;

  return (
    <div className="min-h-dvh bg-canvas flex flex-col items-center justify-center p-4">
      <motion.div
        className="relative w-full max-w-md"
        initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.2, 0, 0, 1] }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          <PokerIcon />
          <span className="text-sm font-semibold text-ink2 tracking-tight">Planning Poker</span>
        </div>

        <Surface className="p-6 md:p-8">
          <div className="space-y-6">
            {/* Task preview */}
            {task ? (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  {task.jira_key && (
                    <Badge tone="info">{task.jira_key}</Badge>
                  )}
                  <span className="text-xs text-ink3">{task.index}&thinsp;/&thinsp;{task.total}</span>
                </div>
                <h1 className="text-lg font-bold text-ink leading-snug text-balance">{task.text}</h1>
                <div className="mt-3"><ProgressBar value={task.index / task.total} /></div>
              </div>
            ) : (
              <div className="text-center">
                <h1 className="text-xl font-bold text-ink">Сессия голосования</h1>
                <p className="text-sm text-ink3 mt-1">Ожидание задачи...</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <TextField
                label="Ваше имя"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder="Например: Маша"
                autoFocus
                autoComplete="name"
                maxLength={50}
                disabled={loading}
                error={nameError}
              />

              <div>
                <label className="mb-2 block text-xs font-semibold text-ink3">
                  Роль в команде
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES.map((r) => {
                    const active = role === r.value;
                    return (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => { setRole(r.value); setTouched(true); }}
                        disabled={loading}
                        aria-pressed={active}
                        className={cn(
                          "flex min-h-12 items-center gap-2.5 rounded-lg border px-4 py-3 text-left text-sm font-semibold",
                          "transition-[background-color,border-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/30",
                          active
                            ? "border-blue bg-blue/8 text-blue"
                            : "border-line bg-surface text-ink2 hover:border-blue/30 hover:bg-line2",
                          loading ? "opacity-50 pointer-events-none" : "",
                        )}
                      >
                        <span className="text-base leading-none">{r.icon}</span>
                        {r.label}
                        {active && (
                          <motion.div
                            className="ml-auto w-4 h-4 rounded-full bg-blue flex items-center justify-center shrink-0"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ duration: reduceMotion ? 0 : 0.14 }}
                          >
                            <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                              <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </motion.div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {roleError ? <p className="mt-1.5 text-xs text-red">{roleError}</p> : null}
              </div>

              {displayError && (
                <Alert tone="danger">{displayError}</Alert>
              )}

              <Button type="submit" variant="primary" size="lg" className="w-full" disabled={!canSubmit} loading={loading}>
                {loading ? "Подключение..." : "Войти в сессию"}
              </Button>
            </form>
          </div>
        </Surface>

        <p className="text-center text-xs text-ink4 mt-5">Ссылка действительна 8 часов</p>
      </motion.div>
    </div>
  );
}

function PokerIcon() {
  return (
    <div className="w-7 h-7 rounded-lg bg-blue flex items-center justify-center">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="1" width="5.5" height="7.5" rx="1" fill="white" fillOpacity=".9"/>
        <rect x="7.5" y="5.5" width="5.5" height="7.5" rx="1" fill="white" fillOpacity=".5"/>
      </svg>
    </div>
  );
}
