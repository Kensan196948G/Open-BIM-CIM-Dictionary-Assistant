import { describe, expect, it } from "vitest";

import {
  NeonIngestionRecorder,
  requireDatabaseUrl,
} from "../src/pipeline/neonRecorder";
import type { NeonSql } from "../src/pipeline/neonRecorder";

/**
 * DB なしで NeonIngestionRecorder を検証する fake SQL:
 * 実行されたクエリ本文とパラメータを記録し、クエリ内容に応じて固定行を返す。
 */
function fakeSql(handler: (text: string, params: unknown[]) => unknown[]): {
  sql: NeonSql;
  queries: { text: string; params: unknown[] }[];
} {
  const queries: { text: string; params: unknown[] }[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce(
      (acc, part, index) => acc + part + (index < values.length ? `$${index + 1}` : ""),
      "",
    );
    queries.push({ text, params: values });
    return Promise.resolve(handler(text, values));
  }) as unknown as NeonSql;
  return { sql, queries };
}

describe("NeonIngestionRecorder (#29 DB 永続化)", () => {
  it("resolves the source, inserts a run with version, and returns the run id", async () => {
    const { sql, queries } = fakeSql((text) => {
      if (text.includes("FROM sources")) return [{ id: "src-1" }];
      if (text.includes("FROM source_versions")) return [{ id: "ver-9" }];
      if (text.includes("INSERT INTO ingestion_runs")) return [{ id: "run-42" }];
      return [];
    });
    const recorder = new NeonIngestionRecorder(sql);

    const runId = await recorder.startRun({
      sourceCode: "BSI_IFC_SPEC",
      versionLabel: "IFC4.3.2.0",
      startedAt: "2026-08-14T00:00:00Z",
    });

    expect(runId).toBe("run-42");
    const texts = queries.map((q) => q.text);
    expect(texts[0]).toContain("FROM sources WHERE code = $1");
    expect(queries[0]!.params).toEqual(["BSI_IFC_SPEC"]);
    expect(texts[1]).toContain("FROM source_versions");
    expect(queries[1]!.params).toEqual(["src-1", "IFC4.3.2.0"]);
    expect(texts[2]).toContain("INSERT INTO ingestion_runs");
    expect(texts[2]).toContain("'running'");
    expect(queries[2]!.params).toContain("src-1");
    expect(queries[2]!.params).toContain("ver-9");
  });

  it("throws for unknown source codes (sources ledger gate)", async () => {
    const { sql } = fakeSql(() => []);
    const recorder = new NeonIngestionRecorder(sql);
    await expect(
      recorder.startRun({ sourceCode: "NOPE", startedAt: "2026-08-14T00:00:00Z" }),
    ).rejects.toThrow(/unknown source code 'NOPE'/);
  });

  it("records items with hash, status and JSON-encoded payload summary", async () => {
    const { sql, queries } = fakeSql(() => []);
    const recorder = new NeonIngestionRecorder(sql);
    await recorder.recordItem("run-1", {
      itemHash: "abc123",
      status: "validated",
      payloadSummary: { canonicalKey: "ifc4x3:entity:IfcWall" },
    });
    const [query] = queries;
    expect(query!.text).toContain("INSERT INTO ingestion_items");
    expect(query!.text).toContain("error_code");
    expect(query!.params).toContain("run-1");
    expect(query!.params).toContain("abc123");
    expect(query!.params).toContain("validated");
    expect(query!.params).toContain(
      JSON.stringify({ canonicalKey: "ifc4x3:entity:IfcWall" }),
    );
  });

  it("finishes the run with status and counters, and clears error_summary when absent", async () => {
    const { sql, queries } = fakeSql(() => []);
    const recorder = new NeonIngestionRecorder(sql);
    await recorder.finishRun("run-1", {
      status: "succeeded",
      finishedAt: "2026-08-14T00:01:00Z",
      fetchedCount: 3,
      warningCount: 1,
    });
    const [query] = queries;
    expect(query!.text).toContain("UPDATE ingestion_runs SET");
    expect(query!.params).toEqual([
      "succeeded",
      "2026-08-14T00:01:00Z",
      3,
      1,
      null,
      "run-1",
    ]);
  });

  it("requireDatabaseUrl throws without a connection string and never prints it", () => {
    const previous = process.env["DATABASE_URL"];
    delete process.env["DATABASE_URL"];
    try {
      expect(() => requireDatabaseUrl()).toThrow(/DATABASE_URL/);
    } finally {
      if (previous !== undefined) process.env["DATABASE_URL"] = previous;
    }
  });
});
