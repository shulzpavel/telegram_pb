import { useEffect, useRef, useState } from "react";
import { Badge, Surface } from "../design-system";
import JiraAdfRenderer, { type AdfNode } from "./JiraAdfRenderer";

interface JiraDescriptionPanelProps {
  /** Plain-text fallback captured at import time. */
  description?: string | null;
  /** Raw ADF payload when Jira returned API v3 ADF. */
  descriptionAdf?: unknown;
  /** Sanitized HTML from Jira ``renderedFields`` — preferred when present. */
  descriptionHtml?: string | null;
  jiraKey?: string | null;
}

/**
 * Renders the Jira issue body next to the voting controls.
 *
 * Priority: sanitized HTML (matches Jira UI) → ADF → plain text.
 * Long content collapses by measured height with Развернуть/Свернуть.
 */
const COLLAPSED_HEIGHT_PX = 192;
const COLLAPSE_TRIGGER_PX = 240;

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
  descriptionHtml,
  jiraKey,
}: JiraDescriptionPanelProps) {
  const html = (descriptionHtml ?? "").trim();
  const adf = !html && isAdfDoc(descriptionAdf) ? descriptionAdf : null;
  const plain = !html && !adf ? (description ?? "").trim() : "";
  if (!html && !adf && !plain) return null;

  const [expanded, setExpanded] = useState(false);
  const [needsCollapse, setNeedsCollapse] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!contentRef.current) return;
    setNeedsCollapse(contentRef.current.scrollHeight > COLLAPSE_TRIGGER_PX);
  }, [html, adf, plain]);

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
          {html ? (
            <div
              className="jira-html-content text-sm leading-6 text-ink2"
              // HTML is sanitized on the backend before storage.
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : adf ? (
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
