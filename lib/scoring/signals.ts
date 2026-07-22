import type { Video } from "../types";

// Extended with more fields only once a real second-order signal exists to
// populate them (e.g. #14's offline ML pipeline) — deliberately not
// pre-populated with speculative shapes. `engagement` is here now because
// bestofbootcamp/automation/engagement/fetch-engagement.js (a GA4-pull
// pipeline mirroring the trending one) produces exactly this shape once its
// one manual GA4 custom-dimension prerequisite is done — see
// ARCHITECTURE_DECISIONS.md.
export interface ScoringContext {
  // video id -> on-site click count, from bestofbootcamp's data/engagement.json
  engagement?: Record<string, number>;
}

export type SignalFn = (v: Video, ctx: ScoringContext) => number;

// Every signal is written to already return a value on a roughly comparable
// scale to the others (a documented convention, not something the
// combinator enforces) — log10 naturally compresses any count-shaped signal
// (YouTube views/likes, on-site clicks) to roughly the same 0-8 range, so
// weights stay meaningful without a corpus-wide normalization pass.
export const SIGNALS = {
  views: (v) => Math.log10((v.view_count || 0) + 1),
  likes: (v) => Math.log10((v.like_count || 0) + 1),
  // Not in DEFAULT_PROFILE yet (lib/scoring/index.ts) — registered so the
  // seam exists, inert until data/engagement.json has real rows to read.
  engagement: (v, ctx) => Math.log10((ctx.engagement?.[v.id] || 0) + 1),
} satisfies Record<string, SignalFn>;

export type SignalName = keyof typeof SIGNALS;
