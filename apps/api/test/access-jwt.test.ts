import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { dictionaryFixture } from "../src/fixtures";
import { InMemoryDictionaryRepository } from "../src/repositories/inMemory";

const TEAM_DOMAIN = "example-team.cloudflareaccess.com";
const AUD = "test-audience-tag";
const ACCESS_ENV = { CF_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN, CF_ACCESS_AUD: AUD };

let privateKey: CryptoKey;
let keySource: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey as CryptoKey;
  const jwk = await exportJWK(pair.publicKey);
  keySource = createLocalJWKSet({ keys: [{ ...jwk, alg: "RS256", kid: "test-key" }] });
});

function makeApp() {
  return createApp(new InMemoryDictionaryRepository(dictionaryFixture), {
    accessJwt: { keySource },
    disableRateLimits: true,
  });
}

async function signToken(claims: {
  issuer?: string;
  audience?: string;
  email?: string;
  expiresIn?: string;
}) {
  return new SignJWT({ email: claims.email ?? "member@example.com" })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(claims.issuer ?? `https://${TEAM_DOMAIN}`)
    .setAudience(claims.audience ?? AUD)
    .setIssuedAt()
    .setExpirationTime(claims.expiresIn ?? "5m")
    .sign(privateKey);
}

describe("accessJwt middleware (§9.1 admin defence-in-depth)", () => {
  it("passes through when CF_ACCESS_* are not configured (dev/preview)", async () => {
    const app = makeApp();
    const res = await app.request("/api/v1/admin/ai-settings");
    expect(res.status).toBe(200);
  });

  it("rejects admin requests without the Access JWT when configured", async () => {
    const app = makeApp();
    const res = await app.request("/api/v1/admin/ai-settings", {}, ACCESS_ENV);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("accepts a valid Access JWT and serves the admin route", async () => {
    const app = makeApp();
    const token = await signToken({});
    const res = await app.request(
      "/api/v1/admin/ai-settings",
      { headers: { "cf-access-jwt-assertion": token } },
      ACCESS_ENV,
    );
    expect(res.status).toBe(200);
  });

  it("rejects a JWT with the wrong audience", async () => {
    const app = makeApp();
    const token = await signToken({ audience: "other-app" });
    const res = await app.request(
      "/api/v1/admin/ai-settings",
      { headers: { "cf-access-jwt-assertion": token } },
      ACCESS_ENV,
    );
    expect(res.status).toBe(401);
  });

  it("rejects a JWT from another issuer", async () => {
    const app = makeApp();
    const token = await signToken({ issuer: "https://evil.example.com" });
    const res = await app.request(
      "/api/v1/admin/ai-settings",
      { headers: { "cf-access-jwt-assertion": token } },
      ACCESS_ENV,
    );
    expect(res.status).toBe(401);
  });

  it("rejects an expired JWT", async () => {
    const app = makeApp();
    const token = await new SignJWT({ email: "member@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(`https://${TEAM_DOMAIN}`)
      .setAudience(AUD)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(privateKey);
    const res = await app.request(
      "/api/v1/admin/ai-settings",
      { headers: { "cf-access-jwt-assertion": token } },
      ACCESS_ENV,
    );
    expect(res.status).toBe(401);
  });

  it("rejects a JWT signed with an unknown key", async () => {
    const app = makeApp();
    const otherPair = await generateKeyPair("RS256");
    const token = await new SignJWT({ email: "member@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(`https://${TEAM_DOMAIN}`)
      .setAudience(AUD)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(otherPair.privateKey as CryptoKey);
    const res = await app.request(
      "/api/v1/admin/ai-settings",
      { headers: { "cf-access-jwt-assertion": token } },
      ACCESS_ENV,
    );
    expect(res.status).toBe(401);
  });

  it("does not gate non-admin routes", async () => {
    const app = makeApp();
    const res = await app.request("/api/v1/health/live", {}, ACCESS_ENV);
    expect(res.status).toBe(200);
  });
});
