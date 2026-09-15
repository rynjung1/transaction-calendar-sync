import { createClient } from "@supabase/supabase-js";
import type { WebSocketLikeConstructor } from "@supabase/realtime-js";
import WebSocket from "ws";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars");
}

// `realtime: { transport: WebSocket }` — real, immediate regression caught
// updating @supabase/supabase-js (2.78.0 -> 2.109.0, done to drop the
// @supabase/node-fetch dependency chain — see the `ws` install commit).
// SupabaseClient's constructor unconditionally builds a RealtimeClient (this
// backend never actually calls .channel() anywhere, but the library doesn't
// offer a way to skip constructing it, only to configure it), and newer
// realtime-js requires either Node 22+'s native WebSocket or an explicit
// transport for Node < 22 — confirmed for real: `createClient(...)` threw
// immediately ("Node.js 20 detected without native WebSocket support") the
// moment the upgraded package tried to import lib/supabase.ts, breaking
// every test file and local dev entirely on this machine's Node 20.20.2.
// Vercel production is already pinned to Node 24.x (has native WebSocket,
// wouldn't have hit this), but the fix needs to work locally regardless of
// what Node version happens to be running where — passing the `ws` package
// explicitly, exactly as the library's own error message suggests, works
// identically on both rather than depending on the runtime's Node version.
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  // `WebSocketLikeConstructor`'s own doc comment explicitly lists `ws` as an
  // intended, supported implementation for exactly this case ("Supply a
  // compatible implementation (native WebSocket, `ws`, etc)") — the cast is
  // needed only because `ws`'s own constructor overloads don't structurally
  // match this minimal interface exactly (its first-address-param type is
  // wider), not because of any real incompatibility.
  realtime: { transport: WebSocket as unknown as WebSocketLikeConstructor },
});
