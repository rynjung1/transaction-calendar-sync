import Constants from "expo-constants";
import { supabase } from "./supabase";
import type { MonthlySummaryResponse, SyncedTransaction, SyncFilters, SyncFiltersResponse } from "../types";

const { apiBaseUrl } = Constants.expoConfig?.extra ?? {};

if (!apiBaseUrl) {
  throw new Error("Missing apiBaseUrl in app.json > expo.extra");
}

async function sendRequest(path: string, options: RequestInit, accessToken: string): Promise<Response> {
  try {
    return await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...options.headers,
      },
    });
  } catch (err) {
    console.error(`Network error calling ${path}`, err);
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }
}

async function authedFetch(path: string, options: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("You're signed out — please sign in again.");
  }

  let res = await sendRequest(path, options, session.access_token);

  // A 401 right after a real sign-in has been observed in practice with a
  // freshly-issued, otherwise-valid token — a plain retry (no code change)
  // succeeded, pointing at some transient lag rather than a bad token. Force
  // a session refresh and retry exactly once before treating it as a real
  // auth failure, since a silent one-shot recovery here beats surfacing
  // "Invalid or expired session" to the user for something that clears
  // itself moments later.
  if (res.status === 401) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed.session) {
      res = await sendRequest(path, options, refreshed.session.access_token);
    }
  }

  if (!res.ok) {
    const bodyText = await res.text();
    console.error(`${path} failed (${res.status}):`, bodyText);
    // Our own backend returns {"error": "a human-readable message"} — surface
    // that when present, since it's often specific and worth showing (e.g. a
    // validation message); fall back to a calm generic line otherwise, never
    // the raw response body or status code.
    let message = "Something went wrong. Please try again.";
    try {
      const parsed = JSON.parse(bodyText);
      if (typeof parsed?.error === "string" && parsed.error) {
        message = parsed.error;
      }
    } catch {
      // Not JSON — keep the generic message.
    }
    throw new Error(message);
  }

  return res.json();
}

export function getPlaidStatus(): Promise<{ linked: boolean }> {
  return authedFetch("/api/plaid/status", { method: "GET" });
}

export function createLinkToken(): Promise<{ linkToken: string }> {
  return authedFetch("/api/plaid/create-link-token", { method: "POST" });
}

export function exchangePublicToken(publicToken: string): Promise<{ ok: true }> {
  return authedFetch("/api/plaid/exchange-token", {
    method: "POST",
    body: JSON.stringify({ publicToken }),
  });
}

export function syncTransactions(): Promise<{
  transactions: SyncedTransaction[];
}> {
  return authedFetch("/api/plaid/sync", { method: "POST" });
}

export function getMonthlyTransactions(month: string): Promise<MonthlySummaryResponse> {
  return authedFetch(`/api/transactions/monthly?month=${month}`, { method: "GET" });
}

export function confirmCalendarEvent(
  transactionId: string,
  calendarEventId: string
): Promise<{ ok: true }> {
  return authedFetch("/api/transactions/confirm", {
    method: "POST",
    body: JSON.stringify({ transactionId, calendarEventId }),
  });
}

export function getSyncFilters(): Promise<SyncFiltersResponse> {
  return authedFetch("/api/settings/sync-filters", { method: "GET" });
}

export function updateSyncFilters(
  filters: SyncFilters
): Promise<{ ok: true; sync_filters: SyncFilters }> {
  return authedFetch("/api/settings/sync-filters", {
    method: "PATCH",
    body: JSON.stringify(filters),
  });
}

export function deleteAccount(): Promise<{ ok: true }> {
  return authedFetch("/api/account", { method: "DELETE" });
}
