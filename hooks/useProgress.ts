// Watch tracking, favorites, history (#8) — not yet implemented. Ported as
// a stub matching js/progress.js's current unimplemented state.
//
// NOTE: the original js/progress.js stub comment said "reads/writes
// progress.json," which contradicted CLAUDE.md's actual decision — progress
// is local-first, storing only to localStorage, never any repo file (see
// ARCHITECTURE_DECISIONS.md, "Personal data (progress tracking) is
// local-first"). This stub follows that decision, not the stale comment.
export function useProgress() {
  return null;
}
