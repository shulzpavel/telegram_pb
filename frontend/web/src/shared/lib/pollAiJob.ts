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
  const intervalMs = options?.intervalMs ?? 1500;
  const timeoutMs = options?.timeoutMs ?? 120_000;
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

  throw new Error("AI generation timed out");
}
