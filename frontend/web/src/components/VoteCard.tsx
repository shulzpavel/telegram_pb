import { motion, useReducedMotion } from "framer-motion";

interface VoteCardProps {
  value: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}

export default function VoteCard({ value, selected, disabled, onSelect }: VoteCardProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.button
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`Оценка ${value}`}
      whileHover={disabled || reduceMotion ? {} : { y: -2 }}
      whileTap={disabled || reduceMotion ? {} : { scale: 0.98 }}
      transition={{ duration: 0.14, ease: [0.2, 0, 0, 1] }}
      className={[
        "relative flex flex-col items-center justify-center select-none cursor-pointer",
        "w-full min-h-[88px] aspect-[5/7] rounded-lg border transition-[background-color,border-color,box-shadow,color] duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/30 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        "text-xl md:text-2xl font-black tracking-tight",
        selected
          ? "border-blue bg-blue text-white shadow-pop"
          : disabled
          ? "border-line/50 bg-line2 text-ink4 cursor-not-allowed"
          : "border-line bg-surface text-ink shadow-card hover:border-blue/40 hover:shadow-hover",
      ].join(" ")}
    >
      {/* Suit pip top-left (decorative) */}
      {!disabled && !selected && (
        <span className="absolute top-2 left-2.5 text-2xs font-bold text-ink4 leading-none">
          {value}
        </span>
      )}

      <span className="relative z-10">{value}</span>

      {/* Selected glow */}
      {selected && (
        <motion.div
          className="absolute inset-0 rounded-lg bg-white/10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />
      )}
    </motion.button>
  );
}
