import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";

// Crash/error reporting for the mobile app specifically — the backend
// already has real visibility via Vercel's own log retention (that's how
// the PLAID_SECRET-leak bug earlier this session was actually caught), but
// nothing on-device reports anywhere if something goes wrong for a real
// user; the developer would only ever find out if that user happened to
// mention it. This closes that gap for uncaught JS exceptions and native
// crashes automatically, with no other code changes required — Sentry's
// React Native SDK installs its own global handlers once initialized.
//
// No-ops safely on an empty DSN (the placeholder in app.config.ts before a
// real Sentry project exists) rather than throwing — this file is safe to
// import unconditionally regardless of whether a DSN has been configured
// yet.
export function initSentry() {
  const dsn = Constants.expoConfig?.extra?.sentryDsn;
  if (!dsn) {
    if (__DEV__) {
      console.log("[sentry] No DSN configured — crash/error reporting is disabled.");
    }
    return;
  }

  Sentry.init({
    dsn,
    // Sends real, exact error text to Sentry — fine for a spending-tracker
    // app's own errors (network failures, sync failures, etc.), but this is
    // the one thing worth revisiting if this app ever logs something more
    // sensitive in an error message than it does today (it doesn't
    // currently — see getErrorMessage()/safeErrorInfo()'s own posture on
    // never surfacing raw/secret-bearing errors to the user, which is the
    // same class of data this would send to Sentry).
    // Performance tracing is a separate, quota-consuming thing from error
    // reporting (the actual ask here) — off by default so a free-tier Sentry
    // project's quota goes toward crashes/errors, not trace volume. Can be
    // turned on later as a deliberate choice, not a default side effect of
    // adding crash reporting.
    tracesSampleRate: 0,
    enabled: !__DEV__,
    debug: false,
  });
}

// Real gap found on a fresh read-through, after initSentry() above was
// already in place: Sentry's automatic global handlers only ever catch
// UNCAUGHT exceptions and render crashes — every one of this app's ~9
// try/catch blocks (auth, sync, settings, linking) that catches an error and
// handles it locally (usually just an Alert to the user) was invisible to
// Sentry entirely, since a caught exception never reaches those global
// handlers. That's the exact gap initSentry()'s own comment describes
// ("nothing on-device reports anywhere if something goes wrong") — it just
// wasn't actually closed for the most common failure shape in the app,
// only for the rarer uncaught-crash case. A per-transaction calendar-write
// failure in HomeScreen specifically had zero signal anywhere (not even a
// console.error) before this.
//
// Confirmed safe to call unconditionally, including before initSentry() has
// run (an empty DSN never calls Sentry.init at all): read the installed
// SDK's own Scope.captureException — it checks for a configured client and
// simply returns without throwing if there isn't one, only logging a debug
// warning in a debug build. So every call site below stays correct whether
// or not a real Sentry project exists yet, same posture as the DSN check
// above.
export function captureError(err: unknown, context: Record<string, unknown> = {}) {
  Sentry.captureException(err, { extra: context });
}
