import { createApp } from "./app";
import { dictionaryFixture } from "./fixtures";
import { InMemoryDictionaryRepository } from "./repositories/inMemory";

/** Default app wired to the fixtures repository (Workers-compatible export). */
export const app = createApp(new InMemoryDictionaryRepository(dictionaryFixture));

export { createApp } from "./app";
export { InMemoryDictionaryRepository } from "./repositories/inMemory";
export type { DictionaryRepository } from "./repositories/types";

export default app;
