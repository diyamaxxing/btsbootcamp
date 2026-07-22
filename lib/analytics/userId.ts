// Hashes a logged-in username before it ever reaches GA4/logEvent(), so no
// raw username leaves the browser as part of engagement logging — only a
// one-way SHA-256 digest does. Only called with a real session username;
// logged-out visitors log events with no user dimension at all (see
// ARCHITECTURE_DECISIONS.md for why this stays scoped to logged-in users).
export async function hashUserId(username: string): Promise<string> {
  const bytes = new TextEncoder().encode(username.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
