import { motion, useReducedMotion } from "framer-motion";
import { LoadingDots } from "../design-system";

interface ParticipantChipProps {
  name: string;
  voted: boolean;
  /** Live vote value. When present, replaces the "ждёт…" indicator with
   *  the actual pick — votes are no longer hidden behind a manager Reveal. */
  value?: string | null;
}

const AVATAR_COLORS = [
  "bg-blue/15 text-blue",
  "bg-purple/15 text-purple",
  "bg-green/15 text-green",
  "bg-amber/15 text-amber",
  "bg-red/15 text-red",
];

function colorForName(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

export default function ParticipantChip({ name, voted, value }: ParticipantChipProps) {
  const color = colorForName(name);
  const reduceMotion = useReducedMotion();
  const showValue = voted && value != null && value !== "";

  return (
    <div className="flex min-h-10 max-w-full min-w-0 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 shadow-sm">
      <div className="relative shrink-0">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-2xs font-bold ${color}`}>
          {initials(name)}
        </div>
        {/* Voted indicator */}
        <motion.div
          className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green border-2 border-surface flex items-center justify-center"
          initial={{ scale: 0 }}
          animate={{ scale: voted ? 1 : 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.16 }}
        >
          <svg width="6" height="5" viewBox="0 0 6 5" fill="none">
            <path d="M0.75 2.5L2.25 4L5.25 1" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.div>
      </div>

      <span className={`min-w-0 whitespace-normal break-words text-xs font-medium leading-tight transition-colors duration-200 ${voted ? "text-ink2" : "text-ink3"}`}>
        {name}
      </span>

      {/* Live vote value (shown to every participant now that Reveal is gone)
          or a "waiting" loader if the person hasn't voted yet. */}
      {showValue ? (
        <span className="ml-auto shrink-0 rounded-md bg-blue px-1.5 py-0.5 text-2xs font-bold tabular-nums text-white">
          {value}
        </span>
      ) : !voted ? (
        <LoadingDots className="ml-0.5 shrink-0 text-ink4" />
      ) : null}
    </div>
  );
}
