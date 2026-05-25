import { motion, useReducedMotion } from "framer-motion";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Badge, BrandHomeLink, Button, Surface, ThemeToggle } from "../design-system";

interface HubAction {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  details: string[];
  cta: { label: string; to: string; variant: "primary" | "secondary" };
}

const ACTIONS: HubAction[] = [
  {
    id: "manager",
    eyebrow: "Я веду сессию",
    title: "Запустить planning session",
    description: "Создайте комнату, добавьте задачи из Jira или вручную и отправьте invite команде.",
    details: ["Менеджерский cockpit", "Импорт Jira", "AI summary", "CSV-отчёт"],
    cta: { label: "Открыть менеджерский экран", to: "/manage", variant: "primary" },
  },
  {
    id: "player",
    eyebrow: "Я участник",
    title: "Посмотреть демо голосования",
    description: "Откройте демо как игрок: имя, роль, карточки оценки и live-состояния без настройки.",
    details: ["Без логина", "Мобильный экран", "Карты оценки", "Reveal результатов"],
    cta: { label: "Открыть демо для игрока", to: "/demo", variant: "secondary" },
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
      <header className="shrink-0 border-b border-line/70 bg-surface/70 pt-safe backdrop-blur-md">
        <div className="flex min-h-14 w-full items-center gap-3 px-4 py-3 lg:px-6">
          <BrandHomeLink size="md" className="min-w-0 gap-3 text-ink" />
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle size="sm" tone="ghost" />
            <Link to="/cms" className="hidden sm:inline-flex">
              <Button variant="ghost" size="sm">CMS</Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="flex flex-1 items-center px-4 py-8 pb-safe-6 lg:px-6">
        <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <motion.div {...enter}>
            <Badge tone="info">Общая ссылка для команды</Badge>
            <h1 className="mt-4 max-w-xl text-balance text-3xl font-bold leading-tight tracking-tight sm:text-5xl sm:leading-[1.08]">
              Выберите, что нужно сделать сейчас
            </h1>
            <p className="mt-4 max-w-lg text-base leading-7 text-ink2 sm:text-lg">
              Быстрый вход в planning poker: создайте сессию для команды или откройте demo, чтобы посмотреть голосование глазами участника.
            </p>
            <div className="mt-6 rounded-2xl border border-blue/20 bg-blue/10 p-4 text-sm leading-6 text-ink2">
              Уже есть invite-ссылка? Откройте её напрямую — она ведёт сразу на экран входа в сессию.
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
                      <span key={detail} className="rounded-full border border-line bg-line2 px-3 py-1 text-xs font-semibold text-ink3">
                        {detail}
                      </span>
                    ))}
                  </div>

                  <Link to={action.cta.to} className="mt-5 block">
                    <Button variant={action.cta.variant} size="lg" className="w-full">
                      {action.cta.label}
                    </Button>
                  </Link>
                </Surface>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <footer className="shrink-0 border-t border-line/70 bg-surface/50 pb-safe backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 text-xs text-ink3 sm:flex-row sm:items-center sm:justify-between lg:px-6">
          <p>Planning Poker для оценки задач, Jira import и командного голосования.</p>
          <nav aria-label="Служебные ссылки" className="flex flex-wrap gap-4">
            <Link to="/cms" className="font-semibold text-ink2 hover:text-blue">CMS</Link>
            <Link to="/demo?mock=1" className="font-semibold text-ink2 hover:text-blue">Mock demo</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
