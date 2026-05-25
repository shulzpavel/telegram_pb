import { cn } from "../design-system";

const TASK_URL_RE = /(https?:\/\/\S+)/g;

export default function TaskTextBlock({
  text,
  fallback,
  titleClassName,
  linkClassName,
  as = "h2",
}: {
  text?: string | null;
  fallback: string;
  titleClassName?: string;
  linkClassName?: string;
  as?: "h1" | "h2" | "p";
}) {
  const Component = as;
  const raw = text ?? "";
  const links = Array.from(raw.matchAll(TASK_URL_RE), (match) => match[0]);
  const title = raw.replace(TASK_URL_RE, "").replace(/\s+/g, " ").trim();

  return (
    <div className="space-y-1.5">
      <Component className={cn("break-words text-balance font-bold leading-snug text-ink", titleClassName)}>
        {title || fallback}
      </Component>
      {links.map((url) => (
        <a
          key={url}
          href={url}
          target="_blank"
          rel="noreferrer"
          className={cn("block break-all text-sm font-medium leading-5 text-blue hover:underline", linkClassName)}
        >
          {url}
        </a>
      ))}
    </div>
  );
}
