import type { Video } from "../types";
import { SIGNALS, type ScoringContext, type SignalName } from "./signals";

export type ScoringProfile = Partial<Record<SignalName, number>>;

// Byte-identical to the pre-refactor scoreVideo() formula — engagement is
// deliberately absent so it contributes nothing until a caller opts in with
// real data. See ARCHITECTURE_DECISIONS.md for why weights aren't
// corpus-normalized.
export const DEFAULT_PROFILE: ScoringProfile = {
  views: 0.7,
  likes: 0.3,
};

export function computeScore(v: Video, ctx: ScoringContext = {}, profile: ScoringProfile = DEFAULT_PROFILE): number {
  let total = 0;
  for (const name of Object.keys(profile) as SignalName[]) {
    const weight = profile[name];
    if (!weight) continue;
    total += SIGNALS[name](v, ctx) * weight;
  }
  return total;
}

export type { ScoringContext, SignalName, SignalFn } from "./signals";
