# BTSBootcamp — Claude Context File

## What This Is
A fan-built, open-source BTS video hub. Think Netflix-browse meets TikTok-scroll. No backend, no database, no monthly costs beyond a domain. The full PRD is in `BTSBootcamp-Requirements.md`. For the reasoning behind major architecture calls (not just what they are, but why and what was rejected), see `ARCHITECTURE_DECISIONS.md` — check it before proposing a change to something that looks like a past decision.

## The Team
- **Architect:** diyamaxxing (the user) — handles architecture, data flow, system design decisions
- **AI pair:** Claude — implementation, scaffolding, debugging, documentation
- No UX designer in this repo yet — design decisions are deferred or owned by a separate team member

## Architecture Decisions (and why)

### GitHub as the database — now across two repos
Content data (videos, eras) lives as flat JSON in this repo. User-generated data (profiles, comments) lives in `bestofbootcamp`. Full rationale, including the design this superseded and why, in `ARCHITECTURE_DECISIONS.md`.

- `data/videos.json` — master content index, every BTS video (2,767 videos) — lives here, in this repo
- `data/eras.json` — 18 era definitions with start dates; source of truth for era assignment — lives here, in this repo
- No local `data/comments.json` or `data/users.json` in this repo — both are user-generated data and live in `bestofbootcamp`, not here (see below).
- **User profiles and comments both live in a separate repo, `bestofbootcamp`**, at `data/users.json` and `data/comments.json` there. `hooks/useAuth.tsx` fetches users via `https://raw.githubusercontent.com/diyamaxxing/bestofbootcamp/main/data/users.json`; `lib/comments.ts` fetches comments the same way from `data/comments.json` in that repo.
- **Progress tracking (watched, favorites, PIN) is local-first** — stored in `localStorage`, per-browser, never written to any repo at all. There is no `data/progress.json` write path; that file/approach was superseded.

