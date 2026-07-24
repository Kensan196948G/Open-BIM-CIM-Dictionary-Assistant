/**
 * Pipeline runner (§4.1/§4.2): drives one SourceAdapter through
 * discover → fetch → parse → normalize → validate, recording progress in the
 * IngestionRecorder port. Item-level failures never abort the run — they are
 * recorded as `failed` items and reflected in the final run status
 * (succeeded / partial / failed).
 */

import type { IngestionRunStatus } from "@obcda/domain";

import type {
  AdapterContext,
  DiscoveredVersion,
  NormalizedRecord,
  ParsedRecord,
  SourceAdapter,
} from "../adapters/types";
import type { IngestionRecorder } from "./recorder";

export type RunIngestionOptions = {
  adapter: SourceAdapter;
  ctx: AdapterContext;
  recorder: IngestionRecorder;
  /** Stop collecting after this many parsed items per version (dry-run valve). */
  maxItemsPerVersion?: number;
  /**
   * Keep validated records in the summary (default true — dry-run inspection).
   * Full-scale runs that persist via the recorder should pass false so memory
   * stays flat regardless of dictionary size.
   */
  collectRecords?: boolean;
};

export type VersionRunSummary = {
  runId: string;
  sourceCode: string;
  versionLabel: string;
  status: IngestionRunStatus;
  fetchedArtifacts: number;
  itemCounts: { validated: number; failed: number };
  warningCount: number;
  /** True when maxItemsPerVersion cut the run short. */
  truncated: boolean;
  /** Records that passed validation, in pipeline order. */
  records: NormalizedRecord[];
  errorSummary?: Record<string, unknown>;
};

/** Deterministic JSON (sorted object keys) so content hashes are stable. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(
      entries.map(([key, entryValue]) => [key, sortValue(entryValue)]),
    );
  }
  return value;
}

async function sha256HexOf(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Ingest every discovered version of one adapter. Never throws per-version. */
export async function runIngestion(
  options: RunIngestionOptions,
): Promise<VersionRunSummary[]> {
  const { adapter, ctx } = options;
  const versions = await adapter.discover(ctx);
  const summaries: VersionRunSummary[] = [];
  for (const version of versions) {
    summaries.push(await runVersion(version, options));
  }
  return summaries;
}

async function runVersion(
  version: DiscoveredVersion,
  options: RunIngestionOptions,
): Promise<VersionRunSummary> {
  const { adapter, ctx, recorder, maxItemsPerVersion, collectRecords = true } = options;
  const startedAt = ctx.now().toISOString();
  const runId = await recorder.startRun({
    sourceCode: adapter.sourceCode,
    versionLabel: version.versionLabel,
    startedAt,
  });

  const summary: VersionRunSummary = {
    runId,
    sourceCode: adapter.sourceCode,
    versionLabel: version.versionLabel,
    status: "running",
    fetchedArtifacts: 0,
    itemCounts: { validated: 0, failed: 0 },
    warningCount: 0,
    truncated: false,
    records: [],
  };

  const finish = async (
    status: IngestionRunStatus,
    errorSummary?: Record<string, unknown>,
  ) => {
    summary.status = status;
    if (errorSummary) summary.errorSummary = errorSummary;
    await recorder.finishRun(runId, {
      status,
      finishedAt: ctx.now().toISOString(),
      fetchedCount: summary.fetchedArtifacts,
      warningCount: summary.warningCount,
      ...(errorSummary ? { errorSummary } : {}),
    });
  };

  try {
    let artifacts;
    try {
      artifacts = await adapter.fetch(version, ctx);
    } catch (error) {
      await finish("failed", { stage: "fetch", message: errorMessage(error) });
      return summary;
    }
    summary.fetchedArtifacts = artifacts.length;

    let itemsSeen = 0;

    for (const artifact of artifacts) {
      if (summary.truncated) break;
      try {
        for await (const parsed of adapter.parse(artifact, {
          sourceCode: adapter.sourceCode,
        })) {
          if (maxItemsPerVersion !== undefined && itemsSeen >= maxItemsPerVersion) {
            summary.truncated = true;
            break;
          }
          itemsSeen += 1;
          await processItem(parsed);
        }
      } catch (error) {
        // parse aborted for this artifact — record it and move to the next one
        summary.itemCounts.failed += 1;
        await recorder.recordItem(runId, {
          itemHash: artifact.sha256,
          status: "failed",
          errorCode: "parse_error",
          payloadSummary: { url: artifact.url, message: errorMessage(error) },
        });
      }
    }

    const { validated, failed } = summary.itemCounts;
    const status: IngestionRunStatus =
      failed > 0 ? (validated > 0 ? "partial" : "failed") : "succeeded";
    await finish(status);
  } catch (error) {
    // recorder or other unexpected failures must never leave the run "running"
    if (summary.status === "running") {
      const errorSummary = { stage: "pipeline", message: errorMessage(error) };
      try {
        await finish("failed", errorSummary);
      } catch {
        summary.status = "failed";
        summary.errorSummary = errorSummary;
      }
    }
  }
  return summary;

  async function processItem(parsed: ParsedRecord): Promise<void> {
    let record: NormalizedRecord;
    try {
      record = adapter.normalize(parsed, {
        sourceCode: adapter.sourceCode,
        versionLabel: version.versionLabel,
      });
    } catch (error) {
      summary.itemCounts.failed += 1;
      await recorder.recordItem(runId, {
        itemHash: await sha256HexOf(stableStringify(parsed.payload)),
        status: "failed",
        errorCode: "normalize_error",
        payloadSummary: {
          ...(parsed.externalId ? { externalId: parsed.externalId } : {}),
          message: errorMessage(error),
        },
      });
      return;
    }

    const itemHash = await sha256HexOf(stableStringify(record));
    const verdict = adapter.validate(record);
    if (!verdict.ok) {
      summary.itemCounts.failed += 1;
      await recorder.recordItem(runId, {
        itemHash,
        status: "failed",
        errorCode: `validation:${verdict.issues[0]?.code ?? "unknown"}`,
        payloadSummary: {
          canonicalKey: record.canonicalKey,
          issues: verdict.issues.map((issue) => issue.code),
        },
      });
      return;
    }

    summary.itemCounts.validated += 1;
    summary.warningCount += verdict.warnings.length;
    if (collectRecords) summary.records.push(record);
    await recorder.recordItem(runId, {
      itemHash,
      status: "validated",
      payloadSummary: {
        canonicalKey: record.canonicalKey,
        conceptType: record.conceptType,
        officialName: record.officialName,
        ...(verdict.warnings.length > 0
          ? { warnings: verdict.warnings.map((warning) => warning.code) }
          : {}),
      },
    });
  }
}
