import { cn } from "../../../design-system";

export type TextWithLinksPart =
  | { kind: "text"; value: string }
  | { kind: "link"; href: string; label: string };

const URL_RE = /https?:\/\/[^\s<>"']+/gi;

export function splitTextWithLinks(text: string): TextWithLinksPart[] {
  if (!text) return [];

  const parts: TextWithLinksPart[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_RE)) {
    const raw = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ kind: "text", value: text.slice(lastIndex, index) });
    }
    const { href, trailing } = trimUrlTrailingPunctuation(raw);
    if (href) {
      parts.push({ kind: "link", href, label: formatLinkLabel(href) });
    } else {
      parts.push({ kind: "text", value: raw });
    }
    if (trailing) {
      parts.push({ kind: "text", value: trailing });
    }
    lastIndex = index + raw.length;
  }

  if (lastIndex < text.length) {
    parts.push({ kind: "text", value: text.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ kind: "text", value: text }];
}

function trimUrlTrailingPunctuation(raw: string): { href: string; trailing: string } {
  let href = raw;
  let trailing = "";
  while (/[),.!?;:]$/.test(href)) {
    trailing = href.slice(-1) + trailing;
    href = href.slice(0, -1);
  }
  return { href, trailing };
}

function formatLinkLabel(href: string): string {
  try {
    const url = new URL(href);
    const path = `${url.pathname}${url.search}${url.hash}`;
    if (!path || path === "/") {
      return url.hostname;
    }
    const combined = `${url.hostname}${path}`;
    if (combined.length <= 56) {
      return combined;
    }
    return `${url.hostname}${path.slice(0, Math.max(8, 56 - url.hostname.length - 1))}…`;
  } catch {
    return href.length > 56 ? `${href.slice(0, 53)}…` : href;
  }
}

export function TextWithLinks({
  text,
  className,
  linkClassName,
}: {
  text: string;
  className?: string;
  linkClassName?: string;
}) {
  const parts = splitTextWithLinks(text);

  return (
    <p className={cn("whitespace-pre-wrap break-words [overflow-wrap:anywhere]", className)}>
      {parts.map((part, index) =>
        part.kind === "link" ? (
          <a
            key={`${part.href}-${index}`}
            href={part.href}
            target="_blank"
            rel="noreferrer"
            title={part.href}
            className={cn(
              "inline font-medium text-blue underline decoration-blue/30 underline-offset-2 hover:decoration-blue",
              linkClassName
            )}
          >
            {part.label}
          </a>
        ) : (
          <span key={`text-${index}`}>{part.value}</span>
        )
      )}
    </p>
  );
}
