/**
 * BsddRestAdapter — first concrete SourceAdapter (#13, 詳細設計仕様書 §4.1).
 *
 * Pulls public Dictionary / Class / Property lists from the bSDD REST API
 * (https://technical.buildingsmart.org/services/bsdd/using-the-bsdd-api/)
 * through the §4.3 guarded client with per-source rate limiting.
 *
 * Normalization follows §4.4:
 * - the bSDD URI is preserved verbatim as the identifier (`externalUri`);
 *   concepts are never merged by name alone
 * - canonical keys use the domain convention `{namespace}:{conceptType}:{name}`
 *   with namespace `bsdd_{dictionaryCode}_{version}` and the exact-case bSDD
 *   `code` as name
 * - list endpoints truncate definitions (`descriptionPart`), so
 *   `officialDefinition` stays unset until the per-class detail fetch lands
 *   (scale-up follow-up alongside #25)
 */

import { buildCanonicalKey, normalizeLabel, parseCanonicalKey } from "@obcda/domain";

import { guardedFetch } from "../fetch/client";
import { MinIntervalRateLimiter, type SleepFn } from "../fetch/rate";
import type {
  DiscoverContext,
  DiscoveredVersion,
  FetchContext,
  NormalizeContext,
  NormalizedRecord,
  ParseContext,
  ParsedRecord,
  RawArtifact,
  SourceAdapter,
  ValidationIssue,
  ValidationResult,
} from "./types";

export const BSDD_SOURCE_CODE = "BSI_BSDD";
export const BSDD_API_BASE = "https://api.bsdd.buildingsmart.org";

// -- wire shapes (fields we consume from the bSDD REST API, verified live) ---

type BsddDictionary = {
  uri: string;
  code: string;
  name: string;
  version: string;
  status?: string;
  defaultLanguageCode?: string;
  license?: string;
  licenseUrl?: string;
  releaseDate?: string;
  lastUpdatedUtc?: string;
};

type BsddClass = {
  uri: string;
  code: string;
  name: string;
  classType?: string;
  referenceCode?: string;
  parentClassCode?: string;
  descriptionPart?: string;
};

type BsddProperty = {
  uri: string;
  code: string;
  name: string;
  descriptionPart?: string;
};

/** Page context carried from parse() to normalize() inside the payload. */
type BsddParsedPayload = {
  record: BsddClass | BsddProperty;
  dictionary: { uri: string; code: string; version: string };
  defaultLanguageCode: string;
};

export type BsddAdapterOptions = {
  /** bSDD dictionary URIs to ingest, e.g. the IFC 4.3 dictionary. */
  dictionaryUris: string[];
  /** Page size for list endpoints (bSDD default 100, max 1000). */
  pageSize?: number;
  /** Cap on pages per list — dry-run safety valve; undefined pulls all pages. */
  maxPagesPerList?: number;
  /** Minimum spacing between requests (§4.3 レート制限順守). */
  minIntervalMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
  /** Injected for tests. */
  sleep?: SleepFn;
  random?: () => number;
  nowMs?: () => number;
};

function toNamespaceSegment(value: string): string {
  const folded = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return folded;
}

/** `bsdd_{code}_{version}` namespace for {@link buildCanonicalKey}. */
export function bsddNamespace(dictionaryCode: string, version: string): string {
  const namespace = `bsdd_${toNamespaceSegment(dictionaryCode)}_${toNamespaceSegment(version)}`;
  return namespace.replace(/_+$/g, "");
}

/**
 * bSDD classType → domain ConceptType. Property groups map to `pset`;
 * everything else is a generic dictionary `term` — IFC schema-level kinds
 * (entity/type/…) come from the EXPRESS adapter, not from bSDD.
 */
function classConceptType(classType: string | undefined): "term" | "pset" {
  return classType === "GroupOfProperties" ? "pset" : "term";
}

function decodeJson(artifact: RawArtifact): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(artifact.bytes));
  } catch {
    throw new Error(`bsdd: artifact is not valid JSON (${artifact.url})`);
  }
}

export class BsddRestAdapter implements SourceAdapter {
  readonly sourceCode = BSDD_SOURCE_CODE;

  private readonly limiter: MinIntervalRateLimiter;

  constructor(private readonly options: BsddAdapterOptions) {
    this.limiter = new MinIntervalRateLimiter(
      options.minIntervalMs ?? 500,
      options.nowMs ?? Date.now,
      options.sleep,
    );
  }

