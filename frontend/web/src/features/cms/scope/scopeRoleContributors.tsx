import { Badge } from "../../../design-system";
import type { ScopeBoardIssue, ScopeRoleContributor } from "../api/cmsClient";

const ROLE_LABELS: Record<string, string> = {
  front: "Front",
  back: "Back",
  qa: "QA",
};

const TRUSTED_SOURCES: Record<string, Set<string>> = {
  front: new Set([
    "gitlab_api_mr",
    "gitlab_api_commit",
    "gitlab_mr",
    "gitlab_commit",
    "subtask_gitlab_api_mr",
    "subtask_gitlab_api_commit",
    "subtask_gitlab_mr",
    "subtask_gitlab_commit",
    "changelog_dev",
  ]),
  back: new Set([
    "gitlab_api_mr",
    "gitlab_api_commit",
    "gitlab_mr",
    "gitlab_commit",
    "subtask_gitlab_api_mr",
    "subtask_gitlab_api_commit",
    "subtask_gitlab_mr",
    "subtask_gitlab_commit",
    "changelog_dev",
  ]),
  qa: new Set(["changelog", "current", "testing_comment"]),
};

const ESTIMATED_SOURCES = new Set(["changelog_dev", "testing_comment"]);
const GITLAB_API_SOURCES = new Set([
  "gitlab_api_mr",
  "gitlab_api_commit",
  "subtask_gitlab_api_mr",
  "subtask_gitlab_api_commit",
]);

function sourceLabel(source?: string): string | null {
  if (!source) return null;
  if (GITLAB_API_SOURCES.has(source)) return "GitLab API";
  if (ESTIMATED_SOURCES.has(source)) return "оценка";
  return null;
}

function isTrustedContributor(row: ScopeRoleContributor): boolean {
  if (!row.name?.trim()) return false;
  const sources = TRUSTED_SOURCES[row.role];
  if (!sources) return false;
  return !row.source || sources.has(row.source);
}

export function roleContributorRows(issue: ScopeBoardIssue): ScopeRoleContributor[] {
  const rows = issue.role_contributors_list?.length
    ? issue.role_contributors_list
    : (["front", "back", "qa"] as const).flatMap((role) => {
        const payload = issue.role_contributors?.[role];
        const name = payload?.name?.trim();
        if (!name || !payload) return [];
        return [{ role, name, source: payload.source }];
      });

  return (rows ?? []).filter((row): row is ScopeRoleContributor => Boolean(row && isTrustedContributor(row)));
}

export function RoleContributorsBadges({ issue }: { issue: ScopeBoardIssue }) {
  const rows = roleContributorRows(issue);
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {rows.map((row) => (
        <Badge key={`${row.role}-${row.name}`} tone={row.role === "qa" ? "warning" : row.role === "back" ? "info" : "neutral"}>
          {ROLE_LABELS[row.role] ?? row.role}: {row.name}
          {sourceLabel(row.source) ? ` (${sourceLabel(row.source)})` : ""}
        </Badge>
      ))}
    </div>
  );
}

export function RoleContributorsLines({
  issue,
}: {
  issue: {
    role_contributors?: ScopeBoardIssue["role_contributors"];
    role_contributors_list?: ScopeRoleContributor[];
    front?: string;
    back?: string;
    qa?: string;
  };
}) {
  const rows = roleContributorRows(issue as ScopeBoardIssue);
  const byRole = Object.fromEntries(rows.map((row) => [row.role, row.name]));
  const lines = [
    { label: "Front", value: byRole.front || issue.front },
    { label: "Back", value: byRole.back || issue.back },
    { label: "QA", value: byRole.qa || issue.qa },
  ];

  return (
    <div className="space-y-0.5 text-xs text-ink3">
      {lines.map((line) => (
        <p key={line.label}>
          <span className="font-medium text-ink2">{line.label}:</span> {line.value || "—"}
        </p>
      ))}
    </div>
  );
}
