import type { DictionaryRepository } from "../repositories/types";

/** Hono generics: per-request variables and Workers bindings. */
export type AppEnv = {
  Variables: {
    requestId: string;
    repository: DictionaryRepository;
  };
  Bindings: {
    /** CORS allowlist origin for the web app (wrangler.toml [vars]); absent on Node dev. */
    ALLOWED_ORIGIN?: string;
    /** Neon connection string (wrangler secret); undefined falls back to the fixtures repository. */
    DATABASE_URL?: string;
  };
};
