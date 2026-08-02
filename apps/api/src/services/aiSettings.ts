/**
 * Admin-managed AI settings store (§6.4).
 * The Anthropic API key never lives in the browser: it is stored server-side
 * (Neon `app_settings` in production, in-memory for dev/tests) or supplied via
 * the LLM_API_KEY / ANTHROPIC_API_KEY env secrets, which take precedence.
 */

import { neon } from "@neondatabase/serverless";
import { appSettings } from "@obcda/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

/** Single-row key under which the Anthropic API key is stored. */
export const ANTHROPIC_API_KEY_SETTING = "anthropic_api_key";

export interface AiSettingsStore {
  getKey(): Promise<string | null>;
  setKey(key: string): Promise<void>;
  clearKey(): Promise<void>;
}

/** Dev/test default: process-local, cleared on restart. */
export class InMemoryAiSettingsStore implements AiSettingsStore {
  private key: string | null = null;

  async getKey(): Promise<string | null> {
    return this.key;
  }

  async setKey(key: string): Promise<void> {
    this.key = key;
  }

  async clearKey(): Promise<void> {
    this.key = null;
  }
}

/** Production store: Neon `app_settings` (migration 0002). */
export class NeonAiSettingsStore implements AiSettingsStore {
  private readonly db: ReturnType<typeof drizzle>;

  constructor(connectionString: string) {
    this.db = drizzle(neon(connectionString));
  }

  async getKey(): Promise<string | null> {
    const rows = await this.db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, ANTHROPIC_API_KEY_SETTING))
      .limit(1);
    return rows[0]?.value ?? null;
  }

  async setKey(key: string): Promise<void> {
    await this.db
      .insert(appSettings)
      .values({ key: ANTHROPIC_API_KEY_SETTING, value: key })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: key, updatedAt: new Date() },
      });
  }

  async clearKey(): Promise<void> {
    await this.db
      .delete(appSettings)
      .where(eq(appSettings.key, ANTHROPIC_API_KEY_SETTING));
  }
}
