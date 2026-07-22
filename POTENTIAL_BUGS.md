# Potential Bugs — Next.js Migration (PR #24) + follow-up UI audit

Things that could not be checked by build/local-serve alone, plus the
results of a full click-through UI audit done afterward. Check items off as
you validate the remaining ones against the live site. Delete this file
once everything below is confirmed (or has its own tracked follow-up).

---

## 🔴 ACTIVE PRODUCTION BUG (found 2026-07-22, tested live with permission) — real signups are silently failing

**Not a migration regression** — this is a mismatch between the Google Form's own configuration and the site's UI copy, and would affect the old vanilla site identically. Found while testing signup/login live against production.

**What's broken:** the signup Google Form (`entry.1811748859` etc.) has `pin`, `favoriteMember`, and `armyType` all marked **required** on Google's side. The site's "Create a profile" form labels PIN as "(optional)" and Favorite member as "—" (blank-selectable), and `createUser()` sends empty strings for whichever of these the visitor leaves blank. Google's server rejects that submission outright (`400`, `data-validation-failed="true"`) — confirmed via direct `curl` against the live form endpoint, isolating the exact cause by varying which fields were populated.

**Why nobody notices:** the client can't read Google's response (cross-origin, no CORS headers — this pipeline has never been able to get a real success/failure signal from the POST, by design, see `ARCHITECTURE_DECISIONS.md`). So the UI shows "Request submitted" regardless of whether Google accepted or rejected it. A real visitor who leaves PIN or Favorite Member blank sees a confident success message and their signup simply never exists — no error, no retry prompt, nothing.

**Confirmed via direct testing:**
- 3 real attempts through the actual production UI/form, all leaving Favorite Member blank → all silently rejected by Google (never appeared as a row the promote workflow could find, confirmed by manually triggering `promote-signups.yml` repeatedly — "No unprocessed rows" every time)
- A `curl` POST with only `username` filled → `400`
- A `curl` POST with `username` + `pin` filled, `favoriteMember` blank → `400`
- A `curl` POST with **all four fields non-empty** → `200`, and the subsequent `promote-signups.yml` run picked it up and promoted it ("Promoted 1 user(s)."); login then worked correctly end-to-end (session set, profile card rendered, survived a hard reload)

**Fix options (architect's call, not made here):**
1. In the Google Form itself, mark `pin`, `favoriteMember`, `armyType` as **not required** — matches the site's actual intent, one settings change in the Form editor, no code change.
2. Or change the site's create-profile form to require all fields — worse UX, contradicts the "(optional)" labels already shown.
3. Or have `createUser()` send a placeholder non-empty value (e.g. `"none"`) for blank optional fields — a workaround, adds a data-cleaning burden on the read side (`favoriteMember === "none"` would need treating as unset everywhere it's displayed).

Option 1 is almost certainly the right fix and takes less time than reading this paragraph.

**Test artifacts left in production, pending your call on cleanup:**
- `bestofbootcamp/data/users.json` now has a real test user, `claudetest_allfields` (PIN `1234`, bias RM, New ARMY) — created to prove the pipeline works when all fields are filled, then used to confirm login. Let me know if you want it removed.
- The comment-form test (`bomb-847`, username `claudetest`) was correctly **rejected** by promotion (username doesn't match a real profile) — nothing landed in `comments.json`, no cleanup needed there.

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

## Confirmed working live in production (2026-07-22, tested with explicit permission)

- [x] **Signup form submission** — confirmed working end-to-end, but only once all 4 fields are non-empty (see the active bug above). Real submission → real Google Sheet row → `promote-signups.yml` (manually triggered; the `*/5 min` schedule itself had a ~2 hour real-world gap between scheduled runs, so don't rely on the cron cadence being anywhere near 5 minutes in practice) → promoted into `bestofbootcamp/data/users.json`.
- [x] **Full login submit** — confirmed working against the real promoted user (`claudetest_allfields`): correct profile card, correct nav username, `Log out` present.
- [x] **Session persistence across a real reload** — confirmed: logged in, hard-navigated to `/profile` again, session held.
- [x] **Comment form submission** — confirmed reaching Google successfully (`200`) via direct testing; correctly **rejected** at promotion time since the test used a non-registered username, proving the username cross-check in `promote-comments.js` still works.

## Still not tested

- [ ] **The GitHub Actions deploy for PR #25** (the dropdown fix) — confirmed successful separately from this session's other checks.
- [ ] **`.nojekyll`** — added defensively, still not confirmed necessary either way.
- [ ] **CDN propagation lag** for `bestofbootcamp` reads — behavior assumed unchanged, not re-verified live.
- [ ] **Completing the draft-comment-then-login loop** — confirmed the draft saves and the redirect happens (previous audit pass); did not separately re-confirm the auto-post-and-redirect-back behavior after logging in, since the login test used a fresh session without a pending draft.
- [ ] **Mobile/responsive layout** — attempted during the audit via the browser tool's window-resize function, but the screenshot tool kept capturing at the original desktop resolution regardless, so this genuinely could not be checked from this environment. Needs a real device or browser dev-tools check.
- [ ] **Real YouTube iframe playback** (autoplay, controls, not just the thumbnail loading) — still not visually confirmed.
- [ ] **GA4 analytics** — still not confirmed to reach the real dashboard.
- [ ] **Cross-browser** — only ever tested in one Chrome instance.
