"use client";

import { useEffect, useState } from "react";
import type { Era, Video } from "@/lib/types";
import { byScore, recentTopN, topN } from "@/lib/scoreVideo";
import { Hero } from "@/components/Hero";
import { Carousel } from "@/components/Carousel";
import { EraRail } from "@/components/EraRail";

export default function HomePage() {
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [eras, setEras] = useState<Era[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetch("/data/videos.json").then((r) => r.json()), fetch("/data/eras.json").then((r) => r.json())])
      .then(([v, e]) => {
        setVideos(v);
        setEras(e);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p>Error: {error}</p>;
  if (!videos || !eras) return <p>Loading...</p>;

  const active = videos.filter((v) => v.status === "active");
  const trending = topN(active, 20);
  const mostLoved = [...active].sort((a, b) => (b.like_count || 0) - (a.like_count || 0)).slice(0, 20);
  const hero = recentTopN(active, 1)[0];

  // Folds in tags (Fancam, Music Show, etc.) alongside type, since
  // cross-tagged videos (e.g. the 5 Bangtan Bombs that are structurally
  // dance practices, tagged ["Dance Practice"]) show up in both pools they
  // legitimately belong to.
  const allTypes = [...new Set(videos.flatMap((v) => [v.type, ...(v.tags || [])]))].sort();

  return (
    <>
      {/* #stats-bar in the original was never populated (dead markup, and
          its CSS selector #stats didn't even match #stats-bar) — ported
          as a faithful empty placeholder, not a new feature. */}
      <div />
      <EraRail eras={eras} videos={videos} mode="link" />
      {hero && <Hero video={hero} />}
      <Carousel title="Trending" videos={trending} />
      <Carousel title="Most Loved" videos={mostLoved} />
      {allTypes.map((type) => {
        const inType = (v: Video) => v.type === type || (v.tags || []).includes(type);
        const filtered = active.filter(inType);
        const sorted = [...filtered].sort(byScore).slice(0, 20);
        const disclaimer = type === "Run BTS" ? "Originally aired on V LIVE — not sorted by era." : undefined;
        return <Carousel key={type} title={type} videos={sorted} count={filtered.length} disclaimer={disclaimer} />;
      })}
    </>
  );
}
