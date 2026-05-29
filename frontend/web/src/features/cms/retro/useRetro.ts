import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiUrl, retroWsUrl } from "../../../app/config";
import { saveWebIdentity, type WebParticipantIdentity } from "../../../shared/lib/participantIdentity";
import type { ParticipantRole } from "../../../hooks/useSession";
import type { RetroLiveState, RetroPhase } from "./retroLogic";

interface UseRetroReturn {
  state: RetroLiveState | null;
  phase: RetroPhase | "joining";
  participantId: string | null;
  /** Cards the current participant has voted on (authoritative, local). */
  myVotes: Set<string>;
  votesRemaining: number;
  join: (name: string, role: ParticipantRole) => Promise<void>;
  addCard: (sectionId: string, text: string) => Promise<boolean>;
  toggleVote: (cardId: string) => Promise<boolean>;
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
export function useRetro(token: string, options: { participant?: boolean } = {}): UseRetroReturn {
  const pidKey = `pp_retro_pid_${token}`;
  const [participantId, setParticipantId] = useState<string | null>(() => {
    try {
      return options.participant ? localStorage.getItem(pidKey) : null;
    } catch {
      return null;
    }
  });
  const [state, setState] = useState<RetroLiveState | null>(null);
  const [myVotes, setMyVotes] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(1000);
  const unmounted = useRef(false);
  const participantIdRef = useRef<string | null>(participantId);
  participantIdRef.current = participantId;

  // Seed once from the HTTP state endpoint, then rely on the WebSocket.
  useEffect(() => {
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
  }, [token, participantId]);

  const connect = useCallback(() => {
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
          // Broadcast carries aggregate counts only; keep our local dots.
          setState(msg.state as RetroLiveState);
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
  }, [token]);

  useEffect(() => {
    unmounted.current = false;
    connect();
    return () => {
      unmounted.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const join = useCallback(
    async (name: string, role: ParticipantRole) => {
      setError(null);
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
    [token, pidKey],
  );

  const addCard = useCallback(
    async (sectionId: string, text: string): Promise<boolean> => {
      const pid = participantIdRef.current;
      if (!pid) return false;
      setError(null);
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
    [token],
  );

  const toggleVote = useCallback(
    async (cardId: string): Promise<boolean> => {
      const pid = participantIdRef.current;
      if (!pid) return false;
      setError(null);
      try {
        const next = await postJson<RetroLiveState>("/retro/vote", {
          token,
          participant_id: pid,
          card_id: cardId,
        });
        setState(next);
        setMyVotes(new Set(next.my_votes ?? []));
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось проголосовать");
        return false;
      }
    },
    [token],
  );

  const votesRemaining = useMemo(() => {
    const perPerson = state?.votes_per_person ?? 0;
    return Math.max(0, perPerson - myVotes.size);
  }, [state?.votes_per_person, myVotes]);

  const phase: RetroPhase | "joining" =
    options.participant && participantId === null ? "joining" : state?.phase ?? "lobby";

  return { state, phase, participantId, myVotes, votesRemaining, join, addCard, toggleVote, error };
}

export function identityToRole(identity: WebParticipantIdentity | null): ParticipantRole | null {
  return identity?.role ?? null;
}
