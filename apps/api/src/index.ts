import { createApp } from "./app";
import { dictionaryFixture } from "./fixtures";
import type { AppEnv } from "./middleware/context";
import { InMemoryDictionaryRepository } from "./repositories/inMemory";
import { NeonDictionaryRepository } from "./repositories/neon";
import type { DictionaryRepository } from "./repositories/types";

const fixtureRepository = new InMemoryDictionaryRepository(dictionaryFixture);

// A live Workers isolate serves many requests, so cache the Neon repository
// keyed by connection string instead of reconnecting every request; a
// rotated DATABASE_URL secret is picked up on the next isolate reload.
let cachedDatabaseUrl: string | undefined;
let cachedRepository: NeonDictionaryRepository | undefined;

function resolveRepository(
  env: AppEnv["Bindings"] | undefined,
): DictionaryRepository | undefined {
  const databaseUrl = env?.DATABASE_URL;
  if (!databaseUrl) return undefined;
  if (databaseUrl !== cachedDatabaseUrl) {
    cachedDatabaseUrl = databaseUrl;
    cachedRepository = new NeonDictionaryRepository(databaseUrl);
  }
  return cachedRepository;
}

/** Default app: Neon-backed when DATABASE_URL is bound (Workers), fixtures otherwise (Node dev). */
export const app = createApp(fixtureRepository, { resolveRepository });

export { createApp } from "./app";
export { InMemoryDictionaryRepository } from "./repositories/inMemory";
export { NeonDictionaryRepository } from "./repositories/neon";
export type { DictionaryRepository } from "./repositories/types";

export default app;
