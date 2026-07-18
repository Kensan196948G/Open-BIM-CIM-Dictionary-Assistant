import type { DictionaryRepository } from "../repositories/types";

/** Hono generics: per-request variables shared across middleware/routes. */
export type AppEnv = {
  Variables: {
    requestId: string;
    repository: DictionaryRepository;
  };
};
