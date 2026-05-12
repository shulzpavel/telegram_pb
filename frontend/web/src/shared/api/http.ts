export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function formatValidationDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (!Array.isArray(detail)) return fallback;

  const messages = detail
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as { loc?: unknown; msg?: unknown };
      if (typeof record.msg !== "string") return null;
      const loc = Array.isArray(record.loc) ? record.loc.filter((part) => part !== "body").join(".") : "";
      return loc ? `${loc}: ${record.msg}` : record.msg;
    })
    .filter((message): message is string => Boolean(message));

  return messages.length > 0 ? messages.join("; ") : fallback;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  const item = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!item) return null;
  try {
    return decodeURIComponent(item.slice(prefix.length));
  } catch {
    return null;
  }
}

function buildHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const method = (init?.method ?? "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS", "TRACE"].includes(method) && !headers.has("X-CSRF-Token")) {
    const token = readCookie("cms_csrf");
    if (token) headers.set("X-CSRF-Token", token);
  }

  return headers;
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: buildHeaders(init),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const detail = formatValidationDetail((payload as { detail?: unknown }).detail, `HTTP ${response.status}`);
    throw new ApiError(detail, response.status, payload);
  }

  return (await response.json()) as T;
}
