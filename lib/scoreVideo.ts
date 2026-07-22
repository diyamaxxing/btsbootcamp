import type { Video } from "./types";
import { computeScore } from "./scoring";

// Thin wrapper over lib/scoring/'s signal registry + combinator — kept as
// the stable import path every call site already uses. Previously a
// hardcoded formula, itself collapsed from 3 copy-pasted inline <script>
// blocks (mainmuster.html, pages/index.html, pages/player.html); see
// lib/scoring/ for how a second signal (e.g. #13/#14) gets added without
// touching this function's callers.
export function scoreVideo(v: Video): number {
  return computeScore(v);
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
