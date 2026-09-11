import { createHash, createPublicKey, verify as cryptoVerify, webcrypto } from "node:crypto";
import type { VercelRequest } from "@vercel/node";
import { plaidClient } from "./plaid";

// Verifies the `Plaid-Verification` JWT Plaid attaches to every webhook
// request. Docs: https://plaid.com/docs/api/webhooks/webhook-verification/
//
// This is the only endpoint in the app that can't use requireUser() — Plaid
// has no user session — so this check is the only thing standing between the
// open internet and a handler that mutates plaid_items status and triggers
// real Plaid API calls with a real decrypted access token.
//
// Three things are checked, all required:
//   1. The JWT's ES256 signature, against Plaid's published key for its `kid`.
//   2. `iat` isn't stale (bounds how long a captured JWT could be replayed).
//   3. `request_body_sha256` matches a hash of the *actual* raw bytes we
//      received — this is what stops a genuine-looking JWT from being paired
//      with a different, attacker-controlled body.

const MAX_WEBHOOK_AGE_SECONDS = 5 * 60;

// Verification keys are long-lived per Plaid's docs — cache by kid so a busy
// webhook endpoint isn't calling out to Plaid on every request. Cache is
// per-warm-instance only; a cold start just refetches, which is fine.
const keyCache = new Map<string, webcrypto.JsonWebKey>();

export class WebhookVerificationError extends Error {}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

async function getVerificationKey(keyId: string): Promise<webcrypto.JsonWebKey> {
  const cached = keyCache.get(keyId);
  if (cached) {
    return cached;
  }
  const response = await plaidClient.webhookVerificationKeyGet({ key_id: keyId });
  const jwk = response.data.key as unknown as webcrypto.JsonWebKey;
  keyCache.set(keyId, jwk);
  return jwk;
}

export async function verifyPlaidWebhook(req: VercelRequest, rawBody: Buffer): Promise<void> {
  const header = req.headers["plaid-verification"];
  const token = Array.isArray(header) ? header[0] : header;
  if (!token) {
    throw new WebhookVerificationError("Missing Plaid-Verification header");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new WebhookVerificationError("Malformed verification JWT");
  }
  const [headerB64, payloadB64, signatureB64] = parts;

  let jwtHeader: { alg?: string; kid?: string };
  let jwtPayload: { iat?: number; request_body_sha256?: string };
  try {
    jwtHeader = JSON.parse(base64UrlDecode(headerB64).toString("utf8"));
    jwtPayload = JSON.parse(base64UrlDecode(payloadB64).toString("utf8"));
  } catch {
    throw new WebhookVerificationError("Malformed verification JWT");
  }

  if (jwtHeader.alg !== "ES256" || !jwtHeader.kid) {
    throw new WebhookVerificationError("Unexpected JWT header");
  }

  const jwk = await getVerificationKey(jwtHeader.kid);
  const publicKey = createPublicKey({ key: jwk, format: "jwk" });

  // ES256 JWT signatures are raw r||s (IEEE P1363), not the DER encoding
  // Node's crypto.verify() defaults to — must be set explicitly or every
  // signature check fails.
  const isValid = cryptoVerify(
    "sha256",
    Buffer.from(`${headerB64}.${payloadB64}`),
    { key: publicKey, dsaEncoding: "ieee-p1363" },
    base64UrlDecode(signatureB64)
  );
  if (!isValid) {
    throw new WebhookVerificationError("Invalid webhook signature");
  }

  if (!jwtPayload.iat || Date.now() / 1000 - jwtPayload.iat > MAX_WEBHOOK_AGE_SECONDS) {
    throw new WebhookVerificationError("Webhook JWT is stale or missing iat");
  }

  const actualBodyHash = createHash("sha256").update(rawBody).digest("hex");
  if (jwtPayload.request_body_sha256 !== actualBodyHash) {
    throw new WebhookVerificationError("Request body hash does not match signed hash");
  }
}
