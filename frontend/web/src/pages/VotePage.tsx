import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { type MouseEvent, useEffect, useState } from "react";
import JiraDescriptionPanel from "../components/JiraDescriptionPanel";
import ParticipantChip from "../components/ParticipantChip";
import TaskTextBlock from "../components/TaskTextBlock";
import VoteCard from "../components/VoteCard";
import { AiIntelligenceSurface, Alert, Badge, BrandHomeLink, LoadingDots, ProgressBar, Surface, ThemeToggle } from "../design-system";
import { ParticipantStatus, TaskInfo } from "../hooks/useSession";

/**
 * Ten Fibonacci-style vote values rendered as a single 5-column grid. The
 * grid keeps tap targets aligned across viewports (column widths follow the
 * container, gap stays consistent) and reflows from 5×2 on mobile to 5×2 on
 * desktop. We intentionally avoid 2 different layouts to keep CLS at zero
 * when the viewport changes mid-session (foldables, browser chrome resize).
 */
const VOTE_VALUES = ["0", "1", "2", "3", "5", "8", "13", "21", "34", "?"];

interface VotePageProps {
  task: TaskInfo;
  participants: ParticipantStatus[];
  onVote: (value: string) => Promise<boolean>;
  error: string | null;
  onLogoClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}

export default function VotePage({ task, participants, onVote, error, onLogoClick }: VotePageProps) {
  const reduceMotion = useReducedMotion();
  const [selected, setSelected] = useState<string | null>(null);
  const [voted, setVoted] = useState(false);

  // Reset local "voted" UI whenever the active task changes so the participant
  // is not stuck on the previous task's success screen after the manager
  // advances or restarts voting.
  const taskKey = task.task_id ?? `${task.index}-${task.text}`;
  useEffect(() => {
    setSelected(null);
    setVoted(false);
  }, [taskKey]);

  async function handleSelect(value: string) {
    if (voted) return;
    setSelected(value);
    setVoted(true);
    const ok = await onVote(value);
    if (!ok) {
      // Server rejected the vote — let the participant try again instead of
      // showing a permanent "you voted" screen.
      setVoted(false);
      setSelected(null);
    }
  }

  const votedCount = participants.filter((p) => p.voted).length;
  const totalCount = participants.length;
  const progress = totalCount > 0 ? votedCount / totalCount : 0;
  const transitionBase = { duration: reduceMotion ? 0 : 0.18, ease: [0.2, 0, 0, 1] as const };

  return (
    <div className="flex min-h-screen-mobile flex-col app-gradient-bg">
      {/* Sticky header. `pt-safe` honors the iPhone notch; `bg-surface/80
          backdrop-blur` keeps focus on the cards below while staying legible
          over scrolled content. */}
      <header className="sticky top-0 z-10 border-b border-line/60 bg-surface/85 backdrop-blur pt-safe">
        <div className="flex min-h-14 w-full items-center gap-2 px-3 sm:gap-3 sm:px-4 md:px-8">
          <BrandHomeLink size="sm" showWordmark={false} className="shrink-0 sm:hidden" onClick={onLogoClick} />
          <BrandHomeLink size="sm" className="hidden min-w-0 sm:inline-flex" onClick={onLogoClick} />
          <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2">
            {task.jira_key ? <Badge tone="info">{task.jira_key}</Badge> : null}
            <span className="text-xs font-medium tabular-nums text-ink3">
              {task.index}&thinsp;/&thinsp;{task.total}
            </span>
            <ThemeToggle size="sm" tone="ghost" />
          </div>
        </div>
      </header>

      {/* Main column. `flex-1` consumes remaining viewport height; the
          bottom padding reserves space for safe-area + breathing room so
          neither the cards nor the success-state get clipped by the home
          indicator on iOS. */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-4 pb-safe-6 md:flex-row md:gap-8 md:px-8 md:py-6">
        {/* === Context panel ===
            On mobile it sits above the cards and stays compact so the CTA
            grid is reachable without scrolling. On md+ it becomes a fixed
            side column. Animated `key` keeps task swaps smooth without
            shifting the cards below. */}
        <AnimatePresence mode="wait">
          <motion.aside
            key={taskKey}
            className="flex flex-col gap-3 md:w-64 md:shrink-0 md:gap-5 lg:w-72"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={transitionBase}
          >
            <Surface className="p-4 md:p-5">
              <p className="mb-1.5 text-2xs font-semibold uppercase tracking-widest text-ink3">Задача</p>
              <TaskTextBlock
                text={task.text}
                fallback="Без названия"
                titleClassName="text-base md:text-lg"
              />
              <div className="mt-3 md:mt-4">
                <div className="mb-1.5 flex items-center justify-between text-2xs text-ink3">
                  <span>Прогресс</span>
                  <span className="tabular-nums">{votedCount} / {totalCount}</span>
                </div>
                <ProgressBar value={progress} />
              </div>
            </Surface>

            {task.description ? (
              <JiraDescriptionPanel
                description={task.description}
                jiraKey={task.jira_key ?? null}
              />
            ) : null}

            {task.ai_summary ? (
              <AiIntelligenceSurface
                className="p-4 md:p-5"
                sparkleLabel="AI-подсказка"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge tone="info">AI-подсказка</Badge>
                  <span className="text-2xs font-semibold uppercase tracking-wide text-ink3">для оценки</span>
                </div>
                <p className="text-sm leading-6 text-ink2">{task.ai_summary.description}</p>
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="text-2xs font-semibold uppercase tracking-widest text-ink3">Зоны внимания</p>
                    <ul className="mt-1 space-y-1 text-xs text-ink2">
                      {task.ai_summary.methods.map((method) => (
                        <li key={method} className="flex gap-2">
                          <span className="text-blue" aria-hidden="true">•</span>
                          <span>{method}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-2xs font-semibold uppercase tracking-widest text-ink3">AI оценка сложности</p>
                    <p className="mt-1 text-xs leading-5 text-ink2">{task.ai_summary.complexity}</p>
                  </div>
                </div>
              </AiIntelligenceSurface>
            ) : null}

            {participants.length > 0 ? (
              <Surface className="p-4 md:p-5">
                <p className="mb-2 text-2xs font-semibold uppercase tracking-widest text-ink3 md:mb-3">Участники</p>
                <div className="flex flex-wrap gap-2">
                  {participants.map((p, i) => (
                    <ParticipantChip
                      key={`${p.name}-${i}`}
                      name={p.name}
                      voted={p.voted}
                      value={p.value ?? null}
                    />
                  ))}
                </div>
              </Surface>
            ) : null}
          </motion.aside>
        </AnimatePresence>

        {/* === Card grid ===
            Reserve `min-h-[22rem]` so the inner state swap (cards ↔ voted
            confirmation) doesn't push surrounding content around. The
            surface stretches with flex to use the full visual area. */}
        <section className="flex min-w-0 flex-1 flex-col justify-start">
          <Surface className="flex min-h-[22rem] flex-col items-stretch justify-center p-4 md:p-6">
            <AnimatePresence mode="wait" initial={false}>
              {voted ? (
                <motion.div
                  key="voted"
                  className="flex flex-col items-center justify-center gap-4 py-6 text-center md:py-8"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={transitionBase}
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green/12 md:h-20 md:w-20">
                    <svg width="32" height="26" viewBox="0 0 36 28" fill="none" aria-hidden="true">
                      <path d="M3 14L13 24L33 4" stroke="#30D158" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-ink md:text-xl">Вы проголосовали!</p>
                    <p className="mt-1 text-sm text-ink3 md:text-base">
                      Ваш выбор: <span className="text-lg font-bold text-blue">{selected}</span>
                    </p>
                  </div>
                  <p className="text-xs text-ink4 md:text-sm">Ожидаем остальных участников…</p>
                  <LoadingDots className="text-ink4" />
                </motion.div>
              ) : (
                <motion.div
                  key="cards"
                  className="flex flex-col"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={transitionBase}
                >
                  <p className="mb-1 text-center text-2xs font-semibold uppercase tracking-widest text-ink3 md:text-left md:text-xs">
                    Выберите оценку
                  </p>
                  {/* Tell the user up-front that the vote is final after
                      submission — surfacing this expectation here avoids
                      a "wait, can I change it?" moment on the voted
                      screen. Compact, single line, single visual weight. */}
                  <p className="mb-3 text-center text-2xs text-ink4 md:mb-4 md:text-left">
                    Выбор подтвердится сразу после тапа и сразу станет виден всей команде.
                  </p>
                  <div className="grid grid-cols-5 gap-2 sm:gap-3">
                    {VOTE_VALUES.map((v) => (
                      <VoteCard
                        key={v}
                        value={v}
                        selected={selected === v}
                        disabled={voted}
                        onSelect={() => handleSelect(v)}
                      />
                    ))}
                  </div>
                  {/* Reserve a fixed-height row so inline server errors don't
                      push the grid up when they appear/disappear. */}
                  <div className="mt-3 min-h-[3.25rem]">
                    <AnimatePresence initial={false}>
                      {error ? (
                        <motion.div
                          key="err"
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: reduceMotion ? 0 : 0.16 }}
                        >
                          <Alert tone="danger">{error}</Alert>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Surface>
        </section>
      </main>
    </div>
  );
}
