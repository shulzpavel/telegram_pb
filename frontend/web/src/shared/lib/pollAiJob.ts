export type AiJobStatus = "queued" | "running" | "done" | "error";

export interface AiJobResponse<T> {
  job_id?: string;
  status?: AiJobStatus;
  phase?: string;
  message?: string;
  error?: string;
  result?: T;
  cached?: boolean;
}

/** Default poll interval for async AI jobs. */
export const AI_JOB_POLL_INTERVAL_MS = 1200;

/**
 * Scope board analysis may run two Anthropic calls (validation repair) at
 * SCOPE_AI_TIMEOUT_SECONDS each — keep the client wait above that budget.
 */
export const SCOPE_AI_POLL_TIMEOUT_MS = 300_000;

/** Session / retro AI jobs are usually a single shorter LLM call. */
export const DEFAULT_AI_POLL_TIMEOUT_MS = 180_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function pollAiJob<T>(
  fetchStatus: () => Promise<AiJobResponse<T>>,
  options?: {
    intervalMs?: number;
    timeoutMs?: number;
    onProgress?: (job: AiJobResponse<T>) => void;
  }
): Promise<T> {
  const intervalMs = options?.intervalMs ?? AI_JOB_POLL_INTERVAL_MS;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_AI_POLL_TIMEOUT_MS;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const job = await fetchStatus();
    options?.onProgress?.(job);

    if (job.status === "done" && job.result !== undefined) {
      return job.result;
    }
    if (job.status === "error") {
      throw new Error(job.error || job.message || "AI generation failed");
    }
    await sleep(intervalMs);
  }

  throw new Error("Превышено время ожидания AI-генерации");
}
