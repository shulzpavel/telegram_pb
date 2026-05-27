import { Badge, CollapsibleSection, Surface } from "../design-system";
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

  return (
    <Surface className="p-4 md:p-5">
      <CollapsibleSection
        defaultOpenMobile={false}
        title={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">Описание</Badge>
            {jiraKey ? (
              <span className="text-2xs font-semibold uppercase tracking-wide text-ink3">
                из {jiraKey}
              </span>
            ) : null}
          </div>
        }
      >
        {html ? (
          <div
            className="jira-html-content text-sm leading-6 text-ink2"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : adf ? (
          <JiraAdfRenderer doc={adf} />
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-ink2">
            {plain}
          </p>
        )}
      </CollapsibleSection>
    </Surface>
  );
}
