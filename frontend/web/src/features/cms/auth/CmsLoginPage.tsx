import { useState } from "react";
import { Alert, BrandMark, Button, Surface, TextField, ThemeToggle } from "../../../design-system";
import { cmsAuthApi } from "../api/cmsClient";
import type { CmsPrincipal } from "../api/cmsTypes";

export default function CmsLoginPage({ onLogin }: { onLogin: (principal: CmsPrincipal) => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await cmsAuthApi.login(username, password);
      const principal = await cmsAuthApi.me();
      onLogin(principal);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось войти");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen-mobile flex-col app-gradient-bg">
      {/* Top bar shares the same brand mark + theme toggle pair as
          all other entry points so the login experience doesn't feel
          like a separate product. `pt-safe` keeps the brand below
          the notch on iOS. */}
      <header className="sticky top-0 z-10 border-b border-line bg-surface/85 pt-safe backdrop-blur">
        <div className="mx-auto flex min-h-14 max-w-3xl items-center gap-2 px-3 sm:px-4">
          <BrandMark size="sm" />
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <div className="flex flex-1 items-center justify-center px-4 py-8 pb-safe-6">
        <Surface as="form" className="w-full max-w-sm p-5 sm:p-6" onSubmit={submit}>
          <div className="mb-6">
            <h1 className="text-xl font-bold text-ink">Админка Planning Poker</h1>
            <p className="mt-1 text-sm text-ink3">Введите учётные данные администратора</p>
          </div>
          <div className="space-y-4">
            <TextField
              label="Username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
            <TextField
              label="Пароль"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <Button
              type="submit"
              variant="primary"
              className="w-full min-h-12"
              disabled={loading || !username || !password}
              loading={loading}
            >
              {loading ? "Входим" : "Войти"}
            </Button>
          </div>
        </Surface>
      </div>
    </main>
  );
}
