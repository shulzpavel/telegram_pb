import { useMemo, useState } from "react";
import type { ParticipantRole, ParticipantStatus, VoteResult } from "../hooks/useSession";
import JoinPage from "./JoinPage";
import ResultsPage from "./ResultsPage";
import VotePage from "./VotePage";

const MOCK_TASKS = [
  {
    text: "Добавить авторизацию через SSO (Google, Microsoft)",
    jira_key: "FLEX-365",
    index: 2,
    total: 8,
  },
  {
    text: "Сделать роли и права доступа для CMS",
    jira_key: "FLEX-366",
    index: 3,
    total: 8,
  },
  {
    text: "Оптимизировать списки CMS под большие объёмы данных",
    jira_key: "FLEX-367",
    index: 4,
    total: 8,
  },
];

const MOCK_PARTICIPANTS = [
  { name: "Маша", role: "frontend" as const, voted: true },
  { name: "Иван", role: "backend" as const, voted: false },
  { name: "Петя", role: "qa" as const, voted: true },
  { name: "Оля", role: "qa" as const, voted: false },
  { name: "Саша", role: "backend" as const, voted: true },
];

const MOCK_RESULTS = [
  { name: "Маша", value: "5" },
  { name: "Иван", value: "8" },
  { name: "Петя", value: "5" },
  { name: "Оля", value: "3" },
  { name: "Саша", value: "5" },
];

type DemoPhase = "join" | "vote" | "results";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default function DemoPage() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view") ?? "join";
  const [phase, setPhase] = useState<DemoPhase>("join");
  const [taskIndex, setTaskIndex] = useState(0);
  const [participant, setParticipant] = useState<{ name: string; role: ParticipantRole } | null>(null);
  const [ownVote, setOwnVote] = useState<string | null>(null);
  const task = MOCK_TASKS[taskIndex];

  const participants = useMemo<ParticipantStatus[]>(() => {
    if (!participant) return MOCK_PARTICIPANTS;
    return [
      { name: participant.name, role: participant.role, voted: ownVote !== null },
      ...MOCK_PARTICIPANTS,
    ];
  }, [ownVote, participant]);

  const results = useMemo<VoteResult[]>(() => {
    if (!participant || !ownVote) return MOCK_RESULTS;
    return [{ name: participant.name, value: ownVote }, ...MOCK_RESULTS];
  }, [ownVote, participant]);

  async function joinDemo(name: string, role: ParticipantRole) {
    await delay(250);
    setParticipant({ name, role });
    setOwnVote(null);
    setPhase("vote");
  }

  async function voteDemo(value: string): Promise<boolean> {
    setOwnVote(value);
    await delay(850);
    setPhase("results");
    return true;
  }

  function nextTask() {
    setTaskIndex((current) => (current + 1) % MOCK_TASKS.length);
    setOwnVote(null);
    setPhase("vote");
  }

  function restartDemo() {
    setTaskIndex(0);
    setParticipant(null);
    setOwnVote(null);
    setPhase("join");
  }

  if (params.has("view")) {
    if (view === "vote") {
      return (
        <VotePage
          task={MOCK_TASKS[0]}
          participants={MOCK_PARTICIPANTS}
          onVote={async () => true}
          error={null}
        />
      );
    }

    if (view === "results") {
      return <ResultsPage task={MOCK_TASKS[0]} results={MOCK_RESULTS} _skipAnimation />;
    }

    return <JoinPage task={MOCK_TASKS[0]} onJoin={async () => {}} error={null} />;
  }

  if (phase === "vote") {
    return <VotePage task={task} participants={participants} onVote={voteDemo} error={null} />;
  }

  if (phase === "results") {
    return <ResultsPage task={task} results={results} onNextTask={nextTask} onRestart={restartDemo} />;
  }

  return <JoinPage task={task} onJoin={joinDemo} error={null} />;
}
