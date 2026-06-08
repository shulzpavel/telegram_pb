import { Badge } from "../../../design-system";
import type { TeamRef } from "../api/cmsTypes";

const LEGACY_LABEL = "Без команды";

export function teamDisplayLabel(teamId: number | null | undefined, team?: TeamRef | null): string {
  if (team?.name) return team.name;
  if (teamId != null) return `Команда #${teamId}`;
  return LEGACY_LABEL;
}

interface TeamBadgeProps {
  teamId?: number | null;
  team?: TeamRef | null;
  className?: string;
}

export function TeamBadge({ teamId, team, className }: TeamBadgeProps) {
  const label = teamDisplayLabel(teamId ?? null, team);
  const tone = teamId == null ? "neutral" : "info";
  return (
    <Badge tone={tone} className={className}>
      {label}
    </Badge>
  );
}
