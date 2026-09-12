// A real Error's `.message` is what should reach the user — `String(err)`
// on one prepends the literal word "Error:", and on anything else (a thrown
// string, a rejected non-Error value) falls back to a generic line rather
// than whatever shape that value happens to have.
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return "Something went wrong. Please try again.";
}
