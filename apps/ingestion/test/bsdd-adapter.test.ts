import { describe, expect, it, vi } from "vitest";

import { BSDD_API_BASE, BsddRestAdapter, bsddNamespace } from "../src/adapters/bsdd";
import type { NormalizedRecord } from "../src/adapters/types";
import { InMemoryIngestionRecorder } from "../src/pipeline/recorder";
import { runIngestion } from "../src/pipeline/runner";

const DICT_URI = "https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3";
const ALLOWED = ["api.bsdd.buildingsmart.org"];
const NOW = () => new Date("2026-07-24T00:00:00Z");

const dictionaryPayload = {
  count: 1,
  offset: 0,
  totalCount: 1,
  dictionaries: [
    {
      uri: DICT_URI,
      code: "ifc",
      name: "IFC",
      version: "4.3",
      status: "Active",
      defaultLanguageCode: "EN",
      license: "CC BY-ND 4.0",
      lastUpdatedUtc: "2024-01-12T14:09:50Z",
    },
  ],
};

const pageBase = {
  uri: DICT_URI,
  code: "ifc",
  version: "4.3",
  defaultLanguageCode: "EN",
};

const classesPage1 = {
  ...pageBase,
  classes: [
    {
      uri: `${DICT_URI}/class/IfcActionRequest`,
      code: "IfcActionRequest",
      name: "Action Request",
      classType: "Class",
      parentClassCode: "IfcControl",
      descriptionPart: "A request is the act or instance of asking for something…",
    },
    {
      uri: `${DICT_URI}/class/Pset_ActionRequest`,
      code: "Pset_ActionRequest",
      name: "Pset_ActionRequest",
      classType: "GroupOfProperties",
      parentClassCode: "IfcActionRequest",
    },
  ],
  classesCount: 2,
  classesOffset: 0,
  classesTotalCount: 3,
};

const classesPage2 = {
  ...pageBase,
  classes: [
    {
      uri: `${DICT_URI}/class/IfcControl`,
      code: "IfcControl",
      name: "Control",
      classType: "Class",
    },
  ],
  classesCount: 1,
  classesOffset: 2,
  classesTotalCount: 3,
};

const propertiesPage = {
  ...pageBase,
  properties: [
    {
      uri: `${DICT_URI}/prop/AbnormalBerthingFactor`,
      code: "AbnormalBerthingFactor",
      name: "Abnormal Berthing Factor",
      descriptionPart: "Risk assessed safety factor",
    },
  ],
  propertiesCount: 1,
  propertiesOffset: 0,
  propertiesTotalCount: 1,
};

function makeRoutes(pageSize: number): Map<string, unknown> {
  const enc = encodeURIComponent(DICT_URI);
  return new Map<string, unknown>([
    [`${BSDD_API_BASE}/api/Dictionary/v1?Uri=${enc}`, dictionaryPayload],
    [
      `${BSDD_API_BASE}/api/Dictionary/v1/Classes?Uri=${enc}&offset=0&limit=${pageSize}`,
      classesPage1,
    ],
    [
      `${BSDD_API_BASE}/api/Dictionary/v1/Classes?Uri=${enc}&offset=2&limit=${pageSize}`,
      classesPage2,
    ],
    [
      `${BSDD_API_BASE}/api/Dictionary/v1/Properties?Uri=${enc}&offset=0&limit=${pageSize}`,
      propertiesPage,
    ],
  ]);
}

