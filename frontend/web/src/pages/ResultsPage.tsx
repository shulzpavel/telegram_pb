import { motion, useReducedMotion } from "framer-motion";
import { type MouseEvent, useEffect, useState } from "react";
import FlipCard from "../components/FlipCard";
import TaskTextBlock from "../components/TaskTextBlock";
import { AutoHideAppHeader, Badge, BrandHomeLink, Button, LoadingDots, Surface } from "../design-system";
import { staggerDelay } from "../design-system/motion";
import { TaskInfo, VoteResult } from "../hooks/useSession";

interface Stats {
  consensus: string;
  avg: string;
  distribution: { value: string; count: number; pct: number }[];
}

function computeStats(results: VoteResult[]): Stats {
  const numeric = results.map((r) => Number(r.value)).filter((n) => !isNaN(n));

  const avg =
    numeric.length > 0
      ? (numeric.reduce((a, b) => a + b, 0) / numeric.length).toFixed(1)
      : "—";

  // Consensus = maximum numeric vote (pessimistic estimate for sprint planning)
  const consensus =
    numeric.length > 0 ? String(Math.max(...numeric)) : "?";

  const freq: Record<string, number> = {};
  results.forEach((r) => { freq[r.value] = (freq[r.value] ?? 0) + 1; });

  const total = results.length;
  const distribution = Object.entries(freq)
    .sort(([a], [b]) => {
      const na = Number(a), nb = Number(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    })
    .map(([value, count]) => ({
      value,
      count,
      pct: Math.round((count / total) * 100),
    }));

  return { consensus, avg, distribution };
}

interface ResultsPageProps {
  task: TaskInfo | null;
  results: VoteResult[];
  _skipAnimation?: boolean;
  onNextTask?: () => void;
  onRestart?: () => void;
  onLogoClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}

export default function ResultsPage({ task, results, _skipAnimation, onNextTask, onRestart, onLogoClick }: ResultsPageProps) {
  const reduceMotion = Boolean(useReducedMotion());
  const skipAnimation = Boolean(_skipAnimation || reduceMotion);
  const [phase, setPhase] = useState<"countdown" | "reveal" | "stats">(skipAnimation ? "stats" : "countdown");
  const [count, setCount] = useState(3);
  const [revealed, setRevealed] = useState(skipAnimation);

  const stats = computeStats(results);

  useEffect(() => {
    if (skipAnimation) {
      setPhase("stats");
      setRevealed(true);
      return;
    }
    setPhase("countdown");
    setCount(3);
    setRevealed(false);

    let c = 3;
    const tick = setInterval(() => {
      c -= 1;
      setCount(c);
      if (c <= 0) {
        clearInterval(tick);
        setPhase("reveal");
        setTimeout(() => setRevealed(true), 80);
        setTimeout(() => setPhase("stats"), Math.min(results.length, 12) * 60 + 500);
      }
    }, 700);

    return () => clearInterval(tick);
  }, [results, results.length, skipAnimation]);

  return (
    <div className="flex min-h-screen-mobile flex-col app-gradient-bg pb-safe">
      {/* Top bar: matches Vote/Join shells — BrandMark + section
          label + counter on the right. Single row, no wraps. */}
      <AutoHideAppHeader className="z-10 border-line/60 bg-surface/85">
        <div className="flex min-h-14 w-full items-center gap-2 px-3 pt-safe sm:px-4 md:px-8">
          <BrandHomeLink size="sm" showWordmark={false} className="shrink-0" onClick={onLogoClick} />
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink2">Результаты</span>
            {task?.jira_key ? <Badge>{task.jira_key}</Badge> : null}
          </div>
          {task ? (
            <span className="ml-auto shrink-0 text-xs font-medium tabular-nums text-ink3">
              {task.index}&thinsp;/&thinsp;{task.total}
            </span>
          ) : null}
        </div>
      </AutoHideAppHeader>

      <div className="flex-1 flex flex-col md:flex-row max-w-5xl mx-auto w-full px-4 md:px-8 py-8 gap-8 md:gap-12">

        {/* Left — task + cards */}
        <div className="flex-1 flex flex-col gap-6">
          {/* Task title */}
          {task && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <p className="text-2xs font-semibold text-ink3 uppercase tracking-widest mb-1">Задача</p>
              <TaskTextBlock text={task.text} fallback="Без названия" titleClassName="text-lg" />
            </motion.div>
          )}

          {/* Countdown */}
          <Surface className="min-h-[360px] p-5 md:p-6">
          {phase === "countdown" && (
            <div className="flex min-h-[300px] flex-col items-center justify-center gap-3">
              <motion.div
                key={count}
                className="text-8xl font-black text-blue tabular-nums"
                initial={{ scale: reduceMotion ? 1 : 1.18, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: reduceMotion ? 1 : 0.9, opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.18 }}
              >
                {count}
              </motion.div>
              <p className="text-base text-ink3 font-medium">Все проголосовали!</p>
            </div>
          )}

          {/* Flip cards grid */}
          {(phase === "reveal" || phase === "stats") && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-wrap gap-3"
            >
              {results.map((r, i) => (
                <FlipCard
                  key={r.name}
                  name={r.name}
                  value={r.value}
                  delay={staggerDelay(i, reduceMotion)}
                  revealed={revealed}
                />
              ))}
            </motion.div>
          )}
          </Surface>
        </div>

        {/* Right — stats panel */}
        {phase === "stats" && (
          <motion.aside
            className="md:w-60 lg:w-72 shrink-0 flex flex-col gap-4"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: reduceMotion ? 0 : 0.12, duration: reduceMotion ? 0 : 0.18 }}
          >
            {/* Consensus */}
            <Surface className="p-5 text-center">
              <p className="text-2xs font-semibold text-ink3 uppercase tracking-widest mb-2">Итог (SP)</p>
              <motion.div
                className="text-6xl font-black text-ink tabular-nums"
                initial={{ scale: reduceMotion ? 1 : 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: reduceMotion ? 0 : 0.18 }}
              >
                {stats.consensus}
              </motion.div>
              <p className="text-xs text-ink3 mt-2">Среднее: {stats.avg}</p>
            </Surface>

            {/* Distribution */}
            <Surface className="p-5">
              <p className="text-2xs font-semibold text-ink3 uppercase tracking-widest mb-4">Распределение</p>
              <div className="flex flex-col gap-2.5">
                {stats.distribution.map(({ value, count, pct }, i) => (
                  <div key={value} className="flex items-center gap-2">
                    <span className="text-xs font-bold text-ink2 w-6 text-right tabular-nums shrink-0">
                      {value}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-line overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-blue"
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ delay: staggerDelay(i, reduceMotion, 8), duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
                      />
                    </div>
                    <span className="text-2xs text-ink3 w-7 tabular-nums shrink-0">
                      {count}×
                    </span>
                  </div>
                ))}
              </div>
            </Surface>

            {onNextTask || onRestart ? (
              <Surface className="p-4 space-y-2">
                {onNextTask ? (
                  <Button variant="primary" className="w-full" onClick={onNextTask}>
                    Следующая задача
                  </Button>
                ) : null}
                {onRestart ? (
                  <Button variant="ghost" className="w-full" onClick={onRestart}>
                    Начать заново
                  </Button>
                ) : null}
              </Surface>
            ) : (
              <Surface className="p-4 flex items-center gap-3">
                <LoadingDots className="shrink-0 text-blue" />
                <p className="text-xs text-ink3">Ожидание следующей задачи</p>
              </Surface>
            )}
          </motion.aside>
        )}
      </div>
    </div>
  );
}
