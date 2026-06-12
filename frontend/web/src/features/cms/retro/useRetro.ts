import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiUrl, retroWsUrl } from "../../../app/config";
import {
  PARTICIPANT_EMAIL_DOMAIN,
  saveWebIdentity,
  type WebParticipantIdentity,
} from "../../../shared/lib/participantIdentity";
import type { ParticipantRole } from "../../../hooks/useSession";
import {
  canAddToSection,
  createMockRetroLiveState,
  isRetroMockEnabled,
  mergeRetroState,
  type RetroLiveState,
  type RetroPhase,
} from "./retroLogic";

interface UseRetroReturn {
  state: RetroLiveState | null;
  phase: RetroPhase | "joining";
  participantId: string | null;
  /** Cards the current participant has voted on (authoritative, local). */
  myVotes: Set<string>;
  votesRemaining: number;
  /** Apply an authoritative HTTP snapshot (manager cockpit mutations). */
  applyState: (next: RetroLiveState) => void;
  join: (name: string, role: ParticipantRole) => Promise<void>;
  addCard: (sectionId: string, text: string) => Promise<boolean>;
  toggleVote: (targetId: string, targetType?: "card" | "group") => Promise<boolean>;
  error: string | null;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const resp = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const data = (await resp.json().catch(() => ({}))) as { detail?: string };
    const err = new Error(data.detail ?? "Request failed") as Error & { status?: number };
    err.status = resp.status;
    throw err;
  }
  return (await resp.json()) as T;
}

/**
 * Live retro board hook. Used by both the participant page and the manager
 * cockpit. The WebSocket always connects (to keep the board fresh); ``join``
 * is only called on the participant side. Vote anonymity is preserved by the
 * server broadcasting aggregate counts only — we track the current viewer's
 * own dots locally and reconcile them from our own join/state/vote responses.
 */
const MOCK_PARTICIPANT_ID = "mock-participant";
const ANONYMOUS_ROLE: ParticipantRole = "backend";

