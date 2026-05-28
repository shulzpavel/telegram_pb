import { Fragment, type ReactNode } from "react";

/**
 * Renderer for Atlassian Document Format (ADF) — the JSON shape Jira
 * uses for rich text fields. We render the subset that real Jira
 * descriptions actually use; unknown nodes fall back to rendering their
 * children, so anything exotic degrades to readable text instead of
 * crashing.
 *
 * Why a custom renderer:
 *   - Avoids pulling in a markdown/HTML library + a sanitizer (we don't
 *     execute any href schemes or `dangerouslySetInnerHTML`, all output
 *     is plain React text/elements).
 *   - Keeps formatting close to what Jira shows (headings, lists, code
 *     blocks, links, bold/italic/strike/inline code) so estimators see
 *     the same spec they would in Jira.
 *
 * Anything image/attachment-related is intentionally not rendered —
 * Jira's media URLs require user-bound auth and would otherwise just
 * show a broken icon. We surface a small "[медиа из Jira]" placeholder
 * instead so the team knows there's something they should open in Jira
 * directly.
 */

interface AdfMark {
  type: string;
  attrs?: Record<string, unknown> | null;
}

export interface AdfNode {
  type: string;
  text?: string;
  content?: AdfNode[];
  marks?: AdfMark[];
  attrs?: Record<string, unknown> | null;
}

interface JiraAdfRendererProps {
  doc: AdfNode;
  className?: string;
}

function renderMarks(node: AdfNode, keyPrefix: string): ReactNode {
  let el: ReactNode = node.text ?? "";
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case "strong":
        el = <strong className="font-semibold text-ink">{el}</strong>;
        break;
      case "em":
        el = <em>{el}</em>;
        break;
      case "code":
        el = (
          <code className="rounded bg-line/40 px-1 py-0.5 text-[0.85em] font-mono text-ink">
            {el}
          </code>
        );
        break;
      case "strike":
        el = <s>{el}</s>;
        break;
      case "underline":
        el = <u>{el}</u>;
        break;
      case "subsup": {
        const kind = (mark.attrs?.type as string | undefined) ?? "sub";
        el = kind === "sup" ? <sup>{el}</sup> : <sub>{el}</sub>;
        break;
      }
      case "link": {
        const href = (mark.attrs?.href as string | undefined) ?? "#";
        el = (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="break-words text-blue underline underline-offset-2 [overflow-wrap:anywhere] hover:no-underline"
          >
            {el}
          </a>
        );
        break;
      }
      case "textColor":
      case "backgroundColor":
        // Jira's per-text color rarely carries semantic meaning; we
        // intentionally drop it to keep the voter UI on the design
        // system palette.
        break;
      default:
        break;
    }
  }
  return <Fragment key={keyPrefix}>{el}</Fragment>;
}

function renderChildren(node: AdfNode, keyPrefix: string): ReactNode {
  const items = node.content ?? [];
  return items.map((child, i) => (
    <Fragment key={`${keyPrefix}-${i}`}>{renderNode(child, `${keyPrefix}-${i}`)}</Fragment>
  ));
}

function renderNode(node: AdfNode, keyPrefix: string): ReactNode {
  switch (node.type) {
    case "doc":
      return renderChildren(node, keyPrefix);

    case "paragraph":
      return <p className="my-2 first:mt-0 last:mb-0">{renderChildren(node, keyPrefix)}</p>;

    case "heading": {
      const level = Math.min(6, Math.max(1, (node.attrs?.level as number | undefined) ?? 2));
      const sizeClass =
        level <= 2
          ? "mt-4 mb-2 text-base font-bold text-ink first:mt-0"
          : level === 3
          ? "mt-3 mb-1.5 text-sm font-bold text-ink first:mt-0"
          : "mt-3 mb-1.5 text-sm font-semibold text-ink first:mt-0";
      const Tag = (`h${level}` as unknown) as keyof JSX.IntrinsicElements;
      return <Tag className={sizeClass}>{renderChildren(node, keyPrefix)}</Tag>;
    }

    case "bulletList":
      return (
        <ul className="my-2 ml-5 list-disc space-y-1 first:mt-0 last:mb-0">
          {renderChildren(node, keyPrefix)}
        </ul>
      );

    case "orderedList":
      return (
        <ol className="my-2 ml-5 list-decimal space-y-1 first:mt-0 last:mb-0">
          {renderChildren(node, keyPrefix)}
        </ol>
      );

    case "listItem":
      return <li className="pl-1">{renderChildren(node, keyPrefix)}</li>;

    case "blockquote":
      return (
        <blockquote className="my-2 border-l-2 border-line pl-3 text-ink2">
          {renderChildren(node, keyPrefix)}
        </blockquote>
      );

    case "codeBlock": {
      const text = (node.content ?? [])
        .map((c) => (typeof c.text === "string" ? c.text : ""))
        .join("");
      return (
        <pre className="my-2 overflow-x-auto rounded-md bg-line/30 p-3 text-[12px] leading-5 text-ink">
          <code className="whitespace-pre-wrap break-words font-mono [overflow-wrap:anywhere]">{text}</code>
        </pre>
      );
    }

    case "rule":
      return <hr className="my-3 border-line" />;

    case "hardBreak":
      return <br />;

    case "text":
      return renderMarks(node, keyPrefix);

    case "mention": {
      const label = (node.attrs?.text as string | undefined) ?? (node.attrs?.id as string | undefined) ?? "";
      return (
        <span className="rounded bg-blue/10 px-1 py-0.5 text-blue">
          @{label}
        </span>
      );
    }

    case "emoji":
      return <span>{(node.attrs?.text as string | undefined) ?? (node.attrs?.shortName as string | undefined) ?? ""}</span>;

    case "inlineCard":
    case "blockCard": {
      const href = ((node.attrs?.url as string | undefined) ?? (node.attrs?.href as string | undefined)) ?? "#";
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="break-words text-blue underline underline-offset-2 [overflow-wrap:anywhere] hover:no-underline"
        >
          {href}
        </a>
      );
    }

    case "table":
      return (
        <div className="my-2 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <tbody>{renderChildren(node, keyPrefix)}</tbody>
          </table>
        </div>
      );
    case "tableRow":
      return <tr>{renderChildren(node, keyPrefix)}</tr>;
    case "tableHeader":
      return (
        <th className="border border-line bg-line/30 px-2 py-1 text-left font-semibold">
          {renderChildren(node, keyPrefix)}
        </th>
      );
    case "tableCell":
      return <td className="border border-line px-2 py-1 align-top">{renderChildren(node, keyPrefix)}</td>;

    case "media":
    case "mediaGroup":
    case "mediaSingle":
      return (
        <p className="my-2 text-xs text-ink4">[медиа из Jira — откройте задачу, чтобы посмотреть]</p>
      );

    default:
      return renderChildren(node, keyPrefix);
  }
}

export default function JiraAdfRenderer({ doc, className }: JiraAdfRendererProps) {
  return (
    <div className={["min-w-0 break-words text-sm leading-6 text-ink2 [overflow-wrap:anywhere]", className ?? ""].join(" ")}>
      {renderNode(doc, "adf")}
    </div>
  );
}
