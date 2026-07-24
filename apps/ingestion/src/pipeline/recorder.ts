/**
 * Ingestion progress recording port (§3.3 ingestion_runs / ingestion_items).
 *
 * Mirrors the DB tables' shape but stays storage-agnostic: the in-memory
 * implementation backs dry-runs and tests today; a Drizzle-backed one plugs in
 * once the Pages/DB secret gate opens (same port pattern as
 * DictionaryRepository).
 */

import type { IngestionItemStatus, IngestionRunStatus } from "@obcda/domain";

export type IngestionRunStart = {
  sourceCode: string;
  versionLabel?: string;
  startedAt: string;
};

export type IngestionItemRecord = {
  /** SHA-256 hex over the item's canonical content (§4.2 同一hash判定の材料). */
  itemHash: string;
  status: IngestionItemStatus;
  errorCode?: string;
  payloadSummary?: Record<string, unknown>;
};

export type IngestionRunFinish = {
  status: IngestionRunStatus;
  finishedAt: string;
  fetchedCount: number;
  warningCount: number;
  errorSummary?: Record<string, unknown>;
};

export interface IngestionRecorder {
  startRun(input: IngestionRunStart): Promise<string>;
  recordItem(runId: string, item: IngestionItemRecord): Promise<void>;
  finishRun(runId: string, result: IngestionRunFinish): Promise<void>;
}

export type RecordedRun = IngestionRunStart & {
  runId: string;
  status: IngestionRunStatus;
  finishedAt?: string;
  fetchedCount: number;
  warningCount: number;
  errorSummary?: Record<string, unknown>;
  items: IngestionItemRecord[];
};

export class InMemoryIngestionRecorder implements IngestionRecorder {
  readonly runs: RecordedRun[] = [];
  private nextRunId = 1;

  startRun(input: IngestionRunStart): Promise<string> {
    const runId = `run-${this.nextRunId++}`;
    this.runs.push({
      ...input,
      runId,
      status: "running",
      fetchedCount: 0,
      warningCount: 0,
      items: [],
    });
    return Promise.resolve(runId);
  }

  recordItem(runId: string, item: IngestionItemRecord): Promise<void> {
    this.mustFind(runId).items.push(item);
    return Promise.resolve();
  }

  finishRun(runId: string, result: IngestionRunFinish): Promise<void> {
    const run = this.mustFind(runId);
    run.status = result.status;
    run.finishedAt = result.finishedAt;
    run.fetchedCount = result.fetchedCount;
    run.warningCount = result.warningCount;
    if (result.errorSummary) run.errorSummary = result.errorSummary;
    return Promise.resolve();
  }

  private mustFind(runId: string): RecordedRun {
    const run = this.runs.find((candidate) => candidate.runId === runId);
    if (!run) throw new Error(`unknown ingestion run: ${runId}`);
    return run;
  }
}
