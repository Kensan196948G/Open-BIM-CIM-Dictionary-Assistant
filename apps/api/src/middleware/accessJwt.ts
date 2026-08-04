import type { MiddlewareHandler } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";

import type { AppEnv } from "./context";
import { errorResponse } from "./errors";

/** Header Cloudflare Access attaches to authenticated origin requests. */
const ACCESS_JWT_HEADER = "cf-access-jwt-assertion";

type KeySource = Parameters<typeof jwtVerify>[1];

export type AccessJwtOptions = {
  /** Injectable key set for tests (e.g. jose createLocalJWKSet). */
  keySource?: KeySource;
};

/**
 * §9.1 defence-in-depth for admin routes: verify the Cloudflare Access JWT
 * at the application layer instead of trusting the edge alone. Activated by
 * binding both CF_ACCESS_TEAM_DOMAIN (e.g. "myteam.cloudflareaccess.com")
 * and CF_ACCESS_AUD (the Access application audience tag); without them the
 * middleware passes through, preserving local dev and the fixtures preview.
 *
 * Verified claims: signature (team JWKS), issuer, audience, expiry (jose
 * enforces exp/nbf by default). The `email` claim is exposed as `actorEmail`
 * for the audit trail; the raw token is never logged.
 */
export const accessJwt = (
  options: AccessJwtOptions = {},
): MiddlewareHandler<AppEnv> => {
  // JWKS is cached per middleware instance (jose caches fetches internally
  // and refreshes on unknown-kid), keyed by the bound team domain.
  let cachedTeamDomain: string | undefined;
  let cachedKeySource: KeySource | undefined;

  return async (c, next) => {
    const teamDomain = c.env?.CF_ACCESS_TEAM_DOMAIN;
    const audience = c.env?.CF_ACCESS_AUD;
    if (!teamDomain || !audience) {
      await next();
      return;
    }

    const assertion = c.req.header(ACCESS_JWT_HEADER);
    if (!assertion) {
      return errorResponse(c, "UNAUTHORIZED", "認証が必要です。");
    }

    let keySource = options.keySource;
    if (!keySource) {
      if (teamDomain !== cachedTeamDomain || !cachedKeySource) {
        cachedKeySource = createRemoteJWKSet(
          new URL(`https://${teamDomain}/cdn-cgi/access/certs`),
        );
        cachedTeamDomain = teamDomain;
      }
      keySource = cachedKeySource;
    }

    try {
      const { payload } = await jwtVerify(assertion, keySource, {
        issuer: `https://${teamDomain}`,
        audience,
      });
      if (typeof payload.email === "string") {
        c.set("actorEmail", payload.email);
      }
    } catch {
      // Reason is deliberately generic — verification failures must not leak
      // token contents or JWKS state to the caller or the logs.
      return errorResponse(c, "UNAUTHORIZED", "認証が必要です。");
    }

    await next();
  };
};
