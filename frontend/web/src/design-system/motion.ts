export const motionTokens = {
  fast: 0.12,
  base: 0.18,
  slow: 0.24,
  ease: [0.2, 0, 0, 1] as const,
  emphasized: [0.2, 0.8, 0.2, 1] as const,
};

export function staggerDelay(index: number, reduceMotion: boolean, maxItems = 12): number {
  if (reduceMotion) return 0;
  return Math.min(index, maxItems) * 0.04;
}
