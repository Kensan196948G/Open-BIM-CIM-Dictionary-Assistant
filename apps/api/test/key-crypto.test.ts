import { describe, expect, it } from "vitest";

import {
  EncryptedAiSettingsStore,
  InMemoryAiSettingsStore,
} from "../src/services/aiSettings";
import {
  decryptSetting,
  encryptSetting,
  importSettingsKey,
  isEncryptedSetting,
} from "../src/services/keyCrypto";

function randomKek(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64");
}

describe("keyCrypto (app_settings encryption at rest)", () => {
  it("round-trips a value through enc:v1", async () => {
    const key = await importSettingsKey(randomKek());
    const sealed = await encryptSetting(key, "sk-ant-api03-secret-value");
    expect(isEncryptedSetting(sealed)).toBe(true);
    expect(sealed).not.toContain("secret-value");
    expect(await decryptSetting(key, sealed)).toBe("sk-ant-api03-secret-value");
  });

  it("produces a different ciphertext per encryption (random IV)", async () => {
    const key = await importSettingsKey(randomKek());
    const first = await encryptSetting(key, "same-plaintext");
    const second = await encryptSetting(key, "same-plaintext");
    expect(first).not.toBe(second);
  });

  it("rejects a wrong-size KEK", async () => {
    await expect(
      importSettingsKey(Buffer.from("short").toString("base64")),
    ).rejects.toThrow();
  });

  it("fails on tampered ciphertext (GCM auth)", async () => {
    const key = await importSettingsKey(randomKek());
    const sealed = await encryptSetting(key, "value");
    const tampered = sealed.slice(0, -4) + (sealed.endsWith("AAAA") ? "BBBB" : "AAAA");
    await expect(decryptSetting(key, tampered)).rejects.toThrow();
  });
});

describe("EncryptedAiSettingsStore", () => {
  it("stores only ciphertext in the backing store and decrypts on read", async () => {
    const inner = new InMemoryAiSettingsStore();
    const store = new EncryptedAiSettingsStore(inner, randomKek());
    await store.setKey("sk-ant-api03-abcdefghijkl");
    const raw = await inner.getKey();
    expect(raw).not.toBeNull();
    expect(isEncryptedSetting(raw!)).toBe(true);
    expect(raw).not.toContain("abcdefghijkl");
    expect(await store.getKey()).toBe("sk-ant-api03-abcdefghijkl");
  });

  it("reads pre-existing plaintext rows unchanged (lazy migration)", async () => {
    const inner = new InMemoryAiSettingsStore();
    await inner.setKey("sk-ant-api03-legacy-plain");
    const store = new EncryptedAiSettingsStore(inner, randomKek());
    expect(await store.getKey()).toBe("sk-ant-api03-legacy-plain");
    // the next save seals the value
    await store.setKey("sk-ant-api03-resaved");
    expect(isEncryptedSetting((await inner.getKey())!)).toBe(true);
  });

  it("treats undecryptable values as absent (rotated KEK)", async () => {
    const inner = new InMemoryAiSettingsStore();
    const oldStore = new EncryptedAiSettingsStore(inner, randomKek());
    await oldStore.setKey("sk-ant-api03-oldkek");
    const newStore = new EncryptedAiSettingsStore(inner, randomKek());
    expect(await newStore.getKey()).toBeNull();
  });

  it("clears through to the backing store", async () => {
    const inner = new InMemoryAiSettingsStore();
    const store = new EncryptedAiSettingsStore(inner, randomKek());
    await store.setKey("sk-ant-api03-toclear");
    await store.clearKey();
    expect(await inner.getKey()).toBeNull();
    expect(await store.getKey()).toBeNull();
  });
});