export function useRetro(
  token: string,
  options: { participant?: boolean; mock?: boolean } = {},
): UseRetroReturn {
  const mockEnabled =
    options.mock ??
    (typeof window !== "undefined" ? isRetroMockEnabled(window.location.search) : false);
  const pidKey = `pp_retro_pid_${token}`;
  const anonKey = `pp_retro_anon_${token}`;
  const [participantId, setParticipantId] = useState<string | null>(() => {
    if (mockEnabled && options.participant) return MOCK_PARTICIPANT_ID;
    try {
      return options.participant ? localStorage.getItem(pidKey) : null;
    } catch {
      return null;
    }
  });
  const [state, setState] = useState<RetroLiveState | null>(() =>
    mockEnabled ? createMockRetroLiveState() : null,
  );
  const [myVotes, setMyVotes] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(1000);
  const unmounted = useRef(false);
  const autoJoinStarted = useRef(false);
  const participantIdRef = useRef<string | null>(participantId);
  participantIdRef.current = participantId;

  const applyState = useCallback((incoming: RetroLiveState) => {
    setState((prev) => mergeRetroState(prev, incoming, { preserveMyVotes: Boolean(participantIdRef.current) }));
    if (participantIdRef.current && incoming.my_votes?.length) {
      setMyVotes(new Set(incoming.my_votes));
    }
  }, []);

  // Seed once from the HTTP state endpoint, then rely on the WebSocket.
  useEffect(() => {
    if (mockEnabled) return;
    let cancelled = false;
    const pidQuery = participantId ? `?participant_id=${encodeURIComponent(participantId)}` : "";
    fetch(apiUrl(`/retro/state/${token}${pidQuery}`))
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((data: RetroLiveState | null) => {
        if (cancelled || !data) return;
        setState(data);
        if (participantId) setMyVotes(new Set(data.my_votes ?? []));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [mockEnabled, token, participantId]);

  useEffect(() => {
    if (!options.participant || participantId !== null) return;
    if (autoJoinStarted.current) return;
    autoJoinStarted.current = true;
    let cancelled = false;

    if (mockEnabled) {
      try {
        localStorage.setItem(pidKey, MOCK_PARTICIPANT_ID);
      } catch {
        // ignore storage errors
      }
      setParticipantId(MOCK_PARTICIPANT_ID);
      setState(createMockRetroLiveState());
      setMyVotes(new Set());
      return;
    }

    const anonymousEmail = getAnonymousRetroEmail(anonKey);
    postJson<{ participant_id: string; state: RetroLiveState }>("/retro/join", {
      token,
      name: anonymousEmail,
      role: ANONYMOUS_ROLE,
    })
      .then((data) => {
        if (cancelled) return;
        try {
          localStorage.setItem(pidKey, data.participant_id);
        } catch {
          // ignore storage errors
        }
        setParticipantId(data.participant_id);
        setState(data.state);
        setMyVotes(new Set(data.state.my_votes ?? []));
      })
      .catch((e) => {
        if (cancelled) return;
        autoJoinStarted.current = false;
        setError(e instanceof Error ? e.message : "Не удалось подключиться");
      });

    return () => {
      // Reset the guard so a remounted effect re-runs the join. Without this,
      // React StrictMode's dev double-mount discarded the join response and
      // left participantId null (silently breaking card adds on the dev server).
      cancelled = true;
      autoJoinStarted.current = false;
    };
  }, [anonKey, mockEnabled, options.participant, participantId, pidKey, token]);

  const connect = useCallback(() => {
    if (mockEnabled) return;
    if (unmounted.current) return;
    const ws = new WebSocket(retroWsUrl(token));
    wsRef.current = ws;
    ws.onopen = () => {
      reconnectDelay.current = 1000;
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.type === "ping") return;
        if (msg.type === "retro_state") {
          const incoming = msg.state as RetroLiveState;
          setState((prev) =>
            mergeRetroState(prev, incoming, { preserveMyVotes: Boolean(participantIdRef.current) }),
          );
          if (participantIdRef.current && incoming.my_votes?.length) {
            setMyVotes(new Set(incoming.my_votes));
          }
          reconnectDelay.current = 1000;
        }
      } catch {
        // ignore parse errors
      }
    };
    ws.onclose = (ev) => {
      if (unmounted.current) return;
      if (ev.code === 4004) {
        setError("Ретро недоступно или ссылка истекла.");
        return;
      }
      const delay = reconnectDelay.current;
      reconnectDelay.current = Math.min(delay * 2, 30000);
      reconnectTimer.current = setTimeout(connect, delay);
    };
    ws.onerror = () => ws.close();
  }, [mockEnabled, token]);

  useEffect(() => {
    if (mockEnabled) return;
    unmounted.current = false;
    connect();
    return () => {
      unmounted.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect, mockEnabled]);

  const join = useCallback(
    async (name: string, role: ParticipantRole) => {
      setError(null);
      if (mockEnabled) {
        saveWebIdentity(name, role);
        try {
          localStorage.setItem(pidKey, MOCK_PARTICIPANT_ID);
        } catch {
          // ignore storage errors
        }
        setParticipantId(MOCK_PARTICIPANT_ID);
        setState(createMockRetroLiveState());
        setMyVotes(new Set());
        return;
      }
      try {
        const data = await postJson<{ participant_id: string; state: RetroLiveState }>(
          "/retro/join",
          { token, name, role },
        );
        saveWebIdentity(name, role);
        try {
          localStorage.setItem(pidKey, data.participant_id);
        } catch {
          // ignore storage errors
        }
        setParticipantId(data.participant_id);
        setState(data.state);
        setMyVotes(new Set(data.state.my_votes ?? []));
      } catch (e) {
        const message = e instanceof Error ? e.message : "Не удалось подключиться";
        setError(message);
        throw e;
      }
    },
    [mockEnabled, token, pidKey],
  );

  const addCard = useCallback(
    async (sectionId: string, text: string): Promise<boolean> => {
      const pid = participantIdRef.current;
      if (!pid) return false;
      setError(null);
      if (mockEnabled) {
        const trimmed = text.trim();
        if (!trimmed) return false;
        setState((prev) => {
          if (!prev || !canAddToSection(prev, sectionId)) return prev;
          const cardId = `mock-card-${prev.cards.length + 1}`;
          const next = {
            ...prev,
            cards: [
              ...prev.cards,
              { card_id: cardId, section_id: sectionId, text: trimmed, vote_count: 0 },
            ],
            version: prev.version + 1,
          };
          return next;
        });
        return true;
      }
      try {
        const next = await postJson<RetroLiveState>("/retro/card", {
          token,
          participant_id: pid,
          section_id: sectionId,
          text,
        });
        setState(next);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось добавить карточку");
        return false;
      }
    },
    [mockEnabled, token],
  );

  const toggleVote = useCallback(
    async (targetId: string, targetType: "card" | "group" = "card"): Promise<boolean> => {
      const pid = participantIdRef.current;
      if (!pid) return false;
      setError(null);
      if (mockEnabled) {
        let changed = false;
        setState((prev) => {
          if (!prev || prev.phase !== "voting") return prev;
          const currentVotes = new Set(prev.my_votes ?? []);
          const hasVote = currentVotes.has(targetId);
          const budget = prev.votes_per_person;
          if (!hasVote && currentVotes.size >= budget) return prev;
          if (hasVote) {
            currentVotes.delete(targetId);
          } else {
            currentVotes.add(targetId);
          }
          const delta = hasVote ? -1 : 1;
          const cards = targetType === "card"
            ? prev.cards.map((c) => {
              if (c.card_id !== targetId) return c;
              return { ...c, vote_count: Math.max(0, c.vote_count + delta) };
            })
            : prev.cards;
          const groups = targetType === "group"
            ? prev.groups.map((g) => {
              if (g.group_id !== targetId) return g;
              return { ...g, vote_count: Math.max(0, g.vote_count + delta) };
            })
            : prev.groups;
          const nextVotes = [...currentVotes];
          setMyVotes(new Set(nextVotes));
          changed = true;
          return {
            ...prev,
            cards,
            groups,
            my_votes: nextVotes,
            my_votes_used: nextVotes.length,
            my_votes_remaining: Math.max(0, budget - nextVotes.length),
            version: prev.version + 1,
          };
        });
        return changed;
      }
      try {
        const next = await postJson<RetroLiveState>("/retro/vote", {
          token,
          participant_id: pid,
          target_id: targetId,
          target_type: targetType,
        });
        setState(next);
        setMyVotes(new Set(next.my_votes ?? []));
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось проголосовать");
        return false;
      }
    },
    [mockEnabled, token],
  );

  const votesRemaining = useMemo(() => {
    const perPerson = state?.votes_per_person ?? 0;
    return Math.max(0, perPerson - myVotes.size);
  }, [state?.votes_per_person, myVotes]);

  const phase: RetroPhase | "joining" =
    options.participant && participantId === null ? "joining" : state?.phase ?? "lobby";

  return {
    state,
    phase,
    participantId,
    myVotes,
    votesRemaining,
    applyState,
    join,
    addCard,
    toggleVote,
    error,
  };
}

export function identityToRole(identity: WebParticipantIdentity | null): ParticipantRole | null {
  return identity?.role ?? null;
}

function getAnonymousRetroEmail(storageKey: string): string {
  let seed = "";
  try {
    seed = localStorage.getItem(storageKey) ?? "";
    if (!seed) {
      seed =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(storageKey, seed);
    }
  } catch {
    seed = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  const safe = seed.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24) || "guest";
  return `retro-${safe}@${PARTICIPANT_EMAIL_DOMAIN}`;
}
