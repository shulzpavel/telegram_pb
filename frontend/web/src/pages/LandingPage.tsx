import { motion, useReducedMotion } from "framer-motion";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { AiSparklePill, AutoHideAppHeader, Badge, BrandHomeLink, Button, Surface, ThemeToggle } from "../design-system";

interface HubAction {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  details: string[];
  cta: { label: string; to: string; variant: "primary" | "secondary" };
  demo?: { label: string; to: string };
}

const ACTIONS: HubAction[] = [
  {
    id: "planner",
    eyebrow: "Сначала план",
    title: "Посчитать capacity и velocity",
    description: "Соберите команду, отпуска и историю спринтов — калькулятор подскажет реалистичный план в story points.",
    details: ["Velocity", "Capacity", "Роли и треки", "Сохранённые расчёты"],
    cta: { label: "Открыть калькулятор", to: "/cms/planner", variant: "primary" },
  },
  {
    id: "sessions",
    eyebrow: "Затем оценка",
    title: "Провести planning poker",
    description: "Создайте сессию, добавьте задачи из Jira или вручную и отправьте invite команде для live-голосования.",
    details: ["Cockpit ведущего", "Импорт Jira", "AI summary", "CSV-отчёт"],
    cta: { label: "Открыть сессии", to: "/cms/sessions", variant: "secondary" },
    demo: { label: "Демо голосования", to: "/demo?mock=1" },
  },
  {
    id: "retro",
    eyebrow: "После спринта",
    title: "Собрать ретро",
    description: "Откройте секции, соберите анонимные карточки, сгруппируйте похожие темы и завершите обсуждение AI-итогами.",
    details: ["Анонимные карточки", "Группировка", "Голосование", "AI action items"],
    cta: { label: "Открыть ретро", to: "/cms/retro", variant: "secondary" },
    demo: { label: "Демо ретро", to: "/r/demo-retro?mock=1" },
  },
];

