import { useState } from "react";
import { Alert, AutoHideAppHeader, BrandHomeLink, Button, Surface, TextField, ThemeToggle } from "../../../design-system";
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
    <main className="flex min-h-screen-mobile flex-col app-gradient-bg">
      <AutoHideAppHeader className="z-10 border-line/60 bg-surface/85">
        <div className="flex min-h-14 w-full items-center gap-2 px-3 pt-safe sm:px-4 lg:px-6">
          <BrandHomeLink size="sm" />
          <div className="ml-auto shrink-0">
            <ThemeToggle />
          </div>
        </div>
      </AutoHideAppHeader>
      <div className="flex flex-1 items-center justify-center px-4 py-8 pb-safe-6">
        <Surface as="form" className="w-full max-w-sm p-5 sm:p-6" onSubmit={submit}>
          <div className="mb-6">
            <h1 className="text-xl font-bold text-ink">Админка Planning Poker</h1>
            <p className="mt-1 text-sm text-ink3">Введите учётные данные администратора</p>
          </div>
          <div className="space-y-4">
            <TextField
              label="Username"
              autoFocus
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
