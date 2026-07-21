# BTSBootcamp — Claude Context File

## What This Is
A fan-built, open-source BTS video hub. Think Netflix-browse meets TikTok-scroll. No backend, no database, no monthly costs beyond a domain. The full PRD is in `BTSBootcamp-Requirements.md`. For the reasoning behind major architecture calls (not just what they are, but why and what was rejected), see `ARCHITECTURE_DECISIONS.md` — check it before proposing a change to something that looks like a past decision.

## The Team
- **Architect:** diyamaxxing (the user) — handles architecture, data flow, system design decisions
- **AI pair:** Claude — implementation, scaffolding, debugging, documentation
- No UX designer in this repo yet — design decisions are deferred or owned by a separate team member

## Architecture Decisions (and why)

### GitHub as the database — now across three repos
Content data (videos, eras) lives as flat JSON in this repo. User-generated data (profiles, and later comments) lives in two *other* repos, split specifically to isolate write-credential blast radius. Full rationale in `ARCHITECTURE_DECISIONS.md`.

- `data/videos.json` — master content index, every BTS video (1,589 videos) — lives here, in this repo
- `data/eras.json` — 18 era definitions with start dates; source of truth for era assignment — lives here, in this repo
- `data/comments.json` — timestamp-based comments, nested by video + 10-second interval — currently an unused placeholder here; when comments (#15) are built, they'll likely follow the same staging→promotion pattern as user profiles, not write to this file directly
- **User profiles now live in a separate repo, `bestofbootcamp`**, at `data/users.json` there — NOT in this repo. This repo no longer has a local `data/users.json`; `js/auth.js` fetches it via `https://raw.githubusercontent.com/diyamaxxing/bestofbootcamp/main/data/users.json`.
- **Progress tracking (watched, favorites, PIN) is local-first** — stored in `localStorage`, per-browser, never written to any repo at all. There is no `data/progress.json` write path; that file/approach was superseded.

**The write pipeline (for anything that does need to be shared, like profiles):**
1. `burnthestage` — staging repo. The public-facing write goes here. `js/auth.js` embeds a GitHub fine-grained PAT scoped *only* to this repo (safe to expose — it can't touch this repo's code or `bestofbootcamp` directly) and creates one file per signup under `pending/`.
2. A GitHub Actions workflow living in `burnthestage` (`.github/workflows/validate-and-promote.yml` running `scripts/promote.js`) validates each pending submission (valid JSON, matches schema, username not taken) and, using a second credential (`BOB_TOKEN`, a repo secret scoped only to `bestofbootcamp`), promotes valid ones into `bestofbootcamp/data/users.json`. Rejected submissions are just deleted from staging.
3. Writes are **not instant** — expect roughly 30 seconds to a couple of minutes for a new signup to actually appear live. This is an accepted trade-off; see `ARCHITECTURE_DECISIONS.md`.

Reads (videos/eras): fetch JSON via relative path, same repo.
Reads (users): fetch JSON via GitHub raw content URL, `bestofbootcamp` repo.
Writes (users): never direct — always through the staging→validate→promote pipeline above.

### No framework (for now)
Stack is vanilla HTML/CSS/JS. This is intentional:
- Architect wants to feel the architecture and data flow before introducing a framework
- CSS and JS modules are organized to migrate cleanly to React/Next.js later
- `js/` files map 1:1 to future React hooks/utilities — keep them modular

### Hosting
- **Live**: GitHub Pages, serving from `btsbootcamp`'s `main` branch, root — not Vercel (see `ARCHITECTURE_DECISIONS.md` for why this changed)
- **Domain**: `btsbootcamp.com` — purchased and DNS-configured (A records to GitHub Pages' IPs + `www` CNAME), HTTPS enforced, verified live
- `index.html` at repo root is a redirect to `mainmuster.html` (GitHub Pages always serves `index.html` at the domain root; `mainmuster.html` stays the real home page per the existing convention)
- GitHub Actions runs the validate/promote pipeline — free, unlimited minutes since all repos are public
- YouTube embed API for video playback
- All three repos (`btsbootcamp`, `burnthestage`, `bestofbootcamp`) are **public** — required for both free Pages hosting (private repos need GitHub Pro) and unlimited free Actions minutes; doesn't weaken the write-isolation design since that's credential-scope-based, not visibility-based

## File Structure

```
btsbootcamp/                 # this repo — site code + content data (public)
├── data/                    # content data only — NOT user-generated data
│   ├── videos.json          # 1,589 videos, full schema
│   ├── eras.json             # 18 era definitions
│   └── comments.json         # placeholder — comments (#15) not yet built
├── data/raws/                # source CSVs (5 playlists)
├── css/
│   ├── main.css              # global reset, nav, dark base
│   ├── home.css               # stats bar, hero, carousels, cards, era grid, filters
│   ├── player.css             # player layout, comments sidebar
│   └── profile.css            # login/create-profile forms
├── js/
│   ├── auth.js               # wired up — see "GitHub as the database" above
│   └── ...                    # rest still stubs
├── scripts/
│   ├── fetch_playlists.py    # YouTube Data API v3 fetcher (all 5 playlists)
│   ├── build_videos_json.py  # CSV → videos.json with era auto-assignment
│   ├── enrich_csvs.py        # backfill script (superseded by fetch_playlists)
│   └── tag_members.py        # heuristic member tagger (--apply to write)
├── pages/
│   ├── index.html            # browse/filter page (URL-driven state)
│   ├── player.html            # video player + recommendations + comments shell
│   ├── profile.html            # login + create-profile (writes to burnthestage)
│   └── ...stubs
├── mainmuster.html            # ← home page IS AT ROOT, not in /pages/
├── CLAUDE.md                  # this file
├── ARCHITECTURE_DECISIONS.md  # running log of the "why" behind architecture calls
└── BTSBootcamp-Requirements.md

burnthestage/                 # sibling repo (public) — staging/write inbox
├── pending/                   # one file per pending signup, written by js/auth.js
└── .github/workflows/validate-and-promote.yml  # + scripts/promote.js

bestofbootcamp/               # sibling repo (public) — live user data
└── data/users.json            # the REAL, live user profiles — not in this repo
```

**Important:** `mainmuster.html` lives at the repo root. `pages/index.html` and `pages/player.html` are in `/pages/`. All paths in mainmuster.html use `css/`, `data/`, `pages/player.html` (no `../`). All paths in `/pages/` files use `../css/`, `../data/`, `../mainmuster.html`. There is no local `data/users.json` or `data/progress.json` in this repo anymore — see the write-pipeline and local-first decisions above.

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
- `tags`: cross-category array, **computed automatically** by `scripts/build_videos_json.py` (`CATEGORY_PATTERNS`) — every category is checked with equal weight against every video's title, no category is "primary." Patterns are derived from each category's own real title convention (e.g. Dance Practice requires the quoted-song-title prefix, not just the words "dance practice" anywhere, which is what correctly excludes casual bomb titles like "Attack on BTS at dance practice"). Currently produces exactly the 5 known Bangtan-Bomb-that-are-actually-Dance-Practice videos. Re-running the build script regenerates this from the CSVs — it is no longer a hand-maintained list. Full reasoning in `ARCHITECTURE_DECISIONS.md`.
- `song`: the quoted title substring extracted from `title` (e.g. "Butter", "뱁새") by `scripts/build_videos_json.py` (`SONG_PATTERN`). Links videos about the same release across every category/type/era — an MV, its dance practice, and a bomb about its jacket shoot all share the same `song` even though they're completely different `type`s. This is a **recommendation signal, not a category** — see the player's recommendation river below. Known limitation: a song name containing its own apostrophe can truncate the extraction early; accepted since a miss just means one fewer recommendation, not bad data.
- `members`: all 7 for group content; solo/unit content has correct subset (553 videos retagged by `scripts/tag_members.py`)
- `era`: auto-assigned from eras.json date ranges; Run BTS is ERA_EXEMPT

## Pages & Routing

| File | URL | Notes |
|---|---|---|
| `mainmuster.html` | `/mainmuster.html` | Home: stats bar, era carousel (nav links), hero, carousels, era grid |
| `pages/index.html` | `/pages/index.html` | Browse/filter: era pills (filter in-place), type + member dropdowns, era/year range, URL state |
| `pages/player.html` | `/pages/player.html?id=X` | Player + 9-carousel rec river + comments shell |
| `pages/bootcamp.html` | `/pages/bootcamp.html` | Stub — guided new ARMY path |
| `pages/profile.html` | `/pages/profile.html` | Stub — login + profile creation |
| `pages/admin.html` | `/pages/admin.html` | Stub — content editor |
| `pages/data.html` | `/pages/data.html` | Stub — raw JSON viewer |
| `pages/collection.html` | `/pages/collection.html` | Stub |
| `pages/era.html` | `/pages/era.html` | Stub |

## Recommendation System

### Scoring (Phase 1 — YouTube signals only)
```js
function scoreVideo(v) {
  return Math.log10((v.view_count || 0) + 1) * 0.7 +
         Math.log10((v.like_count || 0) + 1) * 0.3;
}
```
Phase 2 (Issue #13): extend with user watch/like signals.
Phase 2 ML pipeline (Issue #14): offline Python compute → `data/similar.json`.

### Player recommendation river (10 carousels, deduplicated)
0. More '[Song]' — same `song` (release), any type or era — runs FIRST, ahead of Up Next, since sharing a release is a stronger relevance signal than sharing an era/type. Only shown when the current video has an extracted `song`.
1. Up Next — same era + same type (tags-aware)
2. More from [Era]
3. More [Type]
4. More with [member(s)] — only when video has < 7 members
5. Fan Favorites: [Type] — same type, sorted by likes
6. (renumbered) Fan Favorites sorted by likes
7. From Nearby Eras — era index ±1–2
8. Most Loved — all videos by likes
9. Trending — all videos by score

### Cross-tagging
Computed automatically, not hand-maintained — see the `tags` schema note above and `ARCHITECTURE_DECISIONS.md` for the full reasoning. The recommendation algo and browse filter check `tags` alongside `type` so cross-tagged videos compete in every pool they legitimately belong to.

## Browse Filters (pages/index.html)
All filter state lives in the URL (bookmarkable, shareable):
- `?types=Bangtan Bomb,MV` — multi-select, checks `v.type` and `v.tags`
- `?members=Jimin,V` — multi-select, checks `v.members.some(m => selected)`
- `?eraFrom=HYYH&eraTo=Wings` — era range by index in eras.json
- `?yearFrom=2016&yearTo=2019` — year range from air_date

## JS Module Responsibilities
- `auth.js` — **wired up.** Fetches users from `bestofbootcamp`; writes new signups to `burnthestage/pending/`; session is just a username pointer in `localStorage`. See "GitHub as the database" above.
- `api.js` — no longer needed for the write path (superseded by the staging→promote pipeline); leave as a stub unless a future feature needs direct GitHub API reads/writes of its own
- `player.js` — YouTube embed API, autoplay logic, queue management
- `progress.js` — watch tracking, favorites, history — **local-first**, reads/writes `localStorage` only, never a repo file
- `nav.js` — shared nav behavior across all pages

## Open GitHub Issues
| # | Title | Status |
|---|---|---|
| #3 | Collection page | Open |
| #4 | Era page | Open |
| #5 | Player improvements | Open |
| #6 | Bootcamp path | Open |
| #7 | User profiles | Open — pipeline built, needs end-to-end test (see #16) |
| #8 | Progress tracking | Open — plan is local-first `localStorage`, not yet implemented |
| #9 | /data page | Open |
| #10 | /admin page | Open |
| #11 | api.js | Open — likely stays a stub, superseded by the staging/promotion pipeline |
| #12 | Stats refresh | Open |
| #13 | User recommendation signals | Open — needs rescoping now that progress is local-first, see `ARCHITECTURE_DECISIONS.md` |
| #14 | Offline ML recommendation pipeline | Open |
| #15 | Comments system | Open — likely reuses the staging/promotion pattern from #7 |
| #16 | Harden and test the user-profile write pipeline | Open — the concrete next step, see body for the checklist |

## Current State (as of 2026-07-21)

**Live:** https://btsbootcamp.com — GitHub Pages, custom domain verified, HTTPS enforced. First real deploy of the whole site happened this session (commit `50dc0be`). All three repos (`btsbootcamp`, `burnthestage`, `bestofbootcamp`) are public.

- [x] Repo initialized, folder structure scaffolded
- [x] All HTML page stubs, JS stubs, CSS stubs created
- [x] videos.json — 1,589 videos, full schema with view/like counts
- [x] eras.json — 18 eras with start dates
- [x] era auto-assignment in build_videos_json.py
- [x] Cross-tagging (`tags`) — now **computed automatically** from title text, equal-weighted, no primary category (superseded the old hand-maintained 5-video list; see schema notes above and `ARCHITECTURE_DECISIONS.md`)
- [x] Song/release linking (`song` field) — new, feeds a same-release recommendation carousel in the player
- [x] Member tagging — 553 videos retagged from all-7 to solo/unit
- [x] mainmuster.html — stats bar, era carousel, hero, carousels, era grid
- [x] pages/index.html — browse/filter with type + member + era + year filters, URL state
- [x] pages/player.html — two-column layout, 10-carousel rec river (added the song carousel), comments shell
- [x] User profiles (#7) — login + async create-profile via the staging/promotion pipeline, all code written and pushed
- [x] Hosting — GitHub Pages live at btsbootcamp.com
- [ ] **Not yet done: paste the `burnthestage`-scoped PAT into `js/auth.js`'s `STAGING_TOKEN` placeholder, then run a real signup end-to-end** — nothing in the write pipeline has been exercised with real traffic yet, only validated via scripts. This is the single most important next step — see issue #16 for the full checklist.
- [ ] Bootcamp path (#6)
- [ ] Progress tracking (#8) — plan is local-first via `localStorage`, not yet implemented
- [ ] /data page (#9)
- [ ] /admin page (#10)
- [ ] api.js (#11) — likely stays a stub; the write path it was meant for is now handled by the staging/promotion pipeline instead
- [ ] Comments system (#15) — likely follows the same staging→promote pattern as profiles when built
- [ ] Cross-tag patterns for Behind/Sketch/Episode categories — not built yet, same casual-vs-formal ambiguity that Dance Practice/MV had needs checking against real titles first, don't guess at a pattern

## Conventions
- Query params drive dynamic pages: `?type=`, `?era=`, `?id=`, `?members=`
- No inline styles — all CSS lives in `css/`
- No inline scripts — all JS lives in `js/` (pages have inline scripts until js/ modules are wired)
- `scoreVideo()` is defined in every page that needs it — keep them in sync until extracted to js/
- Members array: ["RM", "Jin", "Suga", "J-Hope", "Jimin", "V", "Jungkook"] — use this exact order

## What NOT To Do
- Do not introduce a backend or database — the flat JSON + GitHub API pattern is intentional (now across three repos, not a real backend service — see `ARCHITECTURE_DECISIONS.md`)
- Do not suggest a JS framework until the architect decides to migrate
- Do not buy the domain until something is deployed to GitHub Pages
- Do not re-propose a single client-embedded token with repo-wide GitHub access, or a serverless function, for the write path — both were considered and superseded; check `ARCHITECTURE_DECISIONS.md` before suggesting a different write mechanism
- Do not write progress tracking (#8) to a repo file — it's local-first via `localStorage` by design
- Do not add features beyond MVP scope without checking the PRD build plan table
- Do not move mainmuster.html into /pages/ — it lives at the repo root intentionally
