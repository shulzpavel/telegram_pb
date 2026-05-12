import { useCallback, useEffect, useState } from "react";
import { Button } from "../../../design-system";
import { cmsFetch } from "../api/cmsClient";
import type { Overview } from "../api/cmsTypes";
import { InlineError, Skeleton } from "../components/CmsPrimitives";
import { formatNumber } from "../../../shared/lib/format";

export default function OverviewPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(() => {
    setError(null);
    cmsFetch<Overview>("/overview")
      .then(setOverview)
      .catch((err) => setError(err instanceof Error ? err.message : "Overview failed"));
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-bold text-ink">Overview</h2>
          <p className="text-sm text-ink3">Operational totals across sessions, users, votes, tasks, and web tokens.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={loadOverview}>Refresh</Button>
      </div>
      {error ? <InlineError text={error} /> : null}
      {overview ? <OverviewCards overview={overview} /> : <Skeleton height="h-24" />}
    </section>
  );
}

function OverviewCards({ overview }: { overview: Overview }) {
  const stats = [
    ["Sessions", overview.total_sessions, `${overview.active_sessions} active`],
    ["Users", overview.total_users, `${overview.web_users} web`],
    ["Votes", overview.total_votes, `${overview.votes_rows} rows`],
    ["Tasks", overview.total_tasks, "rows"],
    ["Tokens", overview.active_web_tokens, `${overview.total_web_tokens} total`],
  ];
  return (
    <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {stats.map(([label, value, meta]) => (
        <div key={label} className="rounded-lg border border-line bg-surface px-4 py-3">
          <p className="text-xs font-semibold text-ink3">{label}</p>
          <p className="text-2xl font-bold text-ink mt-1">{formatNumber(value as number)}</p>
          <p className="text-xs text-ink3 mt-1">{meta}</p>
        </div>
      ))}
    </section>
  );
}
