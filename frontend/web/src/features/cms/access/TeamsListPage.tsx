import { useCallback, useEffect, useState } from "react";
import { cmsTeamsApi } from "../api/cmsClient";
import type { CmsTeam } from "../api/cmsTypes";
import { InlineError, SectionHeader, Skeleton } from "../components/CmsPrimitives";
import { Badge, Button, Surface, TextField } from "../../../design-system";
import { useAccessContext } from "./AccessShell";

export default function TeamsListPage() {
  const { canManage, isSuperuser } = useAccessContext();
  const [teams, setTeams] = useState<CmsTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await cmsTeamsApi.list();
      setTeams(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить команды");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function createTeam() {
    if (!canManage || !isSuperuser) return;
    setSaving(true);
    setError(null);
    try {
      await cmsTeamsApi.create({
        slug: slug.trim() || undefined,
        name: name.trim(),
        description: description.trim(),
      });
      setSlug("");
      setName("");
      setDescription("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать команду");
    } finally {
      setSaving(false);
    }
  }

  if (!isSuperuser) {
    return <InlineError text="Управление командами доступно только суперпользователю." />;
  }

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Команды"
        description="Команды изолируют сессии, калькулятор и ретро. Legacy-записи без команды остаются видимыми всем админам."
      />

      {error ? <InlineError text={error} /> : null}

      {canManage ? (
        <Surface className="grid gap-3 p-4 sm:grid-cols-2">
          <TextField label="Название" value={name} onChange={(e) => setName(e.target.value)} placeholder="iGaming RIP" />
          <TextField
            label="Slug (необязательно)"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="создастся из названия"
          />
          <TextField
            className="sm:col-span-2"
            label="Описание"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="sm:col-span-2">
            <Button variant="primary" size="sm" loading={saving} disabled={!name.trim()} onClick={() => void createTeam()}>
              Создать команду
            </Button>
          </div>
        </Surface>
      ) : null}

      {loading ? (
        <Skeleton height="h-32" />
      ) : (
        <div className="space-y-2">
          {teams.map((team) => (
            <Surface key={team.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div>
                <p className="font-semibold text-ink">{team.name}</p>
                <p className="text-xs text-ink3">{team.slug}</p>
              </div>
              <Badge tone={team.is_active ? "success" : "neutral"}>{team.is_active ? "активна" : "неактивна"}</Badge>
            </Surface>
          ))}
          {teams.length === 0 ? <p className="text-sm text-ink3">Команд пока нет.</p> : null}
        </div>
      )}
    </section>
  );
}