**The write pipeline — Google Form intake, no credential in the browser at all:**
- A visitor's browser never holds any write-capable credential. `lib/googleForm.ts`'s `submitToGoogleForm()` (used by both `hooks/useAuth.tsx` and `lib/comments.ts`) does a real hidden-`<iframe>` `<form>` POST directly to a Google Form's own submission endpoint — no account, no token, nothing for anyone to extract from the page's source. (An earlier design embedded a fine-grained GitHub PAT client-side instead; it doesn't work — GitHub auto-revokes its own PAT-format tokens the moment they're detected in a public repo, confirmed twice. Full story in `ARCHITECTURE_DECISIONS.md` and issue #18.)
- Every Form response becomes a row in that form's linked Google Sheet. `bestofbootcamp/automation/signups/promote.js` and `automation/comments/promote.js` — each on its own `schedule`-triggered (every 5 min) + `workflow_dispatch`-enabled GitHub Actions workflow, `schedule` being the only trigger type that needs zero credential from an anonymous caller — read new rows via the Sheets API, using a Google service-account credential that lives *only* as the `GOOGLE_SERVICE_ACCOUNT_KEY` repo secret, never client-exposed.
- Both scripts validate each row (same rules the old pipeline had — username pattern, comment length, etc.) and write accepted entries straight into `bestofbootcamp`'s own `data/users.json`/`data/comments.json` on disk (already checked out — no cross-repo API calls needed), committing with the workflow's auto-provided `GITHUB_TOKEN`. Comment promotion cross-checks `username` against the same repo's `data/users.json` (now a plain local read) so a comment can't be promoted for a username with no real profile. Handled rows (accepted or rejected) get marked in a `Processed` column so nothing is retried forever.
- Writes are **not instant** — expect a few minutes (the 5-minute poll floor, plus whatever the run itself takes) for a new signup or comment to actually appear live. `lib/comments.ts`'s local-echo mechanism (`saveLocalComment`/`pendingLocalComments`) shows a person their own just-submitted comment immediately regardless of this delay — see `ARCHITECTURE_DECISIONS.md`.
- `burnthestage`/`campcomments` (the old staging repos) are unused now — the reason for splitting into separate repos was containing a client-embedded credential's blast radius, and there is no client-embedded credential anymore. Not deleted automatically; that's a separate decision.

Reads (videos/eras): fetch JSON via relative path, same repo.
Reads (users/comments): fetch JSON via GitHub raw content URL, `bestofbootcamp` repo.
Writes (users/comments): never direct — always through the Google Form → scheduled-promotion pipeline above.

### Framework migration: vanilla HTML/CSS/JS → Next.js (static export)
**Decided and executed 2026-07-21** — see `ARCHITECTURE_DECISIONS.md` for full reasoning (both the decision entry and the migration-execution entry). The "no framework" phase is over: the architecture and data flow were felt out first (as intended), and the site is now a TypeScript + Tailwind Next.js app (App Router), statically exported for GitHub Pages.

- Hosting stays GitHub Pages — Next.js runs in **static export** mode (`output: 'export'` + `trailingSlash: true` in `next.config.ts`), not full SSR: no server components with runtime fetch, no API routes, no ISR.
- **Reversed from the original decision-only entry:** `public/data/videos.json`/`eras.json` stay **runtime, client-side fetches** (`fetch("/data/videos.json")`), same as the old site — NOT baked in at build time. Every interactive page (browse filters, the player's recommendation pooling) needs the whole catalog in the browser regardless of framework, and a plain fetched static asset keeps the browser's ordinary HTTP caching across page views; embedding ~1MB of JSON into every route's server-rendered payload would trade that away for no real benefit. `bestofbootcamp`'s `data/users.json`/`data/comments.json` were always runtime fetches and still are, unchanged.
- `js/auth.js` → `hooks/useAuth.tsx` (a Context provider + hook — session is now reactive React state instead of a `window` global each page re-read); `js/comments.js` → `lib/comments.ts` (plain functions, no shared React state needed) + `components/Player/CommentSidebar.tsx`; `js/nav.js` → `components/Nav.tsx`; `js/analytics.js` → `next/script` in the `(site)` route group's layout. `scoreVideo()` collapsed from 3 copy-pasted inline versions into one `lib/scoreVideo.ts`. The recommendation river (previously already a well-factored `buildRecommendations()`/`pool()` pair in `pages/player.html`, not hand-duplicated markup as originally assumed) ported near-verbatim into `lib/recommendations.ts` + one `<Carousel>` component.
- `js/progress.js`, `js/player.js`, `js/api.js` were all one-line stub comments with no real implementation. `progress.js` → `hooks/useProgress.ts` (kept as a stub — issue #8's local-first shape is already decided, so the stub documents the intended interface). `player.js` was never actually used (the YouTube embed was always a plain inline `<iframe>`) — dropped, no replacement file. `api.js` → also dropped entirely, no `api.ts` equivalent: ES modules don't need a placeholder file to reserve a "slot" the way `<script src>` load order did, and `api.js` had no concrete future plan anyway (unlike `progress.js`).
- **Route groups, not a blanket layout:** `app/(site)/` wraps home/browse/player/profile/bootcamp/collection/era with `AuthProvider` + `<Nav>` + GA4. `app/admin/` and `app/data/` sit *outside* that group, getting only the bare root layout — no Nav, no auth, no analytics — matching the original `pages/admin.html`/`pages/data.html`, which were deliberately unlinked and script-free ("obscure by URL, not auth-gated").
- **Corrected while porting:** the player's recommendation river is **9 carousels**, not 10 — the old spec section/changelog said 10, but the code's own comment (and the actual `pool()` call sites) only ever built 9; the routes table already had this right. Also corrected: `mainmuster.html`'s `#stats-bar` was dead markup (its CSS even targeted the wrong selector, `#stats` vs `#stats-bar`) and there was no "era grid" in code, only the era-pill rail — both ported as the empty/absent things they actually were, not invented as new features.
- A **real deploy-blocking issue found during verification**: Next's default static export emits a route like `/player` as a sibling `player.html` file plus an *empty* `player/` directory (RSC-payload data only, no `index.html`). GitHub Pages' own extension-resolution behavior might paper over this, but no other static host does, and it's not worth depending on — `trailingSlash: true` makes every route export as `<route>/index.html` instead, the universally-supported shape. Caught by serving the exported `out/` locally with a plain static file server before assuming GitHub Pages would just work.
- CSS ported to Tailwind v4 (CSS-first config, no `tailwind.config.ts` needed) — the old files' hand-copied hex literals (no `:root`/CSS-variable layer existed before) became a real `@theme` token set in `app/globals.css`, and the `home.css`/`player.css` cross-file dependency on shared `.carousel`/`.rail`/`.card` classes resolved by both surfaces using the same `<Carousel>`/`<Card>` components.
- Old vanilla files (`index.html`, `mainmuster.html`, `css/`, `js/`, `pages/`) were deleted in the same change once the Next.js equivalents were verified — see Verification below.

### Hosting
- **Live**: GitHub Pages, deployed via **GitHub Actions** (not "deploy from branch" — see `.github/workflows/deploy.yml`, this repo's first-ever CI/CD). **Manual step still needed from the architect**: repo Settings → Pages → Source must be switched to "GitHub Actions" for this workflow to actually serve the site; not done automatically as part of the migration since it's a live-infra change to the deployed custom domain.
- **Domain**: `btsbootcamp.com` — purchased and DNS-configured (A records to GitHub Pages' IPs + `www` CNAME), HTTPS enforced. The `CNAME` file lives at `public/CNAME` now (so it lands in the static export's output root) — must keep landing in `out/CNAME` or the custom domain breaks on the first Actions-deployed release.
- No more `index.html`-redirects-to-`mainmuster.html` hack — `app/(site)/page.tsx` is natively served at `/`, so the old GitHub-Pages-always-serves-`index.html`-at-root workaround (and the "mainmuster.html stays at repo root" convention it required) is gone. `mainmuster.html` no longer exists.
- GitHub Actions also still runs the validate/promote pipeline in `bestofbootcamp` — unrelated repo, unrelated workflow, unaffected by this migration.
- YouTube embed API for video playback (still a plain inline `<iframe>`, same as before — no player library was ever actually used)
- `public/favicon.png` — linked via `metadata.icons` in `app/layout.tsx`
- Both repos (`btsbootcamp`, `bestofbootcamp`) are **public** — required for free Pages hosting (private repos need GitHub Pro) and unlimited free Actions minutes; doesn't weaken the write pipeline's safety since no credential is ever exposed in either repo's content in the first place

## File Structure

```
btsbootcamp/                   # this repo — Next.js app + content data (public)
├── app/
│   ├── layout.tsx              # bare root layout — no Nav/Auth/Analytics (see route groups below)
│   ├── globals.css             # Tailwind v4 import + @theme design tokens
│   ├── (site)/                 # route group: Nav + AuthProvider + GA4 wrap everything in here
│   │   ├── layout.tsx
│   │   ├── page.tsx             # home — "/"
│   │   ├── browse/page.tsx      # → components/Browse/BrowseClient.tsx
│   │   ├── player/page.tsx      # → components/Player/PlayerClient.tsx + CommentSidebar.tsx
│   │   ├── profile/page.tsx
│   │   ├── bootcamp/page.tsx    # stub (#6)
│   │   ├── collection/page.tsx  # stub (#3)
│   │   └── era/page.tsx         # stub (#4)
│   ├── admin/page.tsx           # stub (#10) — OUTSIDE (site): no Nav/auth/analytics, matches original
│   └── data/page.tsx            # stub (#9) — same
├── components/                 # Nav, Carousel, Card, Hero, EraRail, Browse/, Player/
├── hooks/                      # useAuth.tsx (Context+hook), useProgress.ts (stub)
├── lib/                        # types.ts, scoreVideo.ts, recommendations.ts, comments.ts, format.ts, googleForm.ts, github.ts
├── public/
│   ├── data/                    # videos.json/eras.json — moved here from data/, see below
│   ├── favicon.png
│   └── CNAME                    # custom domain — must land in the static export output root
├── data/raws/                   # source CSVs (6 playlists) — unchanged, still the tagging source of truth
├── scripts/
│   ├── fetch_playlists.py      # YouTube Data API v3 fetcher — needs YOUTUBE_API_KEY, see .env below
│   ├── build_videos_json.py    # CSV → public/data/videos.json, era auto-assignment + cross-tagging
│   ├── enrich_csvs.py          # backfill script (superseded by fetch_playlists)
│   ├── tag_members.py          # heuristic member tagger — writes into data/raws/*.csv (--apply to write)
│   └── word_frequency.py       # tokenizes titles, tallies word frequency per type — finds new CATEGORY_PATTERNS candidates
├── .env                          # YOUTUBE_API_KEY (gitignored, not committed)
├── .github/workflows/deploy.yml  # next build (static export) → GitHub Pages, this repo's first-ever CI
├── package.json / tsconfig.json / next.config.ts / postcss.config.mjs / eslint.config.mjs
├── CLAUDE.md                     # this file
├── ARCHITECTURE_DECISIONS.md     # running log of the "why" behind architecture calls
└── BTSBootcamp-Requirements.md

bestofbootcamp/               # sibling repo (public) — live, validated user-generated data + automation
├── data/users.json            # the REAL, live user profiles — not in this repo
├── data/comments.json         # the REAL, live comments — not in this repo
├── automation/
│   ├── lib/google-sheets.js   # shared Sheets-API auth (hand-rolled JWT, no npm deps)
│   ├── signups/promote.js     # reads the signup Sheet, validates, writes data/users.json
│   └── comments/promote.js    # reads the comment Sheet, validates, writes data/comments.json
└── .github/workflows/
    ├── promote-signups.yml    # schedule (*/5 min) + workflow_dispatch
    └── promote-comments.yml   # schedule (*/5 min) + workflow_dispatch
```

`burnthestage`/`campcomments` (the old staging repos) still exist but are unused as of 2026-07-21 — not part of the file structure above since nothing reads from or writes to them anymore.

**Important:** no more `mainmuster.html`/`pages/`/root-relative-path conventions — Next.js's own router handles all of that; every route is a clean path (`/browse`, `/player`, etc.) via `next/link`/`next/navigation`, not hand-written relative hrefs. There is no local `data/users.json`, `data/comments.json`, or `data/progress.json` in this repo — see the write-pipeline and local-first decisions above. `public/data/videos.json`/`eras.json` are still fetched client-side at runtime (`fetch("/data/videos.json")`), same pattern as before the migration, just relocated into `public/`.

## Video Schema (data/videos.json)
```json
{
  "id": "bomb-575",
  "title": "...",
  "upload_date": "2016-06-01",
  "air_date": "2016-06-01",
  "era": "HYYH: Young Forever",
  "type": "Bangtan Bomb",
  "series": "Bangtan Bombs",
  "episode": null,
  "url": "https://www.youtube.com/watch?v=...",
  "source": "youtube",
  "thumbnail": "https://img.youtube.com/vi/.../hqdefault.jpg",
  "members": ["RM", "Jin", "Suga", "J-Hope", "Jimin", "V", "Jungkook"],
  "tags": ["Dance Practice"],
  "song": "뱁새",
  "subtitles": null,
  "duration_sec": 277,
  "description": null,
  "status": "active",
  "view_count": 42588164,
  "like_count": 1504160
}
```

Key schema notes:
- `air_date` vs `upload_date`: Run BTS was bulk-uploaded 2022-12-24 from V Live — `air_date` is derived from year in episode title
- `status`: "active" | "private" — private videos are kept for archive completeness
- `tags`: cross-category array, **computed automatically** by `scripts/build_videos_json.py` (`CATEGORY_PATTERNS`) — every category is checked with equal weight against every video's title, no category is "primary." Patterns are derived from each category's own real title convention (e.g. Dance Practice requires the quoted-song-title prefix, not just the words "dance practice" anywhere, which is what correctly excludes casual bomb titles like "Attack on BTS at dance practice"). Six categories currently: `Dance Practice`, `MV` (the original two — currently produce exactly the 5 known Bangtan-Bomb-that-are-actually-Dance-Practice videos), plus four added when the "BTS On Air" playlist landed (see below) — `Fancam`, `Music Show`, `Talk Show`, `Live Performance` — derived by running `scripts/word_frequency.py` against the real on-air titles first, not guessed (468 videos cross-tagged total). These tag-only categories are filterable/carousel-able exactly like a `type`: the home page and `components/Browse/BrowseClient.tsx` both build their type list from `type` **and** `tags` combined, not `type` alone — see Browse Filters below. Re-running the build script regenerates all of this from the CSVs — none of it is hand-maintained. Full reasoning in `ARCHITECTURE_DECISIONS.md`.
- `song`: the quoted title substring extracted from `title` (e.g. "Butter", "뱁새") by `scripts/build_videos_json.py` (`SONG_PATTERN`). Links videos about the same release across every category/type/era — an MV, its dance practice, and a bomb about its jacket shoot all share the same `song` even though they're completely different `type`s. This is a **recommendation signal, not a category** — see the player's recommendation river below. Known limitation: a song name containing its own apostrophe can truncate the extraction early; accepted since a miss just means one fewer recommendation, not bad data.
- `members`: all 7 for group content; solo/unit content has the correct subset (1,072 videos retagged by `scripts/tag_members.py`). Patterns match each member's stage name, Korean name, and known aliases (Rap Monster/RAPMON for RM, Agust D for Suga) or initials (JM, JK) — verified against every real title in the corpus for false positives before landing. `V` is the one exception: matched as a literal `\bV\b` with an explicit exclusion for "V LIVE" (the old Naver streaming app, not the member) rather than the old indirect-context patterns. **`tag_members.py` writes into `data/raws/*.csv`, not `videos.json` directly** — `videos.json` is fully regenerated from the CSVs by `build_videos_json.py` on every run, so a version that wrote only to `videos.json` had its tagging silently wiped by the next rebuild (this happened once, see git history around the "BTS On Air" playlist addition). Any UI or recommendation logic that filters/recommends by member should also exclude videos where `members.length === 7` — a 7-member array means "untagged group default," not "confirmed content about all 7" — see the browse filter and player's "More with member" carousel for the pattern.
- `era`: auto-assigned from eras.json date ranges; Run BTS is ERA_EXEMPT
- `source`: `"youtube"` | `"okru"` — the embed platform. Added for the one-time ok.ru import (`data/raws/okru_qdeoks.csv`, 184 videos from a fan-curated ok.ru account: musters, official DVD releases, "In the Soop," guest appearances). `lib/format.ts`'s `embedSrc()`/`recThumbnail()` branch on this field so `components/Player/PlayerClient.tsx` builds the right `<iframe>` (`ok.ru/videoembed/{id}` vs `youtube.com/embed/{id}`) and thumbnail source per video. Defaults to `"youtube"` in `build_videos_json.py`'s `coerce_row()` when the CSV column is blank, so none of the original 6 CSVs needed touching. ok.ru content types (`Fan Meeting`, `DVD`, `Documentary`, `Concert`, `Guest Appearance`, `BTS+/CH+ Content`, `Drama`) are all in `ERA_EXEMPT_TYPES` — this content doesn't have a clean single air-date the way a YouTube upload does, same reasoning as `Run BTS`. Full story, including why ok.ru thumbnails are locally-hosted images (`public/thumbnails/okru/`) rather than hotlinked, in `ARCHITECTURE_DECISIONS.md`.

## Pages & Routing

| Route | Component | Notes |
|---|---|---|
| `/` | `app/(site)/page.tsx` | Home: era rail (links to `/browse`), hero, carousels per type/tag |
| `/browse` | `components/Browse/BrowseClient.tsx` | Era pills (filter in-place), type + member dropdowns, era/year range, URL state |
| `/player?id=X` | `components/Player/PlayerClient.tsx` | Player + 9-carousel rec river + comments |
| `/bootcamp` | `app/(site)/bootcamp/page.tsx` | Stub — guided new ARMY path (#6) |
| `/profile` | `app/(site)/profile/page.tsx` | Login + profile creation |
| `/admin` | `app/admin/page.tsx` | Stub — content editor (#10), outside the `(site)` group (no Nav) |
| `/data` | `app/data/page.tsx` | Stub — raw JSON viewer (#9), outside the `(site)` group (no Nav) |
| `/collection` | `app/(site)/collection/page.tsx` | Stub (#3) |
| `/era` | `app/(site)/era/page.tsx` | Stub (#4) |

## Recommendation System

### Scoring (Phase 1 — YouTube signals only)
`lib/scoreVideo.ts`:
```ts
export function scoreVideo(v: Video): number {
  const views = Math.log10((v.view_count || 0) + 1);
  const likes = Math.log10((v.like_count || 0) + 1);
  return views * 0.7 + likes * 0.3;
}
```
One shared function now — previously copy-pasted verbatim into 3 separate inline `<script>` blocks. Phase 2 (Issue #13): extend with user watch/like signals. Phase 2 ML pipeline (Issue #14): offline Python compute → `data/similar.json`.

### Player recommendation river — `lib/recommendations.ts`'s `buildRecommendations()` (9 carousels, deduplicated)
Corrected count during the migration: the old spec section/changelog said 10 ("added the song carousel"), but the actual `pool()` call sites only ever built 9 — the routes table already had this right, the prose didn't.
0. More '[Song]' — same `song` (release), any type or era — runs FIRST, ahead of Up Next, since sharing a release is a stronger relevance signal than sharing an era/type. Only shown when the current video has an extracted `song`.
1. Up Next — same era + same type (tags-aware)
2. More from [Era]
3. More [Type]
4. More with [member(s)] — only when the current video has < 7 members, and candidate videos are filtered to < 7 members too (excludes full-group content from a member-specific carousel)
5. Fan Favorites: [Type] — same type, sorted by likes
6. From Nearby Eras — era index ±1–2
7. Most Loved — all videos by likes
8. Trending — all videos by score

### Cross-tagging
Computed automatically, not hand-maintained — see the `tags` schema note above and `ARCHITECTURE_DECISIONS.md` for the full reasoning. The recommendation algo and browse filter check `tags` alongside `type` so cross-tagged videos compete in every pool they legitimately belong to.

## Browse Filters (components/Browse/BrowseClient.tsx)
All filter state lives in the URL (bookmarkable, shareable) via `next/navigation`'s `useSearchParams`/`router.replace`:
- `?types=Bangtan Bomb,MV` — multi-select, checks `v.type` and `v.tags`. The dropdown's option list (`ALL_TYPES`) is built from both fields too (`videos.flatMap(v => [v.type, ...(v.tags || [])])`), not `type` alone — otherwise a tag-only category like `Fancam` would match videos but have no checkbox to select it from. Same fix applied to the home page's type carousels.
- `?members=Jimin,V` — multi-select, checks `v.members.some(m => selected)` **and excludes videos where `v.members.length === 7`** — otherwise every full-group video (the untagged default) would flood results for every single-member search, defeating the point of a member-specific search. Same exclusion applied to the player's "More with member" carousel.
- `?eraFrom=HYYH&eraTo=Wings` — era range by index in eras.json
- `?yearFrom=2016&yearTo=2019` — year range from air_date

## Module Responsibilities (post-migration: hooks/ + lib/ + components/)
- `hooks/useAuth.tsx` — **wired up.** `AuthProvider` context + `useAuth()` hook. Fetches users from `bestofbootcamp`; `createUser()` submits new signups to a Google Form via `lib/googleForm.ts`'s `submitToGoogleForm()` — no credential of any kind involved; session is reactive React state backed by a `localStorage` username pointer (`bts_session_username`). `SIGNUP_FORM_URL`/`SIGNUP_FORM_FIELDS` hold the form's endpoint and entry IDs. See "GitHub as the database" above.
- `lib/comments.ts` — **wired up (V1: flat per-video comments, no intervals/replies/likes yet).** Plain functions, not a hook (no shared React state needed): fetches comments from `bestofbootcamp`; `createComment()` submits to a separate Google Form via the same `submitToGoogleForm()`; also holds the localStorage draft (`bts_pending_comment_draft`) that lets a logged-out visitor's comment survive the redirect to `/profile` and auto-post on login, and the local-echo mechanism (`saveLocalComment`/`pendingLocalComments`) that shows a person their own comment immediately regardless of promotion delay. Consumed by `components/Player/CommentSidebar.tsx`.
- `lib/googleForm.ts` — the shared hidden-iframe form-POST mechanism both of the above use, including the deliberate fixed-1500ms-timeout resolve (not the iframe's `load` event) — a confirmed-live race fix, preserved exactly, not simplified.
- No `api.ts` equivalent exists — the old `js/api.js` stub was dropped entirely during the migration; ES modules don't need a placeholder file to reserve a "slot" the way `<script src>` load order did, and it had no concrete future plan to preserve.
- `hooks/useProgress.ts` — stub only, matches the pre-migration state. Watch tracking, favorites, history (#8) — **local-first**, will read/write `localStorage` only, never a repo file, when built.
- `components/Nav.tsx` — shared nav bar (rendered by the `(site)` route group's layout, not on every page individually)

## Open GitHub Issues
| # | Title | Status |
|---|---|---|
| #3 | Collection page | Open |
| #4 | Era page | Open |
| #5 | Player improvements | Open |
| #6 | Bootcamp path | Open |
| #7 | User profiles | Open — pipeline rebuilt on the Google-Form intake (see #18) and verified live end-to-end |
| #8 | Progress tracking | Open — plan is local-first `localStorage`, not yet implemented |
| #9 | /data page | Open |
| #10 | /admin page | Open |
| #11 | api.js | Closed by the framework migration — the file was dropped entirely, not ported; see "Module Responsibilities" above |
| #12 | Stats refresh | Open |
| #13 | User recommendation signals | Open — needs rescoping now that progress is local-first, see `ARCHITECTURE_DECISIONS.md` |
| #14 | Offline ML recommendation pipeline | Open |
| #15 | Comments system | Open — V1 (plain per-video comments, profile-required posting) rebuilt on the Google-Form intake (see #18) and verified live end-to-end; interval-threading/replies/bubble-overlay/timeline/likes still to come |
| #16 | Harden and test the user-profile write pipeline | Open — the pipeline it targeted was replaced (see #18); rate limiting/spam handling still relevant, needs revisiting against the new mechanism |
| #18 | Write pipeline: client-embedded PATs get auto-revoked (blocks #7, #15) | Resolved and verified live end-to-end — Google Form intake + scheduled Actions promotion in `bestofbootcamp`; ready to close |

## Current State (as of 2026-07-21)

**Live:** https://btsbootcamp.com — GitHub Pages, custom domain verified, HTTPS enforced. First real deploy of the whole site happened 2026-07-21 (commit `50dc0be`). Both repos (`btsbootcamp`, `bestofbootcamp`) are public — `burnthestage`/`campcomments` still exist but are unused as of the Google-Form-intake rework (#18).

**Framework migration (Next.js/TypeScript/Tailwind) is code-complete but not yet actually deployed** — `npm run build` produces a working static export, verified by serving `out/` locally (home, browse filtering, player recommendations + comments fetch, profile forms all confirmed rendering and functioning correctly; see `ARCHITECTURE_DECISIONS.md` for the full verification writeup, including the `trailingSlash` fix this surfaced). **Still needed before it's live:** the repo's Settings → Pages → Source must be switched from "Deploy from a branch" to "GitHub Actions" — a manual step, not done as part of this change since it affects the real deployed custom domain.

**Signup and comments are live again** — the write pipeline was fully rebuilt on a Google-Form intake (see #18) after the previous one's client-embedded tokens got auto-revoked by GitHub, and verified end-to-end: real signup/comment through the actual UI → landed in the Google Sheet → promoted by the scheduled Actions workflow into `bestofbootcamp`'s data files → login/read-back confirmed working.

- [x] Repo initialized, folder structure scaffolded
- [x] All HTML page stubs, JS stubs, CSS stubs created
- [x] videos.json — 2,767 videos, full schema with view/like counts
- [x] eras.json — 18 eras with start dates
- [x] era auto-assignment in build_videos_json.py
- [x] Cross-tagging (`tags`) — now **computed automatically** from title text, equal-weighted, no primary category (superseded the old hand-maintained 5-video list; see schema notes above and `ARCHITECTURE_DECISIONS.md`). Six categories as of the "BTS On Air" playlist: `Dance Practice`, `MV`, `Fancam`, `Music Show`, `Talk Show`, `Live Performance`
- [x] Song/release linking (`song` field) — new, feeds a same-release recommendation carousel in the player
- [x] "BTS On Air" playlist (6th source playlist) — 1,178 videos (fancams, Korean broadcast music-show stages, talk-show appearances, live sets), the most heterogeneous source yet — its real title patterns (via the new `scripts/word_frequency.py`) are what drove the 4 new cross-tag categories above
- [x] Member tagging — 1,072 videos retagged from all-7 to solo/unit, patterns now include known aliases/initials; `tag_members.py` rewritten to persist into `data/raws/*.csv` instead of `videos.json` directly (previous version's tags were getting silently wiped by the next rebuild)
- [x] Favicon — `favicon.png`, linked from every page
- [x] mainmuster.html — stats bar, era carousel, hero, carousels, era grid
- [x] pages/index.html — browse/filter with type + member + era + year filters, URL state
- [x] pages/player.html — two-column layout, 10-carousel rec river (added the song carousel), comments wired up
- [x] User profiles (#7) — login + async create-profile UI, all code written and pushed; write mechanism just changed (see #18), not yet re-verified live
- [x] Hosting — GitHub Pages live at btsbootcamp.com
- [x] Comments V1 (#15) — plain per-video comments, profile-required posting, redirect-to-login with auto-post-on-login for logged-out drafts, local-echo mechanism for immediate self-visibility. All code written and pushed; write mechanism just changed (see #18), not yet re-verified live
- [x] Google-Form-intake write pipeline (#18) — root cause found and documented (GitHub auto-revokes client-embedded PATs in public repos), every alternative considered and closed out, new design implemented and **verified live end-to-end**: `js/auth.js`/`js/comments.js`'s `submitToGoogleForm()`, `bestofbootcamp/automation/{signups,comments}/promote.js` + their scheduled workflows, `automation/lib/google-sheets.js` for hand-rolled Sheets-API auth. Real signup and comment submitted through the actual UI, both landed in their Sheets, both promoted into `bestofbootcamp`'s data files by a manually-triggered workflow run, login against the promoted user confirmed working, and the reject-unknown-username comment path confirmed correctly rejecting without polluting live data or getting retried. Along the way, fixed a real bug in `submitToGoogleForm()` — resolving on the hidden iframe's "load" event was racing against the iframe's own initial blank-page load, silently dropping every submission; now uses a fixed delay instead.
- [x] Framework migration: vanilla HTML/CSS/JS → Next.js/TypeScript/Tailwind (static export) — every page and JS module ported, `npm run build` verified clean, old vanilla files deleted; **not yet live** — needs the repo's Pages source switched to "GitHub Actions" (manual step, see Hosting above)
- [x] Multi-source video embeds + one-time ok.ru catalog import — `source: "youtube" | "okru"` field added to the schema, `lib/format.ts`'s `embedSrc()`/`recThumbnail()` branch the player embed/thumbnail per video; 184 videos imported from a fan-curated ok.ru account (musters, official DVD releases, "Break the Silence," "In the Soop," guest appearances) into `data/raws/okru_qdeoks.csv`, flowing through the existing CSV pipeline unchanged. Verified live: an ok.ru video actually embeds and plays, member tagging picked up 7 real solo matches, browse type filtering shows both sources side by side. Full reasoning (why era-exempt, why locally-hosted per-series thumbnails instead of hotlinked, why no dedup against the YouTube catalog) in `ARCHITECTURE_DECISIONS.md`. Known gaps: 6 placeholder thumbnails still need real images from the architect, 3 guest-appearance playlists (`nyel`, `HopeOnTheStreet`, `AreYouSure?`) still need per-member tagging since their titles don't name a member.
- [ ] Bootcamp path (#6) — now unblocked: build on the Next.js base (`app/(site)/bootcamp/page.tsx` is a stub route ready for it), not on the old HTML stubs (which no longer exist)
- [ ] Progress tracking (#8) — plan is local-first via `localStorage`, not yet implemented
- [ ] /data page (#9)
- [ ] /admin page (#10)
- [ ] api.js (#11) — likely stays a stub; the write path it was meant for is now handled by the Google-Form/scheduled-promotion pipeline instead
- [ ] Comments V2 — 10-second-interval threading, nested replies, floating top-comment bubble overlay, full-timeline scrubbing, local per-browser likes (deferred scope from #15, see `ARCHITECTURE_DECISIONS.md`)
- [ ] Harden #18's pipeline (rate limiting, spam handling — carried over from #16's original scope, now against the new mechanism)
- [ ] Decide what to do with the now-unused `burnthestage`/`campcomments` repos (archive vs. delete vs. leave alone)
- [ ] Cross-tag patterns for Behind/Sketch/Episode categories — not built yet, same casual-vs-formal ambiguity that Dance Practice/MV had needs checking against real titles first, don't guess at a pattern

## Conventions
- Query params drive dynamic pages: `?types=`, `?members=`, `?eraFrom=`/`?eraTo=`, `?yearFrom=`/`?yearTo=`, `?search=`, `?id=` — via `next/navigation`'s `useSearchParams`/`router.replace`, not hand-rolled URL parsing
- Styling is Tailwind utility classes on components — no more standalone `css/*.css` files (design tokens live in `app/globals.css`'s `@theme` block)
- `scoreVideo()` lives in exactly one place (`lib/scoreVideo.ts`) — do not reintroduce per-page copies
- Members array: ["RM", "Jin", "Suga", "J-Hope", "Jimin", "V", "Jungkook"] — use this exact order (`MEMBERS` in `lib/types.ts`)
- TypeScript everywhere in `app/`/`components/`/`hooks/`/`lib/` — the video/era/comment/user schemas are typed in `lib/types.ts`, don't redefine ad hoc shapes

## What NOT To Do
- Do not introduce a backend or database — the flat JSON + GitHub API pattern is intentional (now across three repos, not a real backend service — see `ARCHITECTURE_DECISIONS.md`)
- The framework decision is made and executed (see "Framework migration" above) — do not re-litigate React/Next.js vs. Vue/Svelte/Astro, and do not propose moving hosting off GitHub Pages to unlock full SSR; both were explicitly considered and closed out (`ARCHITECTURE_DECISIONS.md`, 2026-07-21 entries)
- Do not re-propose a single client-embedded token with repo-wide GitHub access, or a serverless function, for the write path — both were considered and superseded; check `ARCHITECTURE_DECISIONS.md` before suggesting a different write mechanism
- Do not write progress tracking (#8) to a repo file — it's local-first via `localStorage` by design
- Do not add features beyond MVP scope without checking the PRD build plan table
- Do not move `public/data/videos.json`/`eras.json` back under `data/` — `public/` is the canonical location now so the static export can serve them directly, no copy step
- Do not switch the recommendation/content data (`public/data/videos.json`/`eras.json`) to a build-time read/import — this was considered during the migration and reversed in favor of keeping it a runtime `fetch()`, same as before; see "Framework migration" above