export default function LandingPage() {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const previous = document.title;
    document.title = "Planning Poker Hub";
    return () => {
      document.title = previous;
    };
  }, []);

  const enter = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.28, ease: [0.2, 0, 0, 1] as const },
      };

  return (
    <main className="flex min-h-screen-mobile flex-col app-gradient-bg text-ink">
      <AutoHideAppHeader className="z-10 border-line/70 bg-surface/70">
        <div className="flex min-h-14 w-full items-center gap-3 px-4 py-3 pt-safe lg:px-6">
          <BrandHomeLink size="md" className="min-w-0 gap-3 text-ink" />
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link to="/cms" className="hidden sm:inline-flex">
              <Button variant="ghost" size="sm">CMS</Button>
            </Link>
          </div>
        </div>
      </AutoHideAppHeader>

      <section className="flex flex-1 px-4 py-10 pb-safe-8 sm:py-14 lg:px-8 lg:py-16">
        <div className="mx-auto flex w-full max-w-7xl flex-col justify-center gap-8 lg:gap-10">
          <motion.div {...enter} className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(320px,0.55fr)] lg:items-end">
            <div>
              <Badge tone="info">Общая ссылка для команды</Badge>
              <h1 className="mt-5 max-w-3xl text-balance text-3xl font-bold leading-tight tracking-tight sm:text-5xl sm:leading-[1.05]">
                Планирование, poker и ретро в одном месте
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-ink2 sm:text-lg">
                Начните с калькулятора capacity, проведите planning session и закройте цикл ретроспективой с анонимными карточками.
              </p>
            </div>
            <div className="rounded-2xl border border-blue/20 bg-blue/10 p-5 text-sm leading-7 text-ink2 shadow-card sm:p-6">
              Уже есть invite-ссылка? Откройте её напрямую — ссылки на сессии и ретро ведут сразу на нужный экран команды.
            </div>
          </motion.div>

          <div className="grid gap-5 lg:grid-cols-3">
            {ACTIONS.map((action, index) => (
              <motion.div
                key={action.id}
                className="h-full"
                {...(reduceMotion
                  ? {}
                  : {
                      initial: { opacity: 0, y: 16 },
                      animate: { opacity: 1, y: 0 },
                      transition: { duration: 0.3, delay: 0.06 + index * 0.06, ease: [0.2, 0, 0, 1] as const },
                    })}
              >
                <Surface
                  className={[
                    "group flex h-full flex-col overflow-hidden p-5 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-card sm:p-6",
                    action.cta.variant === "primary" ? "border-blue/30 bg-blue/5" : "",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue">{action.eyebrow}</p>
                      <h2 className="mt-2 text-xl font-bold leading-tight text-ink sm:text-2xl">{action.title}</h2>
                    </div>
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-line2 text-sm font-bold text-blue"
                      aria-hidden
                    >
                      {index + 1}
                    </span>
                  </div>

                  <p className="mt-4 text-sm leading-7 text-ink2">{action.description}</p>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {action.details.map((detail) => (
                      <DetailChip key={detail} label={detail} />
                    ))}
                  </div>

                  <div className="mt-auto pt-7">
                    <Link to={action.cta.to} className="block">
                      <Button variant={action.cta.variant} size="lg" className="w-full">
                        {action.cta.label}
                      </Button>
                    </Link>
                    {action.demo ? (
                      <Link to={action.demo.to} className="mt-2 block">
                        <Button variant="ghost" size="md" className="w-full">
                          {action.demo.label}
                        </Button>
                      </Link>
                    ) : null}
                  </div>
                </Surface>
              </motion.div>
            ))}
          </div>

          <motion.div
            {...(reduceMotion
              ? {}
              : {
                  initial: { opacity: 0, y: 14 },
                  animate: { opacity: 1, y: 0 },
                  transition: { duration: 0.28, delay: 0.18, ease: [0.2, 0, 0, 1] as const },
                })}
          >
            <Surface className="p-5 sm:p-6">
              <div className="grid gap-4 lg:grid-cols-[0.8fr_1fr_1fr_1fr] lg:items-center">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue">Как это работает</p>
                  <h2 className="mt-2 text-lg font-bold text-ink">Рабочий порядок</h2>
                </div>
                <HubStep title="Калькулятор">
                  Зафиксируйте состав команды, absences и velocity перед тем, как брать объём в спринт.
                </HubStep>
                <HubStep title="Сессии">
                  Команда голосует по invite-ссылке, ведущий управляет задачами, AI и финальными SP.
                </HubStep>
                <HubStep title="Ретро">
                  Соберите карточки по секциям, сгруппируйте темы и сохраните action items после обсуждения.
                </HubStep>
              </div>
              <p className="mt-5 border-t border-line pt-5 text-sm leading-7 text-ink2">
                Сначала оцените capacity команды, затем проведите planning poker по задачам и после спринта соберите ретро.
                Для быстрых проверок есть mock demo: голосование и ретро открываются без подготовки данных.
              </p>
            </Surface>
          </motion.div>
        </div>
      </section>

      <footer className="shrink-0 border-t border-line/70 bg-surface/50 pb-safe backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 text-xs text-ink3 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <p>Planning Poker для capacity planning, оценки задач и командных ретро.</p>
          <nav aria-label="Служебные ссылки" className="flex flex-wrap gap-4">
            <Link to="/cms" className="font-semibold text-ink2 hover:text-blue">CMS</Link>
            <Link to="/demo?mock=1" className="font-semibold text-ink2 hover:text-blue">Demo poker</Link>
            <Link to="/r/demo-retro?mock=1" className="font-semibold text-ink2 hover:text-blue">Demo retro</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}

function DetailChip({ label }: { label: string }) {
  if (label !== "AI summary") {
    return (
      <span className="rounded-full border border-line bg-line2 px-3 py-1 text-xs font-semibold text-ink3">
        {label}
      </span>
    );
  }

  return <AiSparklePill>{label}</AiSparklePill>;
}

function HubStep({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-line2/70 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-ink3">{title}</p>
      <p className="mt-2 text-sm leading-7 text-ink2">{children}</p>
    </div>
  );
}
