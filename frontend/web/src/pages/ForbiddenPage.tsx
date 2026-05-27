import { motion, useReducedMotion } from "framer-motion";
import { AutoHideAppHeader, BackLink, BrandHomeLink, Button, Surface } from "../design-system";

/**
 * Friendly 403 page for VPN / IP allowlist blocks. Same tone as NotFoundPage:
 * mascot wobble, a floating glyph, and copy that explains the gate without
 * sounding like a corporate security memo.
 */
export default function ForbiddenPage() {
  const reduceMotion = useReducedMotion();

  const monkeyAnim = reduceMotion
    ? undefined
    : {
        animate: { rotate: [-2, 2, -2], y: [0, -3, 0] },
        transition: { duration: 4.2, repeat: Infinity, ease: "easeInOut" as const },
      };

  const mercuryAnim = reduceMotion
    ? undefined
    : {
        animate: { x: ["-28%", "28%", "-28%"], rotate: [-8, 8, -8] },
        transition: { duration: 7, repeat: Infinity, ease: "easeInOut" as const },
      };

  return (
    <main className="flex min-h-screen-mobile flex-col app-gradient-bg">
      <AutoHideAppHeader className="z-10 border-line/60 bg-surface/85">
        <div className="flex min-h-14 w-full items-center px-3 pt-safe sm:px-4 lg:px-6">
          <BrandHomeLink size="sm" />
        </div>
      </AutoHideAppHeader>
      <div className="flex flex-1 items-center justify-center px-4 py-10 pb-safe-6">
        <Surface className="w-full max-w-xl p-6 sm:p-8">
          <div className="relative flex flex-col items-center text-center">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-ink3">
              ошибка 403
            </span>

            <div className="relative mt-6 select-none">
              <motion.span
                aria-hidden
                className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 text-2xl sm:text-3xl"
                {...(mercuryAnim ?? {})}
              >
                ☿️
              </motion.span>

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
              Бибизяныч не пускает с этой стороны интернета
            </h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-ink3">
              Похоже, вы зашли без VPN — сейчас это очень плохо и карается полной
              недоступностью ресурса. Ретроградный Меркурий, конечно, виноват во
              всём, но у нас действует белый список IP, и он строже любой
              астрологии.
            </p>
            <p className="mt-3 max-w-md text-sm leading-6 text-ink3">
              Подключите VPN из разрешённой сети и обновите страницу. Если VPN
              уже включён — проверьте, что трафик идёт через туннель, а не
              напрямую с вашего провайдера.
            </p>

            <div className="mt-7 flex w-full flex-col items-center justify-center gap-2 sm:flex-row">
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  window.location.reload();
                }}
                className="w-full sm:w-auto"
              >
                Обновить страницу
              </Button>
              <BackLink fallbackTo="/" label="На главную" size="md" />
            </div>

            <p className="mt-6 text-[11px] text-ink4">
              С VPN всё равно не пускает? Ваш IP ещё не в белом списке — напишите
              админу, не бибизяну.
            </p>
          </div>
        </Surface>
      </div>
    </main>
  );
}
