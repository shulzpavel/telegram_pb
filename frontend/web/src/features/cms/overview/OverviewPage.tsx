import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../../design-system";
import { cmsFetch } from "../api/cmsClient";
import type { Overview } from "../api/cmsTypes";
import { HelpCallout, InlineError, SectionHeader, Skeleton } from "../components/CmsPrimitives";
import { formatNumber } from "../../../shared/lib/format";

interface OverviewTile {
  label: string;
  value: number;
  caption: string;
  to: string;
  hint: string;
}

export default function OverviewPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const loadOverview = useCallback(() => {
    setError(null);
    cmsFetch<Overview>("/overview")
      .then(setOverview)
      .catch((err) => setError(err instanceof Error ? err.message : "Не удалось загрузить сводку"));
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Сводка"
        description="Быстрый взгляд на рабочий контур: калькулятор, planning sessions, ретро, участники и invite-ссылки."
        actions={
          <>
            <Button variant="primary" size="sm" onClick={() => navigate("/cms/planner")}>
              Открыть калькулятор
            </Button>
            <Button variant="ghost" size="sm" className="whitespace-nowrap" onClick={loadOverview}>Обновить</Button>
          </>
        }
      />
      <HelpCallout title="Что здесь">
        <p>Тайл-карточки кликабельны и идут в основном порядке работы: калькулятор → сессии → ретро.</p>
        <p>Цифры обновляются вручную — кнопкой «Обновить». Удалённые из истории сессии в счётчики не входят.</p>
      </HelpCallout>
      {error ? <InlineError text={error} /> : null}
      {overview ? <OverviewCards overview={overview} onSelect={(to) => navigate(to)} /> : <Skeleton height="h-24" />}
    </section>
  );
}

function OverviewCards({
  overview,
  onSelect,
}: {
  overview: Overview;
  onSelect: (to: string) => void;
}) {
  const tiles: OverviewTile[] = [
    {
      label: "Калькулятор",
      value: overview.total_sprint_plans,
      caption: "сохранённых расчётов",
      to: "/cms/planner",
      hint: "Открыть калькулятор capacity",
    },
    {
      label: "Сессии",
      value: overview.total_sessions,
      caption: `${overview.active_sessions} идёт сейчас`,
      to: "/cms/sessions",
      hint: "Открыть список сессий",
    },
    {
      label: "Ретро",
      value: overview.total_retros,
      caption: `${overview.live_retros} идёт сейчас`,
      to: "/cms/retro",
      hint: "Открыть ретроспективы",
    },
    {
      label: "Участники",
      value: overview.total_users,
      caption: `${overview.web_users} с веба`,
      to: "/cms/users",
      hint: "Открыть участников",
    },
    {
      label: "Голоса",
      value: overview.total_votes,
      caption: `${overview.votes_rows} записей`,
      to: "/cms/sessions",
      hint: "Перейти к сессиям",
    },
    {
      label: "Задачи",
      value: overview.total_tasks,
      caption: "во всех сессиях",
      to: "/cms/sessions",
      hint: "Перейти к сессиям",
    },
    {
      label: "Invite-ссылки",
      value: overview.active_web_tokens,
      caption: `всего создано ${overview.total_web_tokens}`,
      to: "/cms/tokens",
      hint: "Открыть invite-ссылки",
    },
  ];
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      {tiles.map((tile) => (
        <button
          key={tile.label}
          type="button"
          onClick={() => onSelect(tile.to)}
          className="rounded-lg border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-blue/60 hover:bg-line2/40 focus:outline-none focus-visible:border-blue focus-visible:ring-2 focus-visible:ring-blue/40"
          aria-label={tile.hint}
        >
          <p className="text-xs font-semibold text-ink3">{tile.label}</p>
          <p className="mt-1 text-2xl font-bold text-ink">{formatNumber(tile.value)}</p>
          <p className="mt-1 break-words text-xs text-ink3">{tile.caption}</p>
        </button>
      ))}
    </section>
  );
}
