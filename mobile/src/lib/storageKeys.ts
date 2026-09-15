// Extracted from App.tsx so it's testable without React Native imports.
//
// Scoped per-user, not a single global key — a plain "selectedCalendar" key
// meant this device silently carried one account's calendar choice into
// whatever account was signed in next: delete your account and sign up
// fresh on the same device, and the new account inherited the deleted
// one's calendar choice, skipping the picker (and its privacy confirmation)
// entirely; on a shared device, signing in as a second account could do the
// same thing to a returning first account's own prior choice. Never
// specific to one user before, even though "which calendar" plainly is.
export function calendarStorageKey(userId: string): string {
  return `selectedCalendar:${userId}`;
}
