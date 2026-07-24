import { normalizeLabel } from "@obcda/domain";
import { describe, expect, it } from "vitest";

import type {
  DiscoveredVersion,
  NormalizedRecord,
  ParsedRecord,
  RawArtifact,
  SourceAdapter,
  ValidationResult,
} from "../src/adapters/types";
import { InMemoryIngestionRecorder } from "../src/pipeline/recorder";
import { runIngestion, stableStringify } from "../src/pipeline/runner";

const CTX = {
  fetchImpl: fetch,
  allowedHosts: ["example.org"],
  now: () => new Date("2026-07-24T00:00:00Z"),
};

type Behavior = {
  fetchError?: Error;
  parseErrorAfter?: number;
  items?: Array<{ name: string; mode: "ok" | "normalize_throws" | "invalid" }>;
};

/** Minimal adapter whose failure modes are driven per-item by `Behavior`. */
class ScriptedAdapter implements SourceAdapter {
  readonly sourceCode = "SCRIPTED";

  constructor(private readonly behavior: Behavior) {}

  async discover(): Promise<DiscoveredVersion[]> {
    return [
      {
        sourceCode: this.sourceCode,
        versionLabel: "v1",
        url: "https://example.org/list",
      },
    ];
  }

  async fetch(): Promise<RawArtifact[]> {
    if (this.behavior.fetchError) throw this.behavior.fetchError;
    const bytes = new TextEncoder().encode("{}");
    return [
      {
        url: "https://example.org/list",
        contentType: "application/json",
        bytes,
        sha256: "a".repeat(64),
        retrievedAt: "2026-07-24T00:00:00Z",
      },
    ];
  }

  async *parse(): AsyncIterable<ParsedRecord> {
    const items = this.behavior.items ?? [];
    for (const [index, item] of items.entries()) {
      if (this.behavior.parseErrorAfter !== undefined) {
        if (index === this.behavior.parseErrorAfter) {
          throw new Error("parser exploded");
        }
      }
      yield {
        kind: "sample",
        externalId: item.name,
        payload: item,
        locator: {
          locatorType: "uri",
          locatorValue: `https://example.org/${item.name}`,
        },
      };
    }
  }

  normalize(record: ParsedRecord): NormalizedRecord {
    const item = record.payload as { name: string; mode: string };
    if (item.mode === "normalize_throws") {
      throw new Error(`cannot normalize ${item.name}`);
    }
    return {
      canonicalKey: `sample:term:${item.name}`,
      conceptType: "term",
      standardFamily: "OTHER",
      officialName: item.mode === "invalid" ? "" : item.name,
      labels: [{ ...normalizeLabel(item.name, "en"), labelType: "preferred" }],
      relations: [],
      locator: record.locator,
    };
  }

  validate(record: NormalizedRecord): ValidationResult {
    if (record.officialName.length === 0) {
      return {
        ok: false,
        issues: [
          { code: "missing_official_name", message: "empty", severity: "error" },
        ],
      };
    }
    return {
      ok: true,
      warnings: [
        { code: "sample_warning", message: "always warns", severity: "warning" },
      ],
    };
  }
}

describe("runIngestion", () => {
  it("records the full lifecycle for a clean run", async () => {
    const recorder = new InMemoryIngestionRecorder();
    const summaries = await runIngestion({
      adapter: new ScriptedAdapter({
        items: [
          { name: "alpha", mode: "ok" },
          { name: "beta", mode: "ok" },
        ],
      }),
      ctx: CTX,
      recorder,
    });
    expect(summaries[0]).toMatchObject({
      status: "succeeded",
      fetchedArtifacts: 1,
      itemCounts: { validated: 2, failed: 0 },
      warningCount: 2,
      truncated: false,
    });
    const run = recorder.runs[0]!;
    expect(run.status).toBe("succeeded");
    expect(run.items.map((item) => item.status)).toEqual(["validated", "validated"]);
    expect(run.items[0]?.payloadSummary).toMatchObject({
      canonicalKey: "sample:term:alpha",
      warnings: ["sample_warning"],
    });
  });

  it("keeps going after item failures and reports partial", async () => {
    const recorder = new InMemoryIngestionRecorder();
    const summaries = await runIngestion({
      adapter: new ScriptedAdapter({
        items: [
          { name: "good", mode: "ok" },
          { name: "broken", mode: "normalize_throws" },
          { name: "empty", mode: "invalid" },
        ],
      }),
      ctx: CTX,
      recorder,
    });
    expect(summaries[0]).toMatchObject({
      status: "partial",
      itemCounts: { validated: 1, failed: 2 },
    });
    const statuses = recorder.runs[0]!.items.map((item) => [
      item.status,
      item.errorCode,
    ]);
    expect(statuses).toEqual([
      ["validated", undefined],
      ["failed", "normalize_error"],
      ["failed", "validation:missing_official_name"],
    ]);
  });

  it("marks the run failed when nothing validates", async () => {
    const recorder = new InMemoryIngestionRecorder();
    const summaries = await runIngestion({
      adapter: new ScriptedAdapter({
        items: [{ name: "empty", mode: "invalid" }],
      }),
      ctx: CTX,
      recorder,
    });
    expect(summaries[0]?.status).toBe("failed");
  });

  it("records a fetch-stage failure and finishes the run as failed", async () => {
    const recorder = new InMemoryIngestionRecorder();
    const summaries = await runIngestion({
      adapter: new ScriptedAdapter({ fetchError: new Error("upstream 500") }),
      ctx: CTX,
      recorder,
    });
    expect(summaries[0]).toMatchObject({
      status: "failed",
      fetchedArtifacts: 0,
      errorSummary: { stage: "fetch", message: "upstream 500" },
    });
    expect(recorder.runs[0]?.items).toEqual([]);
    expect(recorder.runs[0]?.errorSummary).toMatchObject({ stage: "fetch" });
  });

  it("records mid-parse explosions as artifact-level failures", async () => {
    const recorder = new InMemoryIngestionRecorder();
    const summaries = await runIngestion({
      adapter: new ScriptedAdapter({
        items: [
          { name: "first", mode: "ok" },
          { name: "never-reached", mode: "ok" },
        ],
        parseErrorAfter: 1,
      }),
      ctx: CTX,
      recorder,
    });
    expect(summaries[0]?.status).toBe("partial");
    const run = recorder.runs[0]!;
    expect(run.items.map((item) => item.status)).toEqual(["validated", "failed"]);
    expect(run.items[1]).toMatchObject({
      errorCode: "parse_error",
      itemHash: "a".repeat(64),
    });
  });

  it("honors the dry-run item cap", async () => {
    const recorder = new InMemoryIngestionRecorder();
    const summaries = await runIngestion({
      adapter: new ScriptedAdapter({
        items: [
          { name: "one", mode: "ok" },
          { name: "two", mode: "ok" },
          { name: "three", mode: "ok" },
        ],
      }),
      ctx: CTX,
      recorder,
      maxItemsPerVersion: 1,
    });
    expect(summaries[0]).toMatchObject({
      status: "succeeded",
      truncated: true,
      itemCounts: { validated: 1, failed: 0 },
    });
  });
});

describe("stableStringify", () => {
  it("is insensitive to object key order", () => {
    expect(stableStringify({ b: 1, a: { d: [2, { z: 3, y: 4 }], c: 5 } })).toBe(
      stableStringify({ a: { c: 5, d: [2, { y: 4, z: 3 }] }, b: 1 }),
    );
  });

  it("drops undefined members like JSON.stringify does", () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});
