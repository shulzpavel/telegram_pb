import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import { motionTokens } from "./motion";

export function DeferredFallback({
  children,
  delayMs = 140,
}: {
  children: ReactNode;
  delayMs?: number;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);

  return visible ? <>{children}</> : null;
}

export function RouteTransition({
  transitionKey,
  children,
}: {
  transitionKey: string;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={transitionKey}
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
        transition={{
          duration: reduceMotion ? 0 : motionTokens.base,
          ease: motionTokens.ease,
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
