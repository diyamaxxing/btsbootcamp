import type { Video } from "./types";

// Phase 1: YouTube signals only. Phase 2 (Issue #13): extend to
// scoreVideo(v, userProgress). Previously copy-pasted verbatim into 3
// separate inline <script> blocks (mainmuster.html, pages/index.html,
// pages/player.html) — collapsed into one shared function here.
export function scoreVideo(v: Video): number {
  const views = Math.log10((v.view_count || 0) + 1);
  const likes = Math.log10((v.like_count || 0) + 1);
  return views * 0.7 + likes * 0.3;
}

export const byScore = (a: Video, b: Video) => scoreVideo(b) - scoreVideo(a);
export const byLikes = (a: Video, b: Video) => (b.like_count || 0) - (a.like_count || 0);

// Checked both directions (a's tags vs b's type, and vice versa) so
// cross-tagged videos (e.g. Bangtan Bombs tagged "Dance Practice") match
// against both real Dance Practice videos and other Bangtan Bombs.
export function typeMatch(a: Video, b: Video): boolean {
  return a.type === b.type || (a.tags || []).includes(b.type) || (b.tags || []).includes(a.type);
}

export function topN(videos: Video[], n: number): Video[] {
  return [...videos]
    .filter((v) => v.status === "active")
    .sort(byScore)
    .slice(0, n);
}

// Falls back to scoring the WHOLE catalog if fewer than n videos aired in
// the last `days` — otherwise a quiet week would starve the hero section
// instead of just serving slightly older (still good) content.
export function recentTopN(videos: Video[], n: number, days = 90): Video[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const recent = videos.filter((v) => v.air_date && v.air_date >= cutoffStr);
  return topN(recent.length >= n ? recent : videos, n);
}
