import { normalizeLabel } from "@obcda/domain";
import { describe, expect, it } from "vitest";

import type {
  DiscoveredVersion,
  NormalizedRecord,
  ParsedRecord,
  RawArtifact,
  SourceAdapter,
} from "../src/adapters/types";

/**
 * Contract conformance: a minimal in-memory adapter exercising the full
 * discover → fetch → parse → normalize → validate pipeline shape. Real
 * adapters (BsddRestAdapter, MlitBimCimPageAdapter, …) follow this exact
 * lifecycle (#13).
 */
class StaticSampleAdapter implements SourceAdapter {
  readonly sourceCode = "SAMPLE_STATIC";

  async discover(): Promise<DiscoveredVersion[]> {
    return [
      {
        sourceCode: this.sourceCode,
        versionLabel: "2026-07",
        url: "https://technical.buildingsmart.org/sample.json",
      },
    ];
  }

  async fetch(version: DiscoveredVersion): Promise<RawArtifact[]> {
    const bytes = new TextEncoder().encode(
      JSON.stringify({ name: "IfcAlignment", summary: "線形の基準" }),
    );
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    return [
      {
        url: version.url,
        contentType: "application/json",
        bytes,
        sha256,
        retrievedAt: "2026-07-18T00:00:00Z",
      },
    ];
  }

  async *parse(artifact: RawArtifact): AsyncIterable<ParsedRecord> {
    const payload = JSON.parse(new TextDecoder().decode(artifact.bytes));
    yield {
      kind: "entity",
      externalId: payload.name,
      payload,
      locator: { locatorType: "uri", locatorValue: artifact.url },
    };
  }

  normalize(record: ParsedRecord): NormalizedRecord {
    const payload = record.payload as { name: string; summary: string };
    return {
      canonicalKey: `ifc4x3:entity:${payload.name}`,
      conceptType: "entity",
      standardFamily: "IFC",
      officialName: payload.name,
      labels: [{ ...normalizeLabel(payload.name, "en"), labelType: "preferred" }],
      summaryJa: payload.summary,
      relations: [],
      locator: record.locator,
    };
  }

  validate(record: NormalizedRecord) {
    if (record.canonicalKey.length === 0) {
      return {
        ok: false as const,
        issues: [
          {
            code: "missing_key",
            message: "canonicalKey required",
            severity: "error" as const,
          },
        ],
      };
    }
    return { ok: true as const, warnings: [] };
  }
}

describe("SourceAdapter contract", () => {
  it("runs the full pipeline shape end to end", async () => {
    const adapter: SourceAdapter = new StaticSampleAdapter();
    const ctx = {
      fetchImpl: fetch,
      allowedHosts: ["buildingsmart.org"],
      now: () => new Date("2026-07-18T00:00:00Z"),
    };

    const versions = await adapter.discover(ctx);
    expect(versions).toHaveLength(1);

    const artifacts = await adapter.fetch(versions[0]!, ctx);
    expect(artifacts[0]?.contentType).toBe("application/json");
    // integrity metadata must be the real digest of the payload bytes
    const expectedDigest = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", artifacts[0]!.bytes.slice())),
    ]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    expect(artifacts[0]?.sha256).toBe(expectedDigest);

    const records: NormalizedRecord[] = [];
    for await (const parsed of adapter.parse(artifacts[0]!, {
      sourceCode: adapter.sourceCode,
    })) {
      records.push(
        adapter.normalize(parsed, {
          sourceCode: adapter.sourceCode,
          versionLabel: versions[0]!.versionLabel,
        }),
      );
    }

    expect(records[0]?.canonicalKey).toBe("ifc4x3:entity:IfcAlignment");
    expect(records[0]?.labels[0]?.folded).toBe("ifcalignment");
    expect(adapter.validate(records[0]!)).toEqual({ ok: true, warnings: [] });
  });
});