  private clientOptions(ctx: FetchContext | DiscoverContext) {
    const { timeoutMs, maxRetries, sleep, random } = this.options;
    return {
      ctx,
      accept: "application/json",
      limiter: this.limiter,
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      ...(maxRetries !== undefined ? { maxRetries } : {}),
      ...(sleep ? { sleep } : {}),
      ...(random ? { random } : {}),
    };
  }

  private async getJson(url: string, ctx: FetchContext | DiscoverContext) {
    const result = await guardedFetch(url, this.clientOptions(ctx));
    if (result.kind === "not_modified") {
      throw new Error(`bsdd: unexpected 304 for ${url} (no conditional headers sent)`);
    }
    return { artifact: result.artifact, payload: decodeJson(result.artifact) };
  }

  async discover(ctx: DiscoverContext): Promise<DiscoveredVersion[]> {
    const versions: DiscoveredVersion[] = [];
    for (const dictionaryUri of this.options.dictionaryUris) {
      const url = `${BSDD_API_BASE}/api/Dictionary/v1?Uri=${encodeURIComponent(dictionaryUri)}`;
      const { payload } = await this.getJson(url, ctx);
      const dictionaries = (payload as { dictionaries?: BsddDictionary[] })
        .dictionaries;
      const dictionary = dictionaries?.[0];
      if (!dictionary) {
        throw new Error(`bsdd: dictionary not found upstream: ${dictionaryUri}`);
      }
      versions.push({
        sourceCode: this.sourceCode,
        versionLabel: `${dictionary.code}@${dictionary.version}`,
        url,
        ...(dictionary.lastUpdatedUtc
          ? { lastModified: dictionary.lastUpdatedUtc }
          : {}),
        metadata: {
          dictionaryUri: dictionary.uri,
          code: dictionary.code,
          name: dictionary.name,
          version: dictionary.version,
          ...(dictionary.status ? { status: dictionary.status } : {}),
          ...(dictionary.defaultLanguageCode
            ? { defaultLanguageCode: dictionary.defaultLanguageCode }
            : {}),
          ...(dictionary.license ? { license: dictionary.license } : {}),
          ...(dictionary.licenseUrl ? { licenseUrl: dictionary.licenseUrl } : {}),
          ...(dictionary.releaseDate ? { releaseDate: dictionary.releaseDate } : {}),
        },
      });
    }
    return versions;
  }

  async fetch(version: DiscoveredVersion, ctx: FetchContext): Promise<RawArtifact[]> {
    const dictionaryUri = version.metadata?.["dictionaryUri"];
    if (typeof dictionaryUri !== "string" || dictionaryUri.length === 0) {
      throw new Error("bsdd: DiscoveredVersion.metadata.dictionaryUri is required");
    }
    const pageSize = this.options.pageSize ?? 100;
    const artifacts: RawArtifact[] = [];
    await this.fetchPagedList(artifacts, ctx, dictionaryUri, {
      path: "/api/Dictionary/v1/Classes",
      itemsKey: "classes",
      countKey: "classesCount",
      totalCountKey: "classesTotalCount",
      pageSize,
    });
    await this.fetchPagedList(artifacts, ctx, dictionaryUri, {
      path: "/api/Dictionary/v1/Properties",
      itemsKey: "properties",
      countKey: "propertiesCount",
      totalCountKey: "propertiesTotalCount",
      pageSize,
    });
    return artifacts;
  }

  private async fetchPagedList(
    artifacts: RawArtifact[],
    ctx: FetchContext,
    dictionaryUri: string,
    list: {
      path: string;
      itemsKey: string;
      countKey: string;
      totalCountKey: string;
      pageSize: number;
    },
  ): Promise<void> {
    const maxPages = this.options.maxPagesPerList ?? Number.POSITIVE_INFINITY;
    let offset = 0;
    for (let page = 0; page < maxPages; page += 1) {
      const url =
        `${BSDD_API_BASE}${list.path}?Uri=${encodeURIComponent(dictionaryUri)}` +
        `&offset=${offset}&limit=${list.pageSize}`;
      const { artifact, payload } = await this.getJson(url, ctx);
      artifacts.push(artifact);

      const record = payload as Record<string, unknown>;
      const items = record[list.itemsKey];
      const count =
        typeof record[list.countKey] === "number"
          ? (record[list.countKey] as number)
          : Array.isArray(items)
            ? items.length
            : 0;
      const totalCount =
        typeof record[list.totalCountKey] === "number"
          ? (record[list.totalCountKey] as number)
          : count;
      offset += count;
      if (count === 0 || offset >= totalCount) break;
    }
  }

