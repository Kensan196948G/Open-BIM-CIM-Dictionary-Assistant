/**
 * Neon-backed IngestionRecorder (#29): persists ingestion runs and items to
 * ingestion_runs / ingestion_items (詳細設計仕様書 §3.3) via the same raw
 * parameterized `neon()` query function that seed.ts uses — no Drizzle query
 * builder involved, so a lightweight fake can drive tests without a database.
 *
 * Usage (CLI): DATABASE_URL=<neon conn> pnpm --filter @obcda/ingestion dry-run -- --persist
 * The connection string is read from the environment and never printed.
 */

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

import type {
  IngestionItemRecord,
  IngestionRecorder,
  IngestionRunFinish,
  IngestionRunStart,
} from "./recorder";

/** The `neon(url)` query function shape (template-literal SQL). */
export type NeonSql = NeonQueryFunction<false, false>;

export class NeonIngestionRecorder implements IngestionRecorder {
  constructor(private readonly sql: NeonSql) {}

  /** Factory from a connection string (secret — never logged). */
  static connect(databaseUrl: string): NeonIngestionRecorder {
    return new NeonIngestionRecorder(neon(databaseUrl));
  }

  async startRun(input: IngestionRunStart): Promise<string> {
    const sourceRows = (await this.sql`
      SELECT id FROM sources WHERE code = ${input.sourceCode} LIMIT 1
    `) as { id: string }[];
    const sourceId = sourceRows[0]?.id;
    if (!sourceId) {
      // sources 台帳（§5.5 FR-301）に無い出典は記録できない — 失敗を明示する
      throw new Error(
        `unknown source code '${input.sourceCode}' — sources ledger に登録してください`,
      );
    }

    let sourceVersionId: string | null = null;
    if (input.versionLabel) {
      const versionRows = (await this.sql`
        SELECT id FROM source_versions
        WHERE source_id = ${sourceId} AND version_label = ${input.versionLabel}
        LIMIT 1
      `) as { id: string }[];
      sourceVersionId = versionRows[0]?.id ?? null;
    }

    const runRows = (await this.sql`
      INSERT INTO ingestion_runs (source_id, source_version_id, status, started_at)
      VALUES (${sourceId}, ${sourceVersionId}, 'running', ${input.startedAt})
      RETURNING id
    `) as { id: string }[];
    const runId = runRows[0]?.id;
    if (!runId) throw new Error("ingestion_runs insert returned no id");
    return runId;
  }

  async recordItem(runId: string, item: IngestionItemRecord): Promise<void> {
    await this.sql`
      INSERT INTO ingestion_items (
        run_id, item_hash, status, error_code, retry_count, payload_summary
      )
      VALUES (
        ${runId}, ${item.itemHash}, ${item.status}, ${item.errorCode ?? null}, 0,
        ${item.payloadSummary ? JSON.stringify(item.payloadSummary) : null}
      )
    `;
  }

  async finishRun(runId: string, result: IngestionRunFinish): Promise<void> {
    await this.sql`
      UPDATE ingestion_runs SET
        status = ${result.status},
        finished_at = ${result.finishedAt},
        fetched_count = ${result.fetchedCount},
        warning_count = ${result.warningCount},
        error_summary = ${result.errorSummary ? JSON.stringify(result.errorSummary) : null}
      WHERE id = ${runId}
    `;
  }
}

/** CLI 用: DATABASE_URL を環境変数から読み、未設定なら失敗する（値は表示しない）。 */
export function requireDatabaseUrl(): string {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error(
      "--persist には DATABASE_URL 環境変数（Neon 接続文字列）が必要です。",
    );
  }
  return databaseUrl;
}
