/**
 * Shared retro types + pure helpers (no React, no network) so the board
 * logic is unit-testable in isolation.
 */

export type RetroPhase = "lobby" | "collecting" | "voting" | "discussing" | "done";

export interface RetroSectionDef {
  section_id: string;
  title: string;
}

export interface RetroCardView {
  card_id: string;
  section_id: string;
  text: string;
  group_id?: string | null;
  is_grouped?: boolean;
  vote_count: number;
}

export interface RetroGroupView {
  group_id: string;
  section_id: string;
  title: string;
  card_ids: string[];
  vote_count: number;
}

export interface RetroActionItemView {
  item_id: string;
  text: string;
  assignee: string | null;
  created_at?: string;
}

export type RetroSeverity = "low" | "medium" | "high";
export type RetroMood = "low" | "neutral" | "high";

export interface RetroProblem {
  title: string;
  severity: RetroSeverity;
  detail: string;
}

export interface RetroRecommendation {
  text: string;
  impact: RetroSeverity;
}

export interface RetroAiSummary {
  mood: RetroMood;
  summary: string;
  highlights: string[];
  problems: RetroProblem[];
  patterns: string[];
  recommendations: RetroRecommendation[];
  risks: string[];
  suggested_action_items: string[];
  generated_at?: string;
  source?: string;
}

export interface RetroLiveState {
  retro_id: number;
  title: string;
  phase: RetroPhase;
  active_section_id: string | null;
  section_deadline: string | null;
  votes_per_person: number;
  default_section_seconds: number;
  sections: RetroSectionDef[];
  cards: RetroCardView[];
  groups: RetroGroupView[];
  action_items: RetroActionItemView[];
  participants_count: number;
  ai_summary: RetroAiSummary | null;
  my_votes: string[];
  my_votes_used: number;
  my_votes_remaining: number;
  version: number;
}

export const RETRO_PHASE_LABELS: Record<RetroPhase, string> = {
  lobby: "Ожидание",
  collecting: "Сбор карточек",
  voting: "Голосование",
  discussing: "Обсуждение",
  done: "Завершено",
};

export function phaseLabel(phase: RetroPhase): string {
  return RETRO_PHASE_LABELS[phase] ?? phase;
}

/** Ignore out-of-order WebSocket snapshots after a newer HTTP mutation. */
export function shouldApplyRetroState(
  current: RetroLiveState | null,
  incoming: RetroLiveState,
): boolean {
  if (!current) return true;
  return incoming.version >= current.version;
}

/**
 * Apply a server snapshot while optionally keeping the viewer's vote hints
 * from anonymous pub/sub broadcasts (``my_votes`` is empty there).
 */
export function mergeRetroState(
  current: RetroLiveState | null,
  incoming: RetroLiveState,
  options?: { preserveMyVotes?: boolean },
): RetroLiveState {
  if (current && !shouldApplyRetroState(current, incoming)) {
    return current;
  }
  if (
    options?.preserveMyVotes &&
    current &&
    current.my_votes.length > 0 &&
    incoming.my_votes.length === 0
  ) {
    return {
      ...incoming,
      my_votes: current.my_votes,
      my_votes_used: current.my_votes_used,
      my_votes_remaining: current.my_votes_remaining,
    };
  }
  return incoming;
}

export const DEFAULT_RETRO_SECTIONS: RetroSectionDef[] = [
  { section_id: "went_well", title: "Что прошло хорошо" },
  { section_id: "pain_points", title: "Что мешало" },
  { section_id: "improvements", title: "Что улучшим" },
  { section_id: "experiments", title: "Идеи и эксперименты" },
];

/** Client-only demo board for e2e and local preview without a backend. */
export function createMockRetroLiveState(overrides: Partial<RetroLiveState> = {}): RetroLiveState {
  return {
    retro_id: 0,
    title: "Демо ретроспектива",
    phase: "collecting",
    active_section_id: DEFAULT_RETRO_SECTIONS[0].section_id,
    section_deadline: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    votes_per_person: 5,
    default_section_seconds: 300,
    sections: DEFAULT_RETRO_SECTIONS,
    cards: [],
    groups: [],
    action_items: [],
    participants_count: 1,
    ai_summary: null,
    my_votes: [],
    my_votes_used: 0,
    my_votes_remaining: 5,
    version: 1,
    ...overrides,
  };
}

export function isRetroMockEnabled(search = ""): boolean {
  return new URLSearchParams(search).get("mock") === "1";
}

export const MOOD_LABELS: Record<RetroMood, string> = {
  low: "Напряжённый",
  neutral: "Смешанный",
  high: "Позитивный",
};

/** Group cards by their section id, preserving the incoming (server) order. */
export function cardsBySection(state: Pick<RetroLiveState, "sections" | "cards">): Map<string, RetroCardView[]> {
  const map = new Map<string, RetroCardView[]>();
  for (const section of state.sections) {
    map.set(section.section_id, []);
  }
  for (const card of state.cards) {
    const bucket = map.get(card.section_id);
    if (bucket) {
      bucket.push(card);
    } else {
      map.set(card.section_id, [card]);
    }
  }
  return map;
}

export function groupsBySection(state: Pick<RetroLiveState, "sections" | "groups">): Map<string, RetroGroupView[]> {
  const map = new Map<string, RetroGroupView[]>();
  for (const section of state.sections) {
    map.set(section.section_id, []);
  }
  for (const group of state.groups) {
    const bucket = map.get(group.section_id);
    if (bucket) {
      bucket.push(group);
    } else {
      map.set(group.section_id, [group]);
    }
  }
  return map;
}

export function ungroupedCardsBySection(state: Pick<RetroLiveState, "sections" | "cards">): Map<string, RetroCardView[]> {
  return cardsBySection({
    sections: state.sections,
    cards: state.cards.filter((card) => !card.group_id && !card.is_grouped),
  });
}

/** The section that follows `activeId`, or the first one when nothing is active. */
export function nextSectionId(sections: RetroSectionDef[], activeId: string | null): string | null {
  if (sections.length === 0) return null;
  if (!activeId) return sections[0].section_id;
  const index = sections.findIndex((s) => s.section_id === activeId);
  if (index < 0 || index + 1 >= sections.length) return null;
  return sections[index + 1].section_id;
}

/** Whether a participant may type into the given section right now. */
export function canAddToSection(state: RetroLiveState, sectionId: string): boolean {
  return state.phase === "collecting" && state.active_section_id === sectionId;
}

/**
 * Remaining time on the active section timer as "M:SS", or null when there
 * is no deadline. Clamps at "0:00" once the deadline has passed.
 */
export function formatCountdown(deadlineIso: string | null, nowMs: number = Date.now()): string | null {
  if (!deadlineIso) return null;
  const deadline = Date.parse(deadlineIso);
  if (Number.isNaN(deadline)) return null;
  const remainingSec = Math.max(0, Math.round((deadline - nowMs) / 1000));
  const minutes = Math.floor(remainingSec / 60);
  const seconds = remainingSec % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function isCountdownExpired(deadlineIso: string | null, nowMs: number = Date.now()): boolean {
  if (!deadlineIso) return false;
  const deadline = Date.parse(deadlineIso);
  if (Number.isNaN(deadline)) return false;
  return deadline <= nowMs;
}