  async *parse(artifact: RawArtifact, _ctx: ParseContext): AsyncIterable<ParsedRecord> {
    const payload = decodeJson(artifact) as {
      uri?: string;
      code?: string;
      version?: string;
      defaultLanguageCode?: string;
      classes?: BsddClass[];
      properties?: BsddProperty[];
    };
    const hasClasses = Array.isArray(payload.classes);
    const hasProperties = Array.isArray(payload.properties);
    if (!hasClasses && !hasProperties) {
      throw new Error(`bsdd: unrecognized list payload (${artifact.url})`);
    }
    if (!payload.uri || !payload.code || !payload.version) {
      throw new Error(`bsdd: list payload lacks dictionary identity (${artifact.url})`);
    }
    const dictionary = {
      uri: payload.uri,
      code: payload.code,
      version: payload.version,
    };
    const defaultLanguageCode = payload.defaultLanguageCode ?? "EN";
    const locator = (uri: string) =>
      ({ locatorType: "uri", locatorValue: uri }) as const;

    for (const cls of payload.classes ?? []) {
      const parsed: BsddParsedPayload = {
        record: cls,
        dictionary,
        defaultLanguageCode,
      };
      yield {
        kind: "class",
        externalId: cls.uri,
        payload: parsed,
        locator: locator(cls.uri),
      };
    }
    for (const property of payload.properties ?? []) {
      const parsed: BsddParsedPayload = {
        record: property,
        dictionary,
        defaultLanguageCode,
      };
      yield {
        kind: "property",
        externalId: property.uri,
        payload: parsed,
        locator: locator(property.uri),
      };
    }
  }

  normalize(record: ParsedRecord, _ctx: NormalizeContext): NormalizedRecord {
    const {
      record: item,
      dictionary,
      defaultLanguageCode,
    } = record.payload as BsddParsedPayload;
    const namespace = bsddNamespace(dictionary.code, dictionary.version);
    const language = defaultLanguageCode.split("-")[0]?.toLowerCase() || "en";

    const conceptType =
      record.kind === "property"
        ? ("property" as const)
        : classConceptType((item as BsddClass).classType);

    const canonicalKey = buildCanonicalKey({
      namespace,
      conceptType,
      name: item.code,
    });

    const labels: NormalizedRecord["labels"] = [
      { ...normalizeLabel(item.name, language), labelType: "preferred" },
    ];
    if (item.code !== item.name) {
      labels.push({ ...normalizeLabel(item.code, language), labelType: "alternative" });
    }

    const relations: NormalizedRecord["relations"] = [];
    if (record.kind === "class") {
      const parentClassCode = (item as BsddClass).parentClassCode;
      if (parentClassCode && conceptType === "term") {
        relations.push({
          targetKey: buildCanonicalKey({
            namespace,
            conceptType: "term",
            name: parentClassCode,
          }),
          relationType: "broader",
        });
      }
    }

    return {
      canonicalKey,
      conceptType,
      standardFamily: "BSDD",
      officialName: item.name,
      labels,
      externalUri: item.uri,
      relations,
      locator: record.locator,
    };
  }

  validate(record: NormalizedRecord): ValidationResult {
    const issues: ValidationIssue[] = [];
    if (parseCanonicalKey(record.canonicalKey) === null) {
      issues.push({
        code: "invalid_canonical_key",
        message: `canonicalKey is not canonical: ${record.canonicalKey}`,
        severity: "error",
      });
    }
    if (record.officialName.trim().length === 0) {
      issues.push({
        code: "missing_official_name",
        message: "officialName must not be empty",
        severity: "error",
      });
    }
    if (!record.labels.some((label) => label.labelType === "preferred")) {
      issues.push({
        code: "missing_preferred_label",
        message: "at least one preferred label is required",
        severity: "error",
      });
    }
    if (record.standardFamily !== "BSDD") {
      issues.push({
        code: "wrong_standard_family",
        message: `expected standardFamily BSDD, got ${record.standardFamily}`,
        severity: "error",
      });
    }
    // §4.4: bSDD URI は識別子として保存する — its absence is a hard error
    if (!record.externalUri || record.externalUri.trim().length === 0) {
      issues.push({
        code: "missing_external_uri",
        message: "bSDD records must keep their URI as identifier",
        severity: "error",
      });
    }
    const warnings: ValidationIssue[] = [];
    if (!record.officialDefinition && !record.summaryJa) {
      warnings.push({
        code: "missing_definition",
        message:
          "list endpoints truncate definitions; full text arrives with the detail fetch",
        severity: "warning",
      });
    }
    if (issues.length > 0) return { ok: false, issues };
    return { ok: true, warnings };
  }
}
