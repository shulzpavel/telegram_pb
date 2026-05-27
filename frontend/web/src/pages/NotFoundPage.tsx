import { motion, useReducedMotion } from "framer-motion";
import { useLocation } from "react-router-dom";
import { AutoHideAppHeader, BackLink, BrandHomeLink, Button, Surface } from "../design-system";

/**
 * Friendly 404 page. The mascot ("Бибизяныч") wobbles gently while a banana
 * floats by. Animations are tiny on purpose so the page stays calm even at
 * the bottom of a long history stack; they also respect
 * `prefers-reduced-motion`. The mascot is rendered with two big emojis so it
 * inherits the user's system color emoji font on every platform — no SVG
 * asset to maintain.
 */
export default function NotFoundPage() {
  const location = useLocation();
  const reduceMotion = useReducedMotion();

  const monkeyAnim = reduceMotion
    ? undefined
    : {
        animate: { rotate: [-3, 3, -3], y: [0, -4, 0] },
        transition: { duration: 4.5, repeat: Infinity, ease: "easeInOut" as const },
      };

  const bananaAnim = reduceMotion
    ? undefined
    : {
        animate: { x: ["-30%", "30%", "-30%"], rotate: [-10, 10, -10] },
        transition: { duration: 6, repeat: Infinity, ease: "easeInOut" as const },
      };

  return (
    <main className="flex min-h-screen-mobile flex-col app-gradient-bg">
      {/* Tiny header so a wanderer who lands on /404 still feels they
          are inside Planning Poker — the brand mark also doubles as a
          fast escape hatch back to the landing page. */}
      <AutoHideAppHeader className="z-10 border-line/60 bg-surface/85">
        <div className="flex min-h-14 w-full items-center px-3 pt-safe sm:px-4 lg:px-6">
          <BrandHomeLink size="sm" />
        </div>
      </AutoHideAppHeader>
      <div className="flex flex-1 items-center justify-center px-4 py-10 pb-safe-6">
        <Surface className="w-full max-w-xl p-6 sm:p-8">
        <div className="relative flex flex-col items-center text-center">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-ink3">
            ошибка 404
          </span>

          <div className="relative mt-6 select-none">
            {/* Floating banana — sits behind the monkey */}
            <motion.span
              aria-hidden
              className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 text-3xl sm:text-4xl"
              {...(bananaAnim ?? {})}
            >
              🍌
            </motion.span>

            {/* The monkey itself */}
            <motion.span
              role="img"
              aria-label="Бибизяныч"
              className="relative block text-[6rem] leading-none sm:text-[8rem]"
              {...(monkeyAnim ?? {})}
            >
              🙈
            </motion.span>
          </div>

          <h1 className="mt-6 text-2xl font-bold text-ink sm:text-3xl">
            Бибизяныч не нашёл эту страницу
          </h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-ink3">
            Возможно, он её съел. Или вы перешли по битой ссылке — бывает,
            что говорить.
          </p>

          {location.pathname ? (
            <p className="mt-4 flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full border border-line bg-canvas px-3 py-1 text-xs text-ink3">
              <span className="font-semibold uppercase tracking-wide text-ink4">путь</span>
              <code className="block max-w-full break-all font-mono text-ink2">{location.pathname}</code>
            </p>
          ) : null}

          <div className="mt-7 flex w-full flex-col items-center justify-center gap-2 sm:flex-row">
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                window.location.assign("/");
              }}
              className="w-full sm:w-auto"
            >
              На главную
            </Button>
            <BackLink fallbackTo="/" label="Вернуться назад" size="md" />
          </div>

          <p className="mt-6 text-[11px] text-ink4">
            А если бибизяныч и здесь не появится — попробуйте обновить страницу.
          </p>
        </div>
      </Surface>
      </div>
    </main>
  );
}
