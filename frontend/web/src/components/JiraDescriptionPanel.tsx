import { useState } from "react";
import { Badge, Surface } from "../design-system";

interface JiraDescriptionPanelProps {
  description: string;
  jiraKey?: string | null;
}

/**
 * Voter-side block that renders the Jira issue body captured at import
 * time. Designed to live inside the VotePage side column, where vertical
 * real estate is tight (especially on mobile), so:
 *
 *   - Collapsed by default to ~6 lines (`max-h-32`) with a soft fade so
 *     the truncation is visually intentional, not an accidental cut.
 *   - `whitespace-pre-wrap` + `break-words` so the original line breaks
 *     and any long Jira-style identifiers stay intact without forcing
 *     horizontal scroll.
 *   - Tight collapse threshold (`COLLAPSE_THRESHOLD`) — short specs
 *     skip the toggle entirely.
 *
 * No HTML/Markdown parsing: we treat the description as plain text. If
 * the team later imports rich Jira ADF/HTML, we'd swap this for a
 * sanitised renderer.
 */
const COLLAPSE_THRESHOLD = 240;

export default function JiraDescriptionPanel({ description, jiraKey }: JiraDescriptionPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const trimmed = description.trim();
  if (!trimmed) return null;
  const long = trimmed.length > COLLAPSE_THRESHOLD;

  return (
    <Surface className="p-4 md:p-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge tone="neutral">Описание</Badge>
        {jiraKey ? <span className="text-2xs font-semibold uppercase tracking-wide text-ink3">из {jiraKey}</span> : null}
      </div>
      <div className="relative">
        <p
          className={[
            "whitespace-pre-wrap break-words text-sm leading-6 text-ink2",
            long && !expanded ? "max-h-32 overflow-hidden" : "",
          ].join(" ")}
        >
          {trimmed}
        </p>
        {long && !expanded ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface to-transparent"
          />
        ) : null}
      </div>
      {long ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 min-h-9 text-xs font-semibold text-blue underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/30 rounded"
        >
          {expanded ? "Свернуть" : "Развернуть полностью"}
        </button>
      ) : null}
    </Surface>
  );
}
