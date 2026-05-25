import type { ParticipantRole } from "../../hooks/useSession";

export const PARTICIPANT_EMAIL_DOMAIN = "betboom.com";
const MAX_EMAIL_LEN = 64;

const EMAIL_RE = new RegExp(
  `^[a-z0-9][a-z0-9._-]*@${PARTICIPANT_EMAIL_DOMAIN.replace(".", "\\.")}$`
);

export const WEB_IDENTITY_STORAGE_KEY = "pp_web_identity";

export interface WebParticipantIdentity {
  email: string;
  role: ParticipantRole;
}

export function normalizeParticipantEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateParticipantEmail(raw: string): string | null {
  const normalized = normalizeParticipantEmail(raw);
  if (!normalized) return "Введите корпоративную почту";
  if (normalized.length > MAX_EMAIL_LEN) {
    return `Почта не должна превышать ${MAX_EMAIL_LEN} символов`;
  }
  if (!EMAIL_RE.test(normalized)) {
    return `Укажите почту в формате name@${PARTICIPANT_EMAIL_DOMAIN}`;
  }
  return null;
}

export function loadWebIdentity(): WebParticipantIdentity | null {
  try {
    const raw = localStorage.getItem(WEB_IDENTITY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WebParticipantIdentity>;
    if (
      typeof parsed.email !== "string" ||
      typeof parsed.role !== "string" ||
      validateParticipantEmail(parsed.email) !== null
    ) {
      return null;
    }
    return {
      email: normalizeParticipantEmail(parsed.email),
      role: parsed.role as ParticipantRole,
    };
  } catch {
    return null;
  }
}

export function saveWebIdentity(email: string, role: ParticipantRole): void {
  try {
    localStorage.setItem(
      WEB_IDENTITY_STORAGE_KEY,
      JSON.stringify({
        email: normalizeParticipantEmail(email),
        role,
      } satisfies WebParticipantIdentity)
    );
  } catch {
    // private mode / quota — non-fatal
  }
}
