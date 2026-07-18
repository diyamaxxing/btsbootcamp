# BTSBootcamp — Claude Context File

## What This Is
A fan-built, open-source BTS video hub. Think Netflix-browse meets TikTok-scroll. No backend, no database, no monthly costs beyond a domain. The full PRD is in `BTSBootcamp-Requirements.md`.

## The Team
- **Architect:** diyamaxxing (the user) — handles architecture, data flow, system design decisions
- **AI pair:** Claude — implementation, scaffolding, debugging, documentation
- No UX designer in this repo yet — design decisions are deferred or owned by a separate team member

## Architecture Decisions (and why)

### GitHub as the database
All data lives as flat JSON files in this repo. No managed database, no backend service.
- `data/videos.json` — master content index, every BTS video
- `data/users.json` — user profiles (username + optional PIN)
- `data/progress.json` — per-user watch progress, favorites, history
- `data/comments.json` — timestamp-based comments, nested by video + 10-second interval

Reads: fetch JSON via GitHub raw content URL.
Writes: GitHub API (append/update the relevant JSON file).
Vercel auto-deploys on every repo push — no manual deploys needed.

### No framework (for now)
Stack is vanilla HTML/CSS/JS. This is intentional:
- Architect wants to feel the architecture and data flow before introducing a framework
- CSS and JS modules are organized to migrate cleanly to React/Next.js later
- `js/` files map 1:1 to future React hooks/utilities — keep them modular

### Hosting
- GitHub repo → Vercel (free tier, auto-deploy on push)
- YouTube embed API for video playback
- Domain: TBD (not purchased yet — waiting until first Vercel deploy)

## File Structure

```
btsbootcamp/
├── data/                 # the "database" — flat JSON files
├── css/                  # one file per page/section
├── js/                   # one file per concern (api, player, auth, progress, nav)
├── pages/                # all pages except home
├── index.html            # home page
├── CLAUDE.md             # this file
└── BTSBootcamp-Requirements.md
```

## JS Module Responsibilities
- `api.js` — all GitHub API reads and writes. Touch this last — nothing to write until users exist.
- `player.js` — YouTube embed API, autoplay logic, queue management
- `auth.js` — profile login/creation, PIN verification against users.json
- `progress.js` — watch tracking, favorites, history — reads/writes progress.json
- `nav.js` — shared nav behavior across all pages

## Pages
| File | Route | Notes |
|---|---|---|
| `index.html` | `/` | Home: hero + carousels |
| `pages/collection.html` | `/pages/collection.html?type=run-bts` | Reused per content type via query param |
| `pages/era.html` | `/pages/era.html?era=hyyh` | Reused per era via query param |
| `pages/player.html` | `/pages/player.html?id=video-id` | YouTube embed, up-next |
| `pages/bootcamp.html` | `/pages/bootcamp.html` | Guided new ARMY path |
| `pages/profile.html` | `/pages/profile.html` | Login + profile creation |
| `pages/data.html` | `/pages/data.html` | Hidden — raw JSON viewer, intentionally unstyled |
| `pages/admin.html` | `/pages/admin.html` | Hidden — content editor, not auth-gated |

## Current State
- [x] Repo initialized
- [x] Folder structure scaffolded
- [x] All HTML page stubs created with correct script/style imports
- [x] All JS and CSS stubs created
- [x] All 4 data files initialized as empty arrays
- [x] CLAUDE.md created
- [ ] videos.json schema + seed data
- [ ] Home page carousels
- [ ] Collection + era pages
- [ ] Player page
- [ ] Bootcamp path
- [ ] User profiles
- [ ] Progress tracking
- [ ] /data page
- [ ] /admin page
- [ ] api.js (deferred — not needed until users exist)

## Conventions
- Query params drive dynamic pages: `?type=`, `?era=`, `?id=` — JS reads them on load and fetches from JSON
- No inline styles — all CSS lives in `css/`
- No inline scripts — all JS lives in `js/`
- CSS custom properties for the color system (dark, purples, whites) — defined in `main.css`

## What NOT To Do
- Do not introduce a backend or database — the flat JSON + GitHub API pattern is intentional
- Do not suggest a JS framework until the architect decides to migrate
- Do not buy the domain until something is deployed to Vercel
- Do not wire up `api.js` (write operations) until the read/render layer is working
- Do not add auth complexity — login is just username lookup in users.json, PIN is optional
- Do not add features beyond MVP scope without checking the PRD build plan table
