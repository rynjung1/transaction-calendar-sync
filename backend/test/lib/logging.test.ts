import { describe, expect, it } from "vitest";
import { safeErrorInfo } from "../../lib/logging";

// This is the fix for the most severe bug found this session: a raw axios
// error object (which Plaid's Node SDK throws) embeds the entire outgoing
// request in .config/.request — for every Plaid call in this app, that's
// the PLAID-SECRET header, and for item-scoped calls the decrypted
// access_token too. Proved live at the time with a real forced Plaid error;
// this test locks that proof in permanently rather than relying on memory
// of a one-off script that's since been deleted.
describe("safeErrorInfo", () => {
  it("never includes a secret embedded in an axios error's request config", () => {
    const CANARY_SECRET = "canary-plaid-secret-should-never-appear";
    const CANARY_TOKEN = "access-sandbox-canary-token-should-never-appear";

    // Shaped like a real axios error thrown by the Plaid SDK — confirmed
    // against a genuine one during this session's original investigation.
    const fakeAxiosError = {
      isAxiosError: true,
      message: "Request failed with status code 400",
      config: {
        headers: { "PLAID-SECRET": CANARY_SECRET, "PLAID-CLIENT-ID": "some-client-id" },
        data: JSON.stringify({ access_token: CANARY_TOKEN }),
        url: "https://sandbox.plaid.com/item/remove",
      },
      request: {
        _header: `POST /item/remove HTTP/1.1\r\nPLAID-SECRET: ${CANARY_SECRET}\r\n\r\n`,
      },
      response: {
        status: 400,
        data: {
          error_code: "INVALID_ACCESS_TOKEN",
          error_type: "INVALID_INPUT",
          error_message: "provided access token is in an invalid format",
        },
      },
    };

    const safe = safeErrorInfo(fakeAxiosError);
    const serialized = JSON.stringify(safe);

    expect(serialized).not.toContain(CANARY_SECRET);
    expect(serialized).not.toContain(CANARY_TOKEN);
    // Still useful for debugging — the fix isn't "log nothing".
    expect((safe as { plaidError?: { error_code?: string } }).plaidError?.error_code).toBe(
      "INVALID_ACCESS_TOKEN"
    );
  });

  it("extracts message and name from a plain Error, nothing else", () => {
    const err = new Error("something broke");
    const safe = safeErrorInfo(err) as { message: string; name: string };
    expect(safe.message).toBe("something broke");
    expect(safe.name).toBe("Error");
  });

  it("passes through a non-Error, non-axios value unchanged (e.g. a Supabase PostgrestError)", () => {
    const postgrestLikeError = { message: "duplicate key value", code: "23505" };
    expect(safeErrorInfo(postgrestLikeError)).toEqual(postgrestLikeError);
  });
});
