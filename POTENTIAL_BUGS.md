# Potential Bugs — Next.js Migration (PR #24) + follow-up UI audit

Things that could not be checked by build/local-serve alone, plus the
results of a full click-through UI audit done afterward. Check items off as
you validate the remaining ones against the live site. Delete this file
once everything below is confirmed (or has its own tracked follow-up).

---

## Fixed during the post-deploy UI audit (2026-07-22)

- [x] **Browse page: Type and Member filter dropdowns didn't open at all** (reported live, reproduced, fixed — see PR #25). Root cause: the outside-click-to-close listener was attached directly to `document`, racing with React's own event delegation (Next.js hydrates onto `document` directly) — `stopPropagation()` inside the button's handler doesn't block a *separate* listener already registered on the same node, so the menu closed in the same tick it opened. Fixed with a ref-based containment check instead. Also fixed `z-100` on the dropdown menus (not a real Tailwind utility — z-index only has a fixed `0/10/20/30/40/50/auto` scale) → `z-[100]`.

## Confirmed working during the audit (previously untested)

- [x] Type dropdown checkbox menu — opens, checking a box stays open, filters apply, badge count updates
- [x] Member dropdown checkbox menu — same, plus confirmed mutual exclusion with the Type menu
- [x] Era `<select>` From/To range filter — confirmed via direct DOM event dispatch (native `<select>` elements aren't reliably clickable via coordinate-based automation); correct era-index range filtering confirmed (e.g. "Dark & Wild" onward → 2,232 videos)
- [x] Year `<select>` From/To range filter — same method, confirmed (2020–2021 → 451 videos)
- [x] Active-filter tag removal (`×` buttons) and "Clear all" — confirmed
- [x] Nav search box → `/browse?search=X` — confirmed (searched "Butter" → 52 results, correct tag shown)
- [x] All 8 applicable recommendation carousels on a real multi-pool test video (`bomb-847`, a Jungkook solo Bangtan Bomb): Up Next, More from [Era], More [Type], More with [member], Fan Favorites, Nearby Eras, Most Loved, Trending. (9th pool, "More '[Song]'", correctly didn't render since no other video shares that song text — expected, not a bug.)
- [x] Logged-out comment draft flow: typed a comment on `/player` while logged out, pressed Enter, confirmed redirect to `/profile` **and** confirmed via `localStorage` that `bts_pending_comment_draft` was saved with the correct `videoId`/`comment` — did not complete the loop by actually logging in (see below)
- [x] All 5 stub routes individually opened and screenshotted: `/bootcamp`, `/collection`, `/era` render the shared nav (empty content below, as intended); `/admin`, `/data` render with no nav at all, confirming the route-group split works
- [x] Real network access to YouTube thumbnails confirmed available in at least one test session (images loaded correctly on `/browse` and `/player`) — but see below, this wasn't consistent across every session and full iframe playback still isn't confirmed
- [x] Console swept for errors across the whole audit — none found

## Still not tested (unchanged or newly narrowed down)

- [ ] **The GitHub Actions deploy** ran once successfully for the initial migration (confirmed live). Not yet re-run for the dropdown-fix PR (#25) at time of writing — confirm that deploy succeeds too once merged.
- [ ] **`.nojekyll`** — added defensively, still not confirmed necessary either way.
- [ ] **Custom domain / CNAME survival** — confirmed once for the initial deploy (`btsbootcamp.com` resolved correctly afterward). Not re-checked since.
- [ ] **CDN propagation lag** for `bestofbootcamp` reads — behavior assumed unchanged, not re-verified live.
- [ ] **Signup form submission** (real Google Form write) — still not tested, would create a real pending signup in production.
- [ ] **Comment form submission** (real Google Form write) — still not tested, same reason.
- [ ] **Full login submit** (username/PIN against a real profile) — still not tested. Two separate attempts in the audit sandbox hit an unrelated browser-extension conflict; this remains the single most important untested path, since it's the one thing genuinely blocked rather than deliberately skipped.
- [ ] **Completing the draft-comment-then-login loop** — confirmed the draft saves and the redirect happens; did not follow through with an actual login to confirm the auto-post-and-redirect-back behavior.
- [ ] **Session persistence across a real reload** — still unconfirmed in practice.
- [ ] **Mobile/responsive layout** — attempted during the audit via the browser tool's window-resize function, but the screenshot tool kept capturing at the original desktop resolution regardless, so this genuinely could not be checked from this environment. Needs a real device or browser dev-tools check.
- [ ] **Real YouTube iframe playback** (autoplay, controls, not just the thumbnail loading) — still not visually confirmed.
- [ ] **GA4 analytics** — still not confirmed to reach the real dashboard.
- [ ] **Cross-browser** — only ever tested in one Chrome instance.
