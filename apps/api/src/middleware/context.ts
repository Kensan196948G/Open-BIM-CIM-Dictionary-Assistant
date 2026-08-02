import type { DictionaryRepository } from "../repositories/types";
import type { AiSettingsStore } from "../services/aiSettings";
import type { LlmProvider } from "../services/llm";

/** Hono generics: per-request variables and Workers bindings. */
export type AppEnv = {
  Variables: {
    requestId: string;
    repository: DictionaryRepository;
    /** Resolved per request: NoopLlmProvider or AnthropicLlmProvider. */
    llmProvider: LlmProvider;
    /** Server-side admin settings store (in-memory on dev/tests). */
    aiSettingsStore: AiSettingsStore;
  };
  Bindings: {
    /** CORS allowlist origin for the web app (wrangler.toml [vars]); absent on Node dev. */
    ALLOWED_ORIGIN?: string;
    /** Neon connection string (wrangler secret); undefined falls back to the fixtures repository. */
    DATABASE_URL?: string;
    /** "true" on deployments that must not run without a DB (production): missing DATABASE_URL then fails closed. */
    REQUIRE_DATABASE?: string;
    /** Anthropic API key secrets (admin-managed; take precedence over the stored key). */
    ANTHROPIC_API_KEY?: string;
    LLM_API_KEY?: string;
    /** Anthropic model id (default: claude-sonnet-4-6). */
    ANTHROPIC_MODEL?: string;
  };
};
