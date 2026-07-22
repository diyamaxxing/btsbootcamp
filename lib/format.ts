// Ported verbatim from the 3 near-identical copies that used to live inline
// in mainmuster.html / pages/index.html / pages/player.html.

export function fmtViews(n: number | null | undefined): string {
  if (!n) return "";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toString();
}

export function fmtHours(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h.toLocaleString()}h ${m}m`;
}

export function fmtCommentTime(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Extracts the actual YouTube video ID from a watch URL — used only for
// thumbnail URLs in the player's recommendation river; v.id is this
// catalog's own identifier and is unrelated.
export function ytId(url: string): string | null {
  const m = url.match(/v=([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}
