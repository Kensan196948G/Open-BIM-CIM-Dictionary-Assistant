import { createApp } from "./app";
import { dictionaryFixture } from "./fixtures";
import type { AppEnv } from "./middleware/context";
import { InMemoryDictionaryRepository } from "./repositories/inMemory";
import { NeonDictionaryRepository } from "./repositories/neon";
import type { DictionaryRepository } from "./repositories/types";
import { UnavailableDictionaryRepository } from "./repositories/unavailable";
import { NeonAiSettingsStore, type AiSettingsStore } from "./services/aiSettings";

const fixtureRepository = new InMemoryDictionaryRepository(dictionaryFixture);
const unavailableRepository = new UnavailableDictionaryRepository();

// A live Workers isolate serves many requests, so cache the Neon repository
// keyed by connection string instead of reconnecting every request; a
// rotated DATABASE_URL secret is picked up on the next isolate reload.
let cachedDatabaseUrl: string | undefined;
let cachedRepository: NeonDictionaryRepository | undefined;
let cachedSettingsUrl: string | undefined;
let cachedSettingsStore: NeonAiSettingsStore | undefined;

function resolveRepository(
  env: AppEnv["Bindings"] | undefined,
): DictionaryRepository | undefined {
  const databaseUrl = env?.DATABASE_URL;
  if (!databaseUrl) {
    // Deployments that declare REQUIRE_DATABASE=true (production) fail closed
    // instead of silently serving stale fixtures; everything else keeps the
    // deliberate MVP/preview fixtures fallback.
    return env?.REQUIRE_DATABASE === "true" ? unavailableRepository : undefined;
  }
  if (databaseUrl !== cachedDatabaseUrl) {
    // Construct before touching the cache — a throwing constructor (e.g.
    // malformed URL) must not leave the two cache slots out of sync.
    const repository = new NeonDictionaryRepository(databaseUrl);
    cachedRepository = repository;
    cachedDatabaseUrl = databaseUrl;
  }
  return cachedRepository;
}

function resolveAiSettingsStore(
  env: AppEnv["Bindings"] | undefined,
): AiSettingsStore | undefined {
  const databaseUrl = env?.DATABASE_URL;
  if (!databaseUrl) return undefined;
  if (databaseUrl !== cachedSettingsUrl) {
    const store = new NeonAiSettingsStore(databaseUrl);
    cachedSettingsStore = store;
    cachedSettingsUrl = databaseUrl;
  }
  return cachedSettingsStore;
}

/** Default app: Neon-backed when DATABASE_URL is bound (Workers), fixtures otherwise (Node dev). */
export const app = createApp(fixtureRepository, {
  resolveRepository,
  resolveAiSettingsStore,
});

export { createApp } from "./app";
export { InMemoryDictionaryRepository } from "./repositories/inMemory";
export { NeonDictionaryRepository } from "./repositories/neon";
export type { DictionaryRepository } from "./repositories/types";

export default app;
