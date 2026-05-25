import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl, wsUrl } from "../app/config";
import { saveWebIdentity } from "../shared/lib/participantIdentity";

export interface TaskInfo {
  task_id?: string;
  text: string;
  jira_key?: string;
  story_points?: number | null;
  ai_summary?: AiTaskSummary | null;
  index: number;
  total: number;
}

export interface AiTaskSummary {
  description: string;
  methods: string[];
  complexity: string;
  generated_at: string;
  source: string;
}

export type ParticipantRole = "backend" | "frontend" | "qa";

export interface ParticipantStatus {
  name: string;
  role?: ParticipantRole;
  voted: boolean;
}

export interface VoteResult {
  name: string;
  value: string;
}

export type Phase = "joining" | "waiting" | "voting" | "results" | "complete";

export interface WebSessionState {
  task: TaskInfo | null;
  phase: Phase;
  participants: ParticipantStatus[];
  results?: VoteResult[];
}

interface UseSessionReturn {
  state: WebSessionState | null;
  phase: Phase;
  participantId: string | null;
  join: (name: string, role: ParticipantRole) => Promise<void>;
  /** Returns true on a successful vote, false on server-side rejection. */
  vote: (value: string) => Promise<boolean>;
  error: string | null;
}

export function useSession(token: string): UseSessionReturn {
  const pidKey = `pp_pid_${token}`;
  const [participantId, setParticipantId] = useState<string | null>(
    () => localStorage.getItem(pidKey)
  );
  const [state, setState] = useState<WebSessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(1000);
  const unmounted = useRef(false);

  const phase: Phase = participantId === null ? "joining" : (state?.phase ?? "waiting");

  const connect = useCallback(() => {
    if (unmounted.current || !participantId) return;

    const ws = new WebSocket(wsUrl(token));
    wsRef.current = ws;

    ws.onopen = () => {
      // Reset backoff when we successfully establish a fresh connection,
      // even if no session_state message arrives immediately afterwards.
      reconnectDelay.current = 1000;
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.type === "ping") return;

        if (msg.type === "session_state") {
          setState(msg.state as WebSessionState);
          reconnectDelay.current = 1000;
        } else if (msg.type === "vote_cast") {
          setState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              participants: prev.participants.map((p) =>
                p.name === msg.voter_name ? { ...p, voted: true } : p
              ),
            };
          });
        } else if (msg.type === "results") {
          setState((prev) => ({
            ...(prev ?? { task: null, participants: [] }),
            phase: "results",
            results: msg.votes as VoteResult[],
            task: msg.task ?? prev?.task ?? null,
          }));
        } else if (msg.type === "next_task") {
          setState((prev) => ({
            ...(prev ?? { participants: [] }),
            phase: "voting",
            task: msg.task as TaskInfo,
            results: undefined,
            participants: (prev?.participants ?? []).map((p) => ({ ...p, voted: false })),
          }));
        } else if (msg.type === "batch_complete") {
          setState((prev) => ({
            ...(prev ?? { task: null, participants: [] }),
            phase: "complete",
          }));
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = (ev) => {
      if (unmounted.current) return;
      // 4004 = invalid/expired session token (see backend websocket_endpoint).
      // Stop reconnecting and surface a clear "join again" state instead of an
      // infinite backoff loop against a token that will never be valid.
      if (ev.code === 4004) {
        try {
          localStorage.removeItem(pidKey);
        } catch {
          // ignore storage errors
        }
        setParticipantId(null);
        setState(null);
        setError("Сессия истекла. Откройте ссылку заново.");
        return;
      }
      const delay = reconnectDelay.current;
      reconnectDelay.current = Math.min(delay * 2, 30000);
      reconnectTimer.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [token, participantId, pidKey]);

  useEffect(() => {
    unmounted.current = false;
    if (participantId) connect();
    return () => {
      unmounted.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect, participantId]);

  const join = useCallback(
    async (name: string, role: ParticipantRole) => {
      setError(null);
      let resp: Response;
      try {
        resp = await fetch(apiUrl("/web/join"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, name, role }),
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Network error";
        setError(message);
        throw new Error(message);
      }
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        const message = (data as { detail?: string }).detail ?? "Failed to join";
        setError(message);
        throw new Error(message);
      }
      const data = (await resp.json()) as { participant_id: string; session: WebSessionState };
      saveWebIdentity(name, role);
      try {
        localStorage.setItem(pidKey, data.participant_id);
      } catch {
        // ignore storage errors
      }
      setParticipantId(data.participant_id);
      setState(data.session);
    },
    [token, pidKey]
  );

  const vote = useCallback(
    async (value: string): Promise<boolean> => {
      if (!participantId) return false;
      setError(null);
      let resp: Response;
      try {
        resp = await fetch(apiUrl("/web/vote"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, participant_id: participantId, value }),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error");
        return false;
      }
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        setError((data as { detail?: string }).detail ?? "Vote failed");
        // Participant token expired or was invalidated — clear local state so
        // the user can rejoin instead of being stuck in a phantom "voted"
        // state from a stale localStorage participant_id.
        if (resp.status === 403 || resp.status === 404) {
          try {
            localStorage.removeItem(pidKey);
          } catch {
            // ignore storage errors (private mode, etc.)
          }
          setParticipantId(null);
          setState(null);
        }
        return false;
      }
      return true;
    },
    [token, participantId, pidKey]
  );

  return { state, phase, participantId, join, vote, error };
}
