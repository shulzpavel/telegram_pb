import { useEffect, useState } from "react";
import { cmsTeamsApi } from "../api/cmsClient";
import type { CmsPrincipal, CmsTeam } from "../api/cmsTypes";

export function useCmsTeams(principal: CmsPrincipal | null) {
  const [teams, setTeams] = useState<CmsTeam[]>(principal?.teams ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!principal) {
      setTeams([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    cmsTeamsApi
      .list()
      .then((result) => {
        if (!cancelled) setTeams(result.items);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Не удалось загрузить команды");
          setTeams(principal.teams ?? []);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [principal]);

  return { teams, loading, error, reload: () => cmsTeamsApi.list().then((result) => setTeams(result.items)) };
}
