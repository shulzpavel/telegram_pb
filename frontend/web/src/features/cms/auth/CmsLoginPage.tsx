import { useState } from "react";
import { Alert, Button, Surface, TextField } from "../../../design-system";
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
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh bg-canvas flex items-center justify-center px-4">
      <Surface as="form" className="w-full max-w-sm p-6" onSubmit={submit}>
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink">CMS</h1>
          <p className="text-sm text-ink3 mt-1">Admin access</p>
        </div>
        <div className="space-y-4">
          <TextField label="Username" value={username} onChange={(event) => setUsername(event.target.value)} />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Button type="submit" variant="primary" className="w-full" disabled={loading || !username || !password} loading={loading}>
            {loading ? "Signing in" : "Sign in"}
          </Button>
        </div>
      </Surface>
    </main>
  );
}
