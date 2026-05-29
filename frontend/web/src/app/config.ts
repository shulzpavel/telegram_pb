export const API_BASE = import.meta.env.VITE_API_URL ?? "";
export const WS_BASE = import.meta.env.VITE_WS_URL ?? "";

export const CMS_PAGE_LIMIT = 50;

export function apiUrl(path: string): string {
  return `${API_BASE}/api/v1${path}`;
}

export function cmsUrl(path: string): string {
  return `${API_BASE}/api/v1/cms${path}`;
}

export function appUrl(path: string): string {
  return `${API_BASE}/api/v1/app${path}`;
}

export function wsUrl(token: string): string {
  if (WS_BASE) {
    return `${WS_BASE}/ws/${token}`;
  }
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/api/v1/ws/${token}`;
}

export function retroWsUrl(token: string): string {
  if (WS_BASE) {
    return `${WS_BASE}/retro-ws/${token}`;
  }
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/api/v1/retro-ws/${token}`;
}
