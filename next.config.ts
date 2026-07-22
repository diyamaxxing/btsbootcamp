import type { NextConfig } from "next";

// Static export — this site deploys to GitHub Pages, which serves plain
// files with no Node server behind it. No API routes, no ISR, no
// server-side runtime data fetching; every route ships as a plain static
// HTML/JS/CSS bundle. See ARCHITECTURE_DECISIONS.md, "Framework migration"
// entry, for why this constraint exists (the 2026-07-19 GitHub-Pages-not-
// Vercel hosting decision is treated as settled, not reopened here).
const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  // Without this, a route like /player exports as a sibling player.html
  // file PLUS an empty player/ directory (holding only RSC-payload
  // fetch data, no index.html) — GitHub Pages' extension-resolution quirk
  // papers over that for .html-less links, but any standard static host
  // (including a plain local `python -m http.server`, confirmed while
  // verifying this migration) can't resolve /player/ at all. trailingSlash
  // makes every route export as <route>/index.html instead — the
  // universally-supported directory+index.html shape, no host-specific
  // behavior relied on.
  trailingSlash: true,
};

export default nextConfig;
