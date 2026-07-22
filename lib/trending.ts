// Real BTSBootcamp pageview-based trending data, refreshed on a schedule by
// bestofbootcamp/automation/trending/fetch-trending.js from the GA4 Data
// API. Fetched the same way lib/comments.ts reads data/comments.json — a
// plain runtime fetch from bestofbootcamp, no build-time embedding.

import { rawContentUrl } from "./github";

export interface TrendingData {
  generated_at: string | null;
  window_days: number;
  videos: Record<string, number>;
}

let trendingCache: TrendingData | null = null;

export async function loadTrending(): Promise<TrendingData> {
  if (trendingCache) return trendingCache;
  const res = await fetch(rawContentUrl("data/trending.json"));
  trendingCache = await res.json();
  return trendingCache as TrendingData;
}
