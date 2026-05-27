import { useEffect, useRef, useState } from "react";
import { Badge, Surface } from "../design-system";
import JiraAdfRenderer, { type AdfNode } from "./JiraAdfRenderer";

interface JiraDescriptionPanelProps {
  /** Plain-text fallback captured at import time. Used when ADF is
   *  missing or malformed. */
  description?: string | null;
  /** Raw ADF payload (typed loosely because it crosses the JSON wire
   *  unvalidated). When present and well-formed, takes precedence over
   *  the plain-text fallback. */
  descriptionAdf?: unknown;
  jiraKey?: string | null;
}

/**
 * Renders the Jira issue body next to the voting controls so the team
 * doesn't have to context-switch to Jira mid-grooming.
 *
 * Long descriptions are collapsed to a fixed pixel height (not a line
 * count — works for both ADF tables/headings and plain wrapped text)
 * with a soft fade and a Развернуть/Свернуть toggle. The collapse
 * threshold is height-driven, measured after mount, so we don't have
 * to guess "is 240 chars long?" — a 1-line description with a giant
 * embedded table still folds correctly.
 *
 * Prefers the ADF renderer over plain text whenever the backend ships a
 * structured payload; falls back to ``whitespace-pre-wrap`` text only
 * when ADF is missing (manual tasks, legacy sessions, malformed input).
 */
const COLLAPSED_HEIGHT_PX = 192; // ~ md:6 lines of leading-6 text-sm
const COLLAPSE_TRIGGER_PX = 240; // only show the toggle if content exceeds this

function isAdfDoc(value: unknown): value is AdfNode {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "doc"
  );
}

export default function JiraDescriptionPanel({
  description,
  descriptionAdf,
  jiraKey,
}: JiraDescriptionPanelProps) {
  const adf = isAdfDoc(descriptionAdf) ? descriptionAdf : null;
  const plain = (description ?? "").trim();
  // Hide the entire panel only when there's truly nothing to show.
  if (!adf && !plain) return null;

  const [expanded, setExpanded] = useState(false);
  const [needsCollapse, setNeedsCollapse] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  // Measure rendered height once (and on content swap) to decide whether
  // the collapse toggle is needed. Pure character-count heuristics break
  // for ADF where one node can render a multi-row table.
  useEffect(() => {
    if (!contentRef.current) return;
    const measured = contentRef.current.scrollHeight;
    setNeedsCollapse(measured > COLLAPSE_TRIGGER_PX);
  }, [adf, plain]);

  return (
    <Surface className="p-4 md:p-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge tone="neutral">Описание</Badge>
        {jiraKey ? (
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink3">
            из {jiraKey}
          </span>
        ) : null}
      </div>
      <div className="relative">
        <div
          ref={contentRef}
          style={
            needsCollapse && !expanded
              ? { maxHeight: `${COLLAPSED_HEIGHT_PX}px`, overflow: "hidden" }
              : undefined
          }
        >
          {adf ? (
            <JiraAdfRenderer doc={adf} />
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-ink2">
              {plain}
            </p>
          )}
        </div>
        {needsCollapse && !expanded ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-surface to-transparent"
          />
        ) : null}
      </div>
      {needsCollapse ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 min-h-9 rounded text-xs font-semibold text-blue underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/30"
        >
          {expanded ? "Свернуть" : "Развернуть полностью"}
        </button>
      ) : null}
    </Surface>
  );
}
