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

      <section className="flex flex-1 items-center px-4 py-8 pb-safe-6 lg:px-6">
        <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[0.78fr_1.22fr] lg:items-center">
          <motion.div {...enter}>
            <Badge tone="info">Общая ссылка для команды</Badge>
            <h1 className="mt-4 max-w-xl text-balance text-3xl font-bold leading-tight tracking-tight sm:text-5xl sm:leading-[1.08]">
              Планирование, poker и ретро в одном месте
            </h1>
            <p className="mt-4 max-w-lg text-base leading-7 text-ink2 sm:text-lg">
              Начните с калькулятора capacity, проведите planning session и закройте цикл ретроспективой с анонимными карточками.
            </p>
            <div className="mt-6 rounded-2xl border border-blue/20 bg-blue/10 p-4 text-sm leading-6 text-ink2">
              Уже есть invite-ссылка? Откройте её напрямую — ссылки на сессии и ретро ведут сразу на нужный экран команды.
            </div>
          </motion.div>

          <div className="grid gap-4">
            {ACTIONS.map((action, index) => (
              <motion.div
                key={action.id}
                {...(reduceMotion
                  ? {}
                  : {
                      initial: { opacity: 0, y: 16 },
                      animate: { opacity: 1, y: 0 },
                      transition: { duration: 0.3, delay: 0.06 + index * 0.06, ease: [0.2, 0, 0, 1] as const },
                    })}
              >
                <Surface className="p-5 sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue">{action.eyebrow}</p>
                      <h2 className="mt-2 text-xl font-bold text-ink sm:text-2xl">{action.title}</h2>
                      <p className="mt-2 max-w-xl text-sm leading-6 text-ink2">{action.description}</p>
                    </div>
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-line2 text-sm font-bold text-blue"
                      aria-hidden
                    >
                      {index + 1}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {action.details.map((detail) => (
                      <DetailChip key={detail} label={detail} />
                    ))}
                  </div>

                  <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                    <Link to={action.cta.to} className="block flex-1">
                      <Button variant={action.cta.variant} size="lg" className="w-full">
                        {action.cta.label}
                      </Button>
                    </Link>
                    {action.demo ? (
                      <Link to={action.demo.to} className="block sm:w-auto">
                        <Button variant="ghost" size="lg" className="w-full sm:w-auto">
                          {action.demo.label}
                        </Button>
                      </Link>
                    ) : null}
                  </div>
                </Surface>
              </motion.div>
            ))}
            <motion.div
              {...(reduceMotion
                ? {}
                : {
                    initial: { opacity: 0, y: 16 },
                    animate: { opacity: 1, y: 0 },
                    transition: { duration: 0.3, delay: 0.18, ease: [0.2, 0, 0, 1] as const },
                  })}
            >
              <Surface className="p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue">Как это работает</p>
                    <h2 className="mt-2 text-xl font-bold text-ink sm:text-2xl">Рабочий порядок</h2>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-ink2">
                      Сначала оцените capacity команды, затем проведите planning poker по задачам и после спринта соберите ретро.
                      Для быстрых проверок есть mock demo: голосование и ретро открываются без подготовки данных.
                    </p>
                  </div>
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-line2 text-sm font-bold text-blue"
                    aria-hidden
                  >
                    4
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-line bg-line2/70 p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-ink3">Калькулятор</p>
                    <p className="mt-1 text-sm leading-6 text-ink2">
                      Зафиксируйте состав команды, absences и velocity перед тем, как брать объём в спринт.
                    </p>
                  </div>
                  <div className="rounded-xl border border-line bg-line2/70 p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-ink3">Сессии</p>
                    <p className="mt-1 text-sm leading-6 text-ink2">
                      Команда голосует по invite-ссылке, ведущий управляет задачами, AI и финальными SP.
                    </p>
                  </div>
                  <div className="rounded-xl border border-line bg-line2/70 p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-ink3">Ретро</p>
                    <p className="mt-1 text-sm leading-6 text-ink2">
                      Соберите карточки по секциям, сгруппируйте темы и сохраните action items после обсуждения.
                    </p>
                  </div>
                </div>
              </Surface>
            </motion.div>
          </div>
        </div>
      </section>

      <footer className="shrink-0 border-t border-line/70 bg-surface/50 pb-safe backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 text-xs text-ink3 sm:flex-row sm:items-center sm:justify-between lg:px-6">
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
