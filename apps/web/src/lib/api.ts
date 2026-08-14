import type {
  AiSettingsStatusResponse,
  AssistantAnswer,
  AuditEventsResponse,
  CompareResponse,
  ConceptDetailResponse,
  ConceptRelationsResponse,
  ErrorResponse,
  ResponseMeta,
  ReviewDecisionResponse,
  ReviewQueueResponse,
  SearchResponse,
  SearchResultItem,
  SourceVersionsResponse,
  SourcesResponse,
  SystemInfoResponse,
  TestAiSettingsResponse,
} from "@obcda/contracts";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  init?: { method?: "POST" | "DELETE"; body?: unknown },
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  if (!response.ok) {
    let code = "INTERNAL_ERROR";
    let message = "サーバーへの接続に失敗しました。";
    try {
      const body = (await response.json()) as ErrorResponse;
      code = body.error.code;
      message = body.error.message;
    } catch {
      // non-JSON error body — keep defaults
    }
    throw new ApiError(response.status, code, message);
  }
  return (await response.json()) as T;
}

export type SearchParams = {
  q: string;
  family?: string;
  type?: string;
  schema?: string;
  cursor?: string;
  limit?: number;
};

export function searchConcepts(params: SearchParams): Promise<SearchResponse> {
  const query = new URLSearchParams();
  query.set("q", params.q);
  if (params.family) query.set("family", params.family);
  if (params.type) query.set("type", params.type);
  if (params.schema) query.set("schema", params.schema);
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.limit) query.set("limit", String(params.limit));
  return request<SearchResponse>(`/api/v1/search?${query.toString()}`);
}

export function fetchConcept(id: string): Promise<ConceptDetailResponse> {
  return request<ConceptDetailResponse>(`/api/v1/concepts/${encodeURIComponent(id)}`);
}

export function fetchRelations(id: string): Promise<ConceptRelationsResponse> {
  return request<ConceptRelationsResponse>(
    `/api/v1/concepts/${encodeURIComponent(id)}/relations`,
  );
}

export function fetchSystemInfo(): Promise<SystemInfoResponse> {
  return request<SystemInfoResponse>("/api/v1/system/info");
}

export function fetchAuditEvents(limit = 100): Promise<AuditEventsResponse> {
  return request<AuditEventsResponse>(`/api/v1/system/audit-events?limit=${limit}`);
}

export function fetchSources(): Promise<SourcesResponse> {
  return request<SourcesResponse>("/api/v1/sources");
}

export function fetchSourceVersions(id: string): Promise<SourceVersionsResponse> {
  return request<SourceVersionsResponse>(
    `/api/v1/sources/${encodeURIComponent(id)}/versions`,
  );
}

export function compareConcepts(ids: string[]): Promise<CompareResponse> {
  return request<CompareResponse>("/api/v1/compare", {
    method: "POST",
    body: { ids },
  });
}

/** GET /api/v1/admin/ai-settings — configured state only (never the key). */
export function fetchAiSettings(): Promise<AiSettingsStatusResponse> {
  return request<AiSettingsStatusResponse>("/api/v1/admin/ai-settings");
}

/** POST /api/v1/admin/ai-settings — persist the admin-entered API key. */
export function saveAiSettings(apiKey: string): Promise<AiSettingsStatusResponse> {
  return request<AiSettingsStatusResponse>("/api/v1/admin/ai-settings", {
    method: "POST",
    body: { apiKey },
  });
}

/** DELETE /api/v1/admin/ai-settings — clear the stored API key. */
export function resetAiSettings(): Promise<AiSettingsStatusResponse> {
  return request<AiSettingsStatusResponse>("/api/v1/admin/ai-settings", {
    method: "DELETE",
  });
}

/** POST /api/v1/admin/ai-settings/test — real Anthropic connectivity check. */
export function testAiSettings(apiKey?: string): Promise<TestAiSettingsResponse> {
  return request<TestAiSettingsResponse>("/api/v1/admin/ai-settings/test", {
    method: "POST",
    body: apiKey ? { apiKey } : {},
  });
}

/** POST /api/v1/assistant/answers — answer plus the search grounding (根拠カード). */
export type AssistantAnswerResponse = {
  data: { answer: AssistantAnswer; evidence: SearchResultItem[] };
  meta: ResponseMeta;
};

export function askAssistant(
  question: string,
  explanationLevel: "beginner" | "technical",
): Promise<AssistantAnswerResponse> {
  return request<AssistantAnswerResponse>("/api/v1/assistant/answers", {
    method: "POST",
    body: { question, explanationLevel },
  });
}

// ---------------------------------------------------------------------------
// §17 公開辞書エクスポート（FR-308）
// ---------------------------------------------------------------------------

/** ダウンロードリンク用 URL（Content-Disposition: attachment を返す）。 */
export function exportDictionaryUrl(format: "json" | "csv", license?: string): string {
  const params = new URLSearchParams({ format });
  if (license) params.set("license", license);
  return `${API_BASE}/api/v1/export/dictionary?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// 差分レビューキュー（FR-303〜305・管理 API）
// ---------------------------------------------------------------------------

export function fetchReviewQueue(): Promise<ReviewQueueResponse> {
  return request<ReviewQueueResponse>("/api/v1/admin/review-queue");
}

export function decideReview(
  id: string,
  decision: "approved" | "rejected",
): Promise<ReviewDecisionResponse> {
  return request<ReviewDecisionResponse>(
    `/api/v1/admin/reviews/${encodeURIComponent(id)}/decision`,
    {
      method: "POST",
      body: { decision },
    },
  );
}
