import type { DictionaryRepository } from "../repositories/types";
import type { AuditChangeWriter } from "../services/auditEvents";
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
    /** Access JWT email claim (set only when §9.1 verification ran). */
    actorEmail?: string;
    /** S4 durable change audit (Neon audit_events in production). */
    auditChanges: AuditChangeWriter;
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
    /** Extra hostnames allowed to serve /api/v1/admin/* (comma-separated; pages-worker host guard). */
    ADMIN_EXTRA_HOSTS?: string;
    /** Cloudflare Access team domain (e.g. myteam.cloudflareaccess.com); with CF_ACCESS_AUD enables §9.1 JWT verification on admin routes. */
    CF_ACCESS_TEAM_DOMAIN?: string;
    /** Cloudflare Access application audience (AUD) tag. */
    CF_ACCESS_AUD?: string;
    /** Base64 32-byte KEK: encrypts app_settings values at rest (wrangler secret). */
    SETTINGS_ENC_KEY?: string;
    /** Daily AI token cap (input+output, UTC day); unset/invalid = no cap. */
    AI_DAILY_TOKEN_BUDGET?: string;
  };
};
