import { AdminChangeEventsResponseSchema } from "@obcda/contracts";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { dictionaryFixture } from "../src/fixtures";
import { InMemoryDictionaryRepository } from "../src/repositories/inMemory";
import { InMemoryAuditChangeWriter } from "../src/services/auditEvents";

const VALID_KEY = "sk-ant-api03-abcdefghijkl";
const TEAM_DOMAIN = "example-team.cloudflareaccess.com";
const AUD = "test-audience-tag";

let privateKey: CryptoKey;
let keySource: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey as CryptoKey;
  const jwk = await exportJWK(pair.publicKey);
  keySource = createLocalJWKSet({ keys: [{ ...jwk, alg: "RS256", kid: "test-key" }] });
});

function makeApp(writer: InMemoryAuditChangeWriter) {
  return createApp(new InMemoryDictionaryRepository(dictionaryFixture), {
    auditChangeWriter: writer,
    accessJwt: { keySource },
    disableRateLimits: true,
  });
}

async function saveKey(
  app: ReturnType<typeof createApp>,
  init: { headers?: Record<string, string>; env?: Record<string, string> } = {},
) {
  return app.request(
    "/api/v1/admin/ai-settings",
    {
      method: "POST",
      headers: { "content-type": "application/json", ...init.headers },
      body: JSON.stringify({ apiKey: VALID_KEY }),
    },
    init.env,
  );
}

describe("S4: durable admin change audit (audit_events)", () => {
  it("records save/clear with masked summaries — never the raw key", async () => {
    const writer = new InMemoryAuditChangeWriter();
    const app = makeApp(writer);

    expect((await saveKey(app)).status).toBe(200);
    expect(
      (await app.request("/api/v1/admin/ai-settings", { method: "DELETE" })).status,
    ).toBe(200);

    const records = await writer.list(10);
    expect(records).toHaveLength(2);
    // newest first
    expect(records[0]!.action).toBe("ai_settings.clear");
    expect(records[1]!.action).toBe("ai_settings.save");
    expect(records[1]!.beforeSummary).toEqual({ configured: false });
    expect(records[1]!.afterSummary).toEqual({
      configured: true,
      maskedKey: "…ijkl",
    });
    expect(records[0]!.afterSummary).toEqual({ configured: false });
    expect(JSON.stringify(records)).not.toContain(VALID_KEY);
  });

  it("records the Access JWT email as actor when §9.1 verification ran", async () => {
    const writer = new InMemoryAuditChangeWriter();
    const app = makeApp(writer);
    const token = await new SignJWT({ email: "admin@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(`https://${TEAM_DOMAIN}`)
      .setAudience(AUD)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    const res = await saveKey(app, {
      headers: { "cf-access-jwt-assertion": token },
      env: { CF_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN, CF_ACCESS_AUD: AUD },
    });
    expect(res.status).toBe(200);
    const records = await writer.list(1);
    expect(records[0]!.actor).toBe("admin@example.com");
  });

  it("falls back to anonymous actor without Access", async () => {
    const writer = new InMemoryAuditChangeWriter();
    const app = makeApp(writer);
    await saveKey(app);
    expect((await writer.list(1))[0]!.actor).toBe("anonymous");
  });

  it("serves the trail via GET /api/v1/admin/change-events", async () => {
    const writer = new InMemoryAuditChangeWriter();
    const app = makeApp(writer);
    await saveKey(app);
    const res = await app.request("/api/v1/admin/change-events?limit=10");
    expect(res.status).toBe(200);
    const parsed = AdminChangeEventsResponseSchema.parse(await res.json());
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0]!.targetType).toBe("ai_settings");
  });

  it("does not fail the admin operation when the audit writer throws", async () => {
    const throwingWriter = new (class extends InMemoryAuditChangeWriter {
      override async record(): Promise<void> {
        throw new Error("db down");
      }
    })();
    const app = makeApp(throwingWriter);
    expect((await saveKey(app)).status).toBe(200);
  });
});
