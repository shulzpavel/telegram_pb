import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

interface FlipCardProps {
  name: string;
  value: string;
  delay?: number;
  revealed: boolean;
}

const SUIT_COLORS = [
  { bg: "from-blue/15 to-blue/5", border: "border-blue/20", text: "text-blue" },
  { bg: "from-purple/15 to-purple/5", border: "border-purple/20", text: "text-purple" },
  { bg: "from-green/15 to-green/5", border: "border-green/20", text: "text-green" },
  { bg: "from-amber/15 to-amber/5", border: "border-amber/20", text: "text-amber" },
  { bg: "from-red/15 to-red/5", border: "border-red/20", text: "text-red" },
];

function colorForName(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return SUIT_COLORS[Math.abs(h) % SUIT_COLORS.length];
}

function initials(name: string) {
  return name.trim().split(/\s+/).map((w) => w[0]?.toUpperCase() ?? "").slice(0, 2).join("");
}

export default function FlipCard({ name, value, delay = 0, revealed }: FlipCardProps) {
  const [showFront, setShowFront] = useState(revealed);
  const reduceMotion = useReducedMotion();
  const color = colorForName(name);

  useEffect(() => {
    if (revealed) {
      // small delay so the flip gets past 90° before showing text
      const t = setTimeout(() => setShowFront(true), delay * 1000 + 300);
      return () => clearTimeout(t);
    } else {
      setShowFront(false);
    }
  }, [revealed, delay]);

  return (
    <div
      className="shrink-0"
      style={{ perspective: 800, width: 80, height: 112 }}
    >
      <motion.div
        className="w-full h-full relative"
        style={{ transformStyle: "preserve-3d" }}
        initial={{ rotateY: revealed ? 180 : 0 }}
        animate={{ rotateY: revealed ? 180 : 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.42, delay: reduceMotion ? 0 : delay, ease: [0.2, 0, 0, 1] }}
      >
        {/* Back face */}
        <div
          className={`absolute inset-0 rounded-lg border bg-gradient-to-br ${color.bg} ${color.border}
            flex flex-col items-center justify-between p-2`}
          style={{ backfaceVisibility: "hidden" }}
        >
          <span className={`text-2xs font-bold ${color.text}`}>PP</span>
          <div className={`w-10 h-10 rounded-full bg-white/60 flex items-center justify-center text-sm font-bold ${color.text}`}>
            {initials(name)}
          </div>
          <span className={`text-2xs font-bold ${color.text}`}>PP</span>
        </div>

        {/* Front face */}
        <div
          className="absolute inset-0 rounded-lg border border-line bg-surface shadow-card
            flex flex-col items-center justify-between p-2"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          {showFront && (
            <>
              <span className="text-2xs font-bold text-ink3 self-start">{value}</span>
              <span className="text-3xl font-black text-ink tabular-nums">{value}</span>
              <span className="text-2xs font-medium text-ink3 truncate w-full text-center px-0.5">
                {name}
              </span>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