function routedFetch(routes: Map<string, unknown>) {
  return vi.fn(async (input: string | URL) => {
    const url = String(input);
    const payload = routes.get(url);
    if (payload === undefined) {
      return new Response("not found", { status: 404 });
    }
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

function makeAdapter(): BsddRestAdapter {
  return new BsddRestAdapter({
    dictionaryUris: [DICT_URI],
    pageSize: 2,
    minIntervalMs: 0,
  });
}

describe("bsddNamespace", () => {
  it("folds dictionary code and version into a canonical namespace", () => {
    expect(bsddNamespace("ifc", "4.3")).toBe("bsdd_ifc_4_3");
    expect(bsddNamespace("My-Dict", "2026.Q1")).toBe("bsdd_my_dict_2026_q1");
  });
});

describe("BsddRestAdapter", () => {
  it("discovers the dictionary as one DiscoveredVersion", async () => {
    const fetchImpl = routedFetch(makeRoutes(2));
    const adapter = makeAdapter();
    const versions = await adapter.discover({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      allowedHosts: ALLOWED,
      now: NOW,
    });
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      sourceCode: "BSI_BSDD",
      versionLabel: "ifc@4.3",
      lastModified: "2024-01-12T14:09:50Z",
    });
    expect(versions[0]?.metadata).toMatchObject({
      dictionaryUri: DICT_URI,
      license: "CC BY-ND 4.0",
    });
  });

  it("pages class and property lists until the reported totals", async () => {
    const fetchImpl = routedFetch(makeRoutes(2));
    const adapter = makeAdapter();
    const ctx = {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      allowedHosts: ALLOWED,
      now: NOW,
    };
    const [version] = await adapter.discover(ctx);
    const artifacts = await adapter.fetch(version!, ctx);
    expect(artifacts).toHaveLength(3);
    const requested = fetchImpl.mock.calls.map((call) => String(call[0]));
    expect(requested.filter((url) => url.includes("/Classes"))).toHaveLength(2);
    expect(requested.filter((url) => url.includes("/Properties"))).toHaveLength(1);
  });

  it("normalizes classes, psets and properties per §4.4", async () => {
    const fetchImpl = routedFetch(makeRoutes(2));
    const adapter = makeAdapter();
    const ctx = {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      allowedHosts: ALLOWED,
      now: NOW,
    };
    const [version] = await adapter.discover(ctx);
    const artifacts = await adapter.fetch(version!, ctx);

    const records: NormalizedRecord[] = [];
    for (const artifact of artifacts) {
      for await (const parsed of adapter.parse(artifact, {
        sourceCode: adapter.sourceCode,
      })) {
        records.push(
          adapter.normalize(parsed, {
            sourceCode: adapter.sourceCode,
            versionLabel: version!.versionLabel,
          }),
        );
      }
    }

    expect(records.map((record) => record.canonicalKey)).toEqual([
      "bsdd_ifc_4_3:term:IfcActionRequest",
      "bsdd_ifc_4_3:pset:Pset_ActionRequest",
      "bsdd_ifc_4_3:term:IfcControl",
      "bsdd_ifc_4_3:property:AbnormalBerthingFactor",
    ]);

    const actionRequest = records[0]!;
    expect(actionRequest.officialName).toBe("Action Request");
    expect(actionRequest.standardFamily).toBe("BSDD");
    expect(actionRequest.externalUri).toBe(`${DICT_URI}/class/IfcActionRequest`);
    expect(actionRequest.labels).toEqual([
      expect.objectContaining({
        labelType: "preferred",
        original: "Action Request",
        folded: expect.any(String),
      }),
      expect.objectContaining({
        labelType: "alternative",
        original: "IfcActionRequest",
        folded: "ifcactionrequest",
      }),
    ]);
    expect(actionRequest.relations).toEqual([
      { targetKey: "bsdd_ifc_4_3:term:IfcControl", relationType: "broader" },
    ]);

    // §4.4: the bSDD URI is the identifier — kept verbatim on every record
    expect(records.every((record) => record.externalUri?.startsWith(DICT_URI))).toBe(
      true,
    );

    // property groups carry no broader relation and identical name/code stays single-label
    const pset = records[1]!;
    expect(pset.conceptType).toBe("pset");
    expect(pset.relations).toEqual([]);
    expect(pset.labels).toHaveLength(1);

    for (const record of records) {
      const verdict = adapter.validate(record);
      expect(verdict.ok).toBe(true);
      if (verdict.ok) {
        expect(verdict.warnings.map((warning) => warning.code)).toEqual([
          "missing_definition",
        ]);
      }
    }
  });

  it("fails validation for records that lose required identity", () => {
    const adapter = makeAdapter();
    const broken: NormalizedRecord = {
      canonicalKey: "not canonical",
      conceptType: "term",
      standardFamily: "IFC",
      officialName: " ",
      labels: [],
      relations: [],
      locator: { locatorType: "uri", locatorValue: "https://x" },
    };
    const verdict = adapter.validate(broken);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.issues.map((issue) => issue.code).sort()).toEqual([
        "invalid_canonical_key",
        "missing_external_uri",
        "missing_official_name",
        "missing_preferred_label",
        "wrong_standard_family",
      ]);
    }
  });

  it("rejects unrecognized list payloads at parse time", async () => {
    const adapter = makeAdapter();
    const bytes = new TextEncoder().encode(JSON.stringify({ unexpected: true }));
    const artifact = {
      url: "https://api.bsdd.buildingsmart.org/api/whatever",
      contentType: "application/json",
      bytes,
      sha256: "0".repeat(64),
      retrievedAt: NOW().toISOString(),
    };
    const iterate = async () => {
      for await (const _record of adapter.parse(artifact, {
        sourceCode: adapter.sourceCode,
      })) {
        // consume
      }
    };
    await expect(iterate()).rejects.toThrow(/unrecognized list payload/);
  });

  it("runs end to end through the pipeline runner with recorded statuses", async () => {
    const fetchImpl = routedFetch(makeRoutes(2));
    const adapter = makeAdapter();
    const recorder = new InMemoryIngestionRecorder();
    const summaries = await runIngestion({
      adapter,
      ctx: {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        allowedHosts: ALLOWED,
        now: NOW,
      },
      recorder,
    });

    expect(summaries).toHaveLength(1);
    const summary = summaries[0]!;
    expect(summary.status).toBe("succeeded");
    expect(summary.fetchedArtifacts).toBe(3);
    expect(summary.itemCounts).toEqual({ validated: 4, failed: 0 });
    expect(summary.warningCount).toBe(4);
    expect(summary.records).toHaveLength(4);

    const run = recorder.runs[0]!;
    expect(run.status).toBe("succeeded");
    expect(run.versionLabel).toBe("ifc@4.3");
    expect(run.fetchedCount).toBe(3);
    expect(run.items).toHaveLength(4);
    expect(run.items.every((item) => item.status === "validated")).toBe(true);
    expect(run.items.every((item) => /^[0-9a-f]{64}$/.test(item.itemHash))).toBe(true);
  });
});
