# Potential Bugs — Next.js Migration (PR #24)

Things the local verification pass (build + serving `out/` locally + browser
click-through) **could not actually check**, because they only exist or only
fail in the real production environment: the real GitHub Actions → Pages
deploy, the real custom domain, real network access to YouTube/GA4, and the
real `bestofbootcamp` write pipeline. Local testing confirmed the app
*renders and fetches correctly* — it could not confirm any of the below.

Check items off as you validate them against the live site. Delete this file
once everything below is confirmed (or has its own tracked follow-up).

---

## Deploy / hosting

- [ ] **The GitHub Actions deploy has never actually run.** `.github/workflows/deploy.yml` was written and reviewed but not exercised — only `npm run build` locally. First real run will only happen after Settings → Pages → Source is switched to "GitHub Actions." Watch the first Actions run for failures unrelated to the app code itself (permissions, Node version mismatches, etc.).
- [ ] **`.nojekyll` was added defensively** (`public/.nojekyll`, empty file, confirmed it lands in `out/`) to stop GitHub's Jekyll processor from ignoring the `_next/` directory (Jekyll ignores any underscore-prefixed path by default, which would silently break every JS/CSS asset). Actions-sourced Pages deploys likely skip Jekyll processing entirely regardless (unlike the older "deploy from branch" method), so this may not be strictly necessary — but costs nothing to keep. If the site loads with broken styling/no interactivity after the first deploy, this is the first thing to double check.
- [ ] **Custom domain survival through the Actions pipeline.** `public/CNAME` (`btsbootcamp.com`) is confirmed present in `out/CNAME` locally. Never confirmed it survives `actions/upload-pages-artifact` → `actions/deploy-pages` and that the custom domain still resolves after the first Actions-based deploy (vs. the old branch-based deploy that was serving it before).
- [ ] **`next.config.ts` has no `basePath`/`assetPrefix` set** — correct only if the live site continues to serve from the domain root (`btsbootcamp.com/`), which it should given the CNAME. If Pages ever serves from a project subpath instead (e.g. `username.github.io/btsbootcamp`), every asset path breaks. Confirm the live URL structure matches before/after this deploy.
- [ ] **CDN propagation lag** for `bestofbootcamp` reads (`raw.githubusercontent.com` caches per-edge up to 5 min) is a known, already-accepted behavior from before this migration — but never re-confirmed against the *new* fetch call sites (`hooks/useAuth.tsx`, `lib/comments.ts`) specifically. Should behave identically (same URLs, same fetch pattern) but wasn't re-verified live.

## Write paths (deliberately untested — would pollute real production data)

- [ ] **Signup form submission** (`createUser()` in `hooks/useAuth.tsx` → Google Form → `bestofbootcamp`'s scheduled promotion). The Google Form URL/entry IDs were carried over verbatim from the old `js/auth.js`, unchanged — low risk, but the calling code was fully rewritten, so a real test signup (with a disposable test username) is worth doing once, then confirming it promotes and the login step below works.
- [ ] **Comment submission** (`createComment()` in `lib/comments.ts` → Google Form → `bestofbootcamp`'s scheduled promotion) — same caveat as signups.
- [ ] **Full login submit** — validated the login form *renders*, but never actually submitted it. A second attempt hit a browser-extension conflict in the verification sandbox unrelated to the app, so this is genuinely unverified, not just "skipped on purpose" like the two above. Test with a real existing username/PIN.
- [ ] **Logged-out comment draft flow**: type a comment on `/player` while logged out → Enter → redirected to `/profile` with the draft saved (`bts_pending_comment_draft`) → log in → draft auto-posts and redirects back to the video. Ported faithfully from the original logic (`consumeDraftComment()`, the redirect-back in `app/(site)/profile/page.tsx`) but never clicked through end-to-end.
- [ ] **Session persistence across a real reload** — `hooks/useAuth.tsx`'s `AuthProvider` reads `localStorage` in a `useEffect` on mount (necessary to avoid a hydration mismatch). Never confirmed that a logged-in session actually survives a hard page reload/new tab in practice, only that the code path exists.

## UI surfaces spot-checked but not exhaustively covered

- [ ] Only the era-pill filter and one video's recommendation river were click-tested. **Not tested**: the Type dropdown checkbox menu, the Member dropdown checkbox menu, the Era/Year range `<select>` pairs, individual active-filter-tag removal buttons, and "Clear all."
- [ ] Only one recommendation carousel ("More '[Song]'") was confirmed rendering for the one test video used. The other 8 pools (Up Next, More from [Era], More [Type], More with [member], Fan Favorites, Nearby Eras, Most Loved, Trending) exist in `lib/recommendations.ts` and were verified by code review, not by finding a video that actually populates all of them at once.
- [ ] **Search** (nav search box → `/browse?search=X`) — never clicked through.
- [ ] **Mobile/responsive layout** — the player's two-column-to-one-column breakpoint and the comments sidebar's mobile `max-height` were ported via Tailwind `md:` classes but never checked at a narrow viewport.
- [ ] **Real YouTube iframe playback** — the verification sandbox has no external network access to `youtube.com`/`img.youtube.com`, so the player's actual embed (autoplay, controls) and every card's real thumbnail image were never visually confirmed, only structurally (correct `src` URLs, correct DOM).
- [ ] **GA4 analytics** — `next/script` tags are wired up with the same Measurement ID as before, but never confirmed a real pageview/event actually reaches the GA4 dashboard from the new code.
- [ ] Stub routes `/bootcamp`, `/collection`, `/era` were confirmed to return `200` and to render the shared nav (by code review), but weren't individually opened and screenshotted.
- [ ] Only tested in one Chrome instance — no cross-browser check.
