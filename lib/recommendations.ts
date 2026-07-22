import type { Era, Video } from "./types";
import { byLikes, byScore, typeMatch } from "./scoreVideo";

export interface RecommendationCarousel {
  title: string;
  videos: Video[];
}

// Ported verbatim from pages/player.html's buildRecommendations(). Produces
// at most 9 carousels — CLAUDE.md's routes table already said 9; its spec
// section and changelog said 10, which was the stale figure (the "5/6 fan
// favorites" numbering only ever built one carousel). Fixed here and in the
// docs rewrite, not left ambiguous.
export function buildRecommendations(current: Video, all: Video[], eras: Era[]): RecommendationCarousel[] {
  const active = all.filter((v) => v.status === "active" && v.id !== current.id);
  // Shared across every pool() call below — once a video appears in one
  // carousel (e.g. "Up Next"), it's excluded from every carousel after it,
  // so the same video never shows up twice down the page.
  const shown = new Set<string>();

  function pool(filter: (v: Video) => boolean, sort: (a: Video, b: Video) => number, n: number): Video[] {
    const results = active
      .filter((v) => !shown.has(v.id) && filter(v))
      .sort(sort)
      .slice(0, n);
    results.forEach((v) => shown.add(v.id));
    return results;
  }

  const eraIdx = (name: string | null) => eras.findIndex((e) => e.name === name);
  const curIdx = eraIdx(current.era);

  const carousels: RecommendationCarousel[] = [];

  // 0. same song/release, any type or era — the strongest relevance signal
  // there is. An MV, its dance practice, and a bomb about its jacket shoot
  // are all clearly related even though they're totally different content
  // types, so this runs before "Up Next" rather than being folded into the
  // type/era-based pools below. `song` is extracted from the quoted title
  // substring in build_videos_json.py — see CATEGORY_PATTERNS/SONG_PATTERN
  // there for how it's derived.
  if (current.song) {
    const sameSong = pool((v) => v.song === current.song, byScore, 15);
    if (sameSong.length) carousels.push({ title: `More '${current.song}'`, videos: sameSong });
  }

  // 1. tightest — same era + same type
  const upNext = pool((v) => v.era === current.era && typeMatch(v, current), byScore, 15);
  if (upNext.length) carousels.push({ title: "Up Next", videos: upNext });

  // 2. same era, any type
  if (current.era) {
    const moreEra = pool((v) => v.era === current.era, byScore, 15);
    if (moreEra.length) carousels.push({ title: `More from ${current.era}`, videos: moreEra });
  }

  // 3. same type, any era
  const moreType = pool((v) => typeMatch(v, current), byScore, 15);
  if (moreType.length) carousels.push({ title: `More ${current.type}`, videos: moreType });

  // 4. same members (only meaningful when video has a subset of the group)
  const currentMembers = current.members || [];
  if (currentMembers.length > 0 && currentMembers.length < 7) {
    const withMembers = pool(
      (v) => (v.members || []).length < 7 && currentMembers.some((m) => (v.members || []).includes(m)),
      byScore,
      15
    );
    const label =
      currentMembers.length === 1
        ? `More with ${currentMembers[0]}`
        : `More with ${currentMembers.slice(0, -1).join(", ")} & ${currentMembers.at(-1)}`;
    if (withMembers.length) carousels.push({ title: label, videos: withMembers });
  }

  // 5. fan favorites — same type sorted by likes
  const loved = pool((v) => typeMatch(v, current), byLikes, 15);
  if (loved.length) carousels.push({ title: `Fan Favorites: ${current.type}`, videos: loved });

  // 6. nearby eras (±1–2 steps in the era list)
  if (curIdx !== -1) {
    const nearbyEraNames = eras.filter((_, i) => i !== curIdx && Math.abs(i - curIdx) <= 2).map((e) => e.name);
    const nearby = pool((v) => !!v.era && nearbyEraNames.includes(v.era), byScore, 15);
    if (nearby.length) carousels.push({ title: "From Nearby Eras", videos: nearby });
  }

  // 7. most loved overall
  const mostLoved = pool(() => true, byLikes, 15);
  if (mostLoved.length) carousels.push({ title: "Most Loved", videos: mostLoved });

  // 8. trending overall — whatever's left
  const trending = pool(() => true, byScore, 15);
  if (trending.length) carousels.push({ title: "Trending", videos: trending });

  return carousels;
}
