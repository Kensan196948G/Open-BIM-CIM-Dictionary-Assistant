import type {
  ConceptDetailResponse,
  ConceptRelationsResponse,
  ErrorResponse,
  SearchResponse,
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

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: "application/json" },
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
};

export function searchConcepts(params: SearchParams): Promise<SearchResponse> {
  const query = new URLSearchParams();
  query.set("q", params.q);
  if (params.family) query.set("family", params.family);
  if (params.type) query.set("type", params.type);
  if (params.schema) query.set("schema", params.schema);
  if (params.cursor) query.set("cursor", params.cursor);
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
