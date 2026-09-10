import Constants from "expo-constants";
import { supabase } from "./supabase";
import type { MonthlySummaryResponse, SyncedTransaction } from "../types";

const { apiBaseUrl } = Constants.expoConfig?.extra ?? {};

if (!apiBaseUrl) {
  throw new Error("Missing apiBaseUrl in app.json > expo.extra");
}

async function authedFetch(path: string, options: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Not signed in");
  }

  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${path} failed (${res.status}): ${body}`);
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
