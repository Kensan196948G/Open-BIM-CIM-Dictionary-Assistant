import type {
  AssistantAnswer,
  AuditEventsResponse,
  CompareResponse,
  ConceptDetailResponse,
  ConceptRelationsResponse,
  ErrorResponse,
  ResponseMeta,
  SearchResponse,
  SearchResultItem,
  SourceVersionsResponse,
  SourcesResponse,
  SystemInfoResponse,
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
  init?: { method?: "POST"; body?: unknown },
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
