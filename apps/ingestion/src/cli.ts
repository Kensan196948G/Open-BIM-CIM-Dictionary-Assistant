/**
 * Dry-run CLI (#13 受入条件): ingest one bSDD dictionary through the full
 * pipeline without touching any database — progress goes to the in-memory
 * recorder and a summary (plus sample normalized records) to stdout.
 *
 *   pnpm --filter @obcda/ingestion dry-run [-- --dictionary <uri>] \
 *     [--max-items 50] [--page-size 100] [--max-pages 1] [--samples 3]
 *
 * Defaults stay polite to the public API: one page per list, 50 items.
 */

import { BsddRestAdapter } from "./adapters/bsdd";
import { InMemoryIngestionRecorder } from "./pipeline/recorder";
import { runIngestion } from "./pipeline/runner";

const DEFAULT_DICTIONARY_URI =
  "https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3";

/** Hosts the adapter may contact (§4.3 Allowlist — the source ledger entry). */
const BSDD_ALLOWED_HOSTS = ["api.bsdd.buildingsmart.org"];

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`--${name} requires a value`);
  }
  return value;
}

function readIntFlag(args: string[], name: string, fallback: number): number {
  const raw = readFlag(args, name);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer, got ${raw}`);
  }
  return parsed;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const dictionaryUri = readFlag(args, "dictionary") ?? DEFAULT_DICTIONARY_URI;
  const maxItems = readIntFlag(args, "max-items", 50);
  const pageSize = readIntFlag(args, "page-size", 100);
  const maxPages = readIntFlag(args, "max-pages", 1);
  const samples = readIntFlag(args, "samples", 3);

  const adapter = new BsddRestAdapter({
    dictionaryUris: [dictionaryUri],
    pageSize,
    maxPagesPerList: maxPages,
  });
  const recorder = new InMemoryIngestionRecorder();

  console.error(`bsdd dry-run: ${dictionaryUri}`);
  const summaries = await runIngestion({
    adapter,
    ctx: { fetchImpl: fetch, allowedHosts: BSDD_ALLOWED_HOSTS, now: () => new Date() },
    recorder,
    maxItemsPerVersion: maxItems,
  });

  for (const summary of summaries) {
    const { records, ...rest } = summary;
    const report = JSON.stringify(
      {
        ...rest,
        recordCount: records.length,
        sampleRecords: records.slice(0, samples),
        recordedItemStatuses: recorder.runs
          .find((run) => run.runId === summary.runId)
          ?.items.reduce<Record<string, number>>((acc, item) => {
            acc[item.status] = (acc[item.status] ?? 0) + 1;
            return acc;
          }, {}),
      },
      null,
      2,
    );
    process.stdout.write(`${report}\n`);
  }

  const failed = summaries.some((summary) => summary.status === "failed");
  return failed ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
