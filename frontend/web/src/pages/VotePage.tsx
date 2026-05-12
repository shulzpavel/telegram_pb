import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import ParticipantChip from "../components/ParticipantChip";
import VoteCard from "../components/VoteCard";
import { Alert, Badge, LoadingDots, ProgressBar, Surface } from "../design-system";
import { ParticipantStatus, TaskInfo } from "../hooks/useSession";

const VOTE_ROWS = [
  ["0", "1", "2", "3", "5"],
  ["8", "13", "21", "34", "?"],
];

interface VotePageProps {
  task: TaskInfo;
  participants: ParticipantStatus[];
  onVote: (value: string) => Promise<void>;
  error: string | null;
}

export default function VotePage({ task, participants, onVote, error }: VotePageProps) {
  const reduceMotion = useReducedMotion();
  const [selected, setSelected] = useState<string | null>(null);
  const [voted, setVoted] = useState(false);

  async function handleSelect(value: string) {
    if (voted) return;
    setSelected(value);
    setVoted(true);
    await onVote(value);
  }

  const votedCount = participants.filter((p) => p.voted).length;
  const totalCount = participants.length;
  const progress = totalCount > 0 ? votedCount / totalCount : 0;

  return (
    <div className="min-h-dvh bg-canvas flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 md:px-8 py-4 border-b border-line/60 bg-surface/80 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-2.5">
          <PokerMiniIcon />
          <span className="text-sm font-semibold text-ink2">Planning Poker</span>
        </div>
        <div className="flex items-center gap-2">
          {task.jira_key && (
            <Badge tone="info">{task.jira_key}</Badge>
          )}
          <span className="text-xs font-medium text-ink3">
            {task.index}&thinsp;/&thinsp;{task.total}
          </span>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex-1 flex flex-col md:flex-row max-w-5xl mx-auto w-full px-4 md:px-8 py-6 gap-6 md:gap-10">

        {/* Left / top panel — task info */}
        <AnimatePresence mode="wait">
          <motion.aside
            key={task.index}
            className="md:w-64 lg:w-72 shrink-0 flex flex-col gap-5"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
          >
            {/* Task card */}
            <Surface className="p-5">
              <p className="text-2xs font-semibold text-ink3 uppercase tracking-widest mb-2">Задача</p>
              <h2 className="text-base font-bold text-ink leading-snug text-balance">
                {task.text}
              </h2>
              <div className="mt-4">
                <div className="flex justify-between text-2xs text-ink3 mb-1.5">
                  <span>Прогресс</span>
                  <span>{votedCount} / {totalCount}</span>
                </div>
                <ProgressBar value={progress} />
              </div>
            </Surface>

            {/* Participants */}
            {participants.length > 0 && (
              <Surface className="p-5">
                <p className="text-2xs font-semibold text-ink3 uppercase tracking-widest mb-3">Участники</p>
                <div className="flex flex-wrap gap-2">
                  {participants.map((p) => (
                    <ParticipantChip key={p.name} name={p.name} voted={p.voted} />
                  ))}
                </div>
              </Surface>
            )}

            {/* My vote status (desktop only) */}
            {voted && (
              <motion.div
                className="hidden md:flex rounded-lg border border-line bg-surface p-5 shadow-card items-center gap-3"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: reduceMotion ? 0 : 0.16 }}
              >
                <div className="w-9 h-9 rounded-full bg-green/15 flex items-center justify-center shrink-0">
                  <CheckIcon />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">Голос отдан</p>
                  <p className="text-xs text-ink3">Вы выбрали <span className="font-bold text-blue">{selected}</span></p>
                </div>
              </motion.div>
            )}
          </motion.aside>
        </AnimatePresence>

        {/* Right / bottom panel — cards */}
        <div className="flex-1 flex flex-col justify-center">
          <Surface className="min-h-[390px] p-4 md:p-6 flex items-center justify-center">
          <AnimatePresence mode="wait">
            {voted ? (
              <motion.div
                key="voted"
                className="flex w-full flex-col items-center justify-center gap-4 py-10 md:py-0"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.18 }}
              >
                <div className="w-20 h-20 rounded-full bg-green/12 flex items-center justify-center">
                  <svg width="36" height="28" viewBox="0 0 36 28" fill="none">
                    <path d="M3 14L13 24L33 4" stroke="#30D158" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-ink">Вы проголосовали!</p>
                  <p className="text-base text-ink3 mt-1">
                    Ваш выбор: <span className="font-bold text-blue text-lg">{selected}</span>
                  </p>
                </div>
                <p className="text-sm text-ink4">Ожидаем остальных участников...</p>

                <LoadingDots className="mt-2 text-ink4" />
              </motion.div>
            ) : (
              <motion.div
                key="cards"
                className="w-full max-w-xl"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.18 }}
              >
                <p className="text-xs font-semibold text-ink3 uppercase tracking-widest mb-4 text-center md:text-left">
                  Выберите оценку
                </p>
                <div className="flex flex-col gap-3">
                  {VOTE_ROWS.map((row, ri) => (
                    <div key={ri} className="grid grid-cols-5 gap-3">
                      {row.map((v) => (
                        <VoteCard
                          key={v}
                          value={v}
                          selected={selected === v}
                          disabled={voted}
                          onSelect={() => handleSelect(v)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
                {error && (
                  <div className="mt-4">
                    <Alert tone="danger">{error}</Alert>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          </Surface>
        </div>
      </div>
    </div>
  );
}

function PokerMiniIcon() {
  return (
    <div className="w-6 h-6 rounded-md bg-blue flex items-center justify-center">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <rect x="1" y="1" width="4.5" height="6.5" rx=".8" fill="white" fillOpacity=".9" />
        <rect x="6.5" y="4.5" width="4.5" height="6.5" rx=".8" fill="white" fillOpacity=".5" />
      </svg>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
      <path d="M1 7L6 12L17 1" stroke="#30D158" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
