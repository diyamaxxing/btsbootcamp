// Generic GA4 custom-event logger. GA4 itself is already wired up in
// app/(site)/layout.tsx (gtag script + config) — this just calls the
// gtag() the layout already defines on window, so no new script tag or
// dependency is needed. New event call sites are a one-line addition each;
// this file intentionally doesn't pre-declare an event schema.
//
// bestofbootcamp/automation/engagement/fetch-engagement.js reads events
// logged here back out via the GA4 Data API on a schedule — see
// ARCHITECTURE_DECISIONS.md.

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function logEvent(name: string, params?: Record<string, string | number>): void {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", name, params);
}
