# BTS BOOTCAMP
### btsbootcamp.com · Product Requirements Document · v1.0 · May 2026

> *A fan-built, open source web app that gives BTS content the home it deserves.*

---

## Table of Contents
1. [Vision](#1-vision)
2. [Users](#2-users)
3. [Design Language](#3-design-language)
4. [Architecture](#4-architecture)
5. [Content Index](#5-content-index)
6. [Browsing & Navigation](#6-browsing--navigation)
7. [Player & Autoplay](#7-player--autoplay)
8. [BTS Bootcamp](#8-bts-bootcamp)
9. [User Profiles & Accounts](#9-user-profiles--accounts)
10. [Progress Tracking](#10-progress-tracking)
11. [Timestamp Chat](#11-timestamp-chat)
12. [User Dashboard (V2)](#12-user-dashboard-v2)
13. [Admin Page](#13-admin-page)
14. [Build Plan](#14-build-plan)
15. [Open Questions](#15-open-questions)

---

## 1. Vision

BTSBootcamp is a fan-built, open source web app that finally gives BTS content the home it deserves. New ARMYs face thousands of videos with no on-ramp, and veteran ARMYs have no organized way to revisit everything — the content exists but the experience does not.

The product is a sleek, Netflix-browse meets TikTok-scroll video hub built entirely on flat JSON files living in a GitHub repository. No database, no monthly costs, no admin burden — just a domain and a free Vercel deployment.

**The UI is the entire product.** The raw data is visible to anyone who looks, but nobody is looking at the guts when the front end feels like a premium streaming app.

| | |
|---|---|
| **Product name** | BTSBootcamp |
| **Domain** | btsbootcamp.com (or .app / .fan) |
| **Target users** | New ARMYs (Bootcamp), Veteran ARMYs (organized browsing) |
| **Running cost** | ~$12/year (domain only) |
| **Tech stack** | GitHub repo + Vercel (free hosting) |
| **Data storage** | Flat JSON files in the repo (videos.json, users.json, comments.json) |
| **Open source** | Yes — community-maintainable, no gated data |

---

## 2. Users

### New ARMYs (Bootcamp audience)
- Overwhelmed by the scale of BTS content — need a guided, manageable entry point
- Want context: why does this video matter, what order should I watch things
- Goal: go from zero to informed fan without burning out

### Veteran ARMYs (Browse audience)
- Already know BTS but want to revisit content in an organized way
- Want to track what they have and haven't seen across thousands of videos
- Goal: finally watch all of Run BTS in order, complete an era, find that one Bangtan Bomb

---

## 3. Design Language

**The UI is the primary differentiator.** There are already fan wikis and spreadsheets. What makes BTSBootcamp different is that it actually feels good to use.

### Visual Aesthetic
- Dark, cinematic — deep blacks, purples, and whites
- BTS-adjacent color palette without feeling like bootleg merch
- Typography: clean, modern sans-serif — nothing decorative or wiki-ish
- Every screen should feel intentional and considered

### Interaction Model
- **Browse:** Netflix — hero banner, horizontal carousels, collection/era pages, "Continue Watching" rail
- **Discover:** TikTok-style vertical scroll within a category or collection
- **Watch:** Netflix-style embedded player — clean, focused, minimal chrome
- **Transitions:** smooth and satisfying — nothing jarring or instantaneous
- **Mobile:** fully responsive, touch-optimized, swipe-friendly — not a desktop-first afterthought

### The One Exception
- The `/data` page is intentionally raw and ugly — it renders the JSON files directly
- This is a feature: the contrast reinforces that the UI is the transformation layer

---

## 4. Architecture

### Core Principle
The website files ARE the database. There is no separate data service, no managed database, no third-party storage. Everything lives as JSON files inside the GitHub repository.

| File | Contents |
|---|---|
| `videos.json` | Master content index — every BTS video ever |
| `users.json` | All user profiles — username, PIN, preferences |
| `progress.json` | All user watch progress, favorites, history |
| `comments.json` | All timestamp comments, nested by video + interval |

### How Reads & Writes Work
- The app fetches JSON files from the GitHub repo via GitHub's raw content API
- Writes (new comment, new profile, progress update) use the GitHub API to append to or update the relevant JSON file
- Vercel auto-deploys on every repository change — the site stays live and current
- No server needed. No backend. No database.

### Hosting Stack
- **GitHub** — repository and data storage
- **Vercel** — hosting and auto-deployment (free tier)
- **GitHub API** — all reads and writes from the app
- **YouTube embed API** — video playback
- **Domain registrar** — Namecheap or Porkbun (~$12/year)

### The /data Page
- A hidden page (not linked anywhere in the main UI) that renders the raw JSON files
- Anyone who finds it can see all users, progress, and comments
- This is intentional — the data is harmless (video progress) so open access is a feature
- Fits the open source, community-owned spirit of the project

---

## 5. Content Index

The master index (`videos.json`) is the backbone of the entire app. Every video in BTS history is a record in this file.

### Video Record Schema

| Field | Type | Example |
|---|---|---|
| `id` | string | `run-bts-ep001` |
| `title` | string | `Run BTS! Ep. 1` |
| `date` | YYYY-MM-DD | `2015-08-01` |
| `era` | string | `2015 Debut` |
| `type` | string | `Run BTS` |
| `series` | string | `Run BTS` |
| `episode` | number | `1` |
| `url` | string (YouTube) | `https://youtube.com/...` |
| `thumbnail` | string (URL) | `https://img.youtube.com/...` |
| `members` | array | `["RM", "Jin", "Suga", ...]` |
| `subtitles` | boolean | `true` |
| `duration_sec` | number | `1823` |
| `description` | string | Short context note |

### Content Types (treated as series)
- **Music Videos** — title tracks, b-sides, solo releases
- **Performances** — award shows, concerts, music show stages
- **Run BTS** — episodic variety show, numbered sequentially
- **Bangtan Bombs / Vlogs** — short behind-the-scenes clips
- **Bon Voyage / In the SOOP** — travel and reality series
- **VLives** — live streams and fan interactions
- **Interviews** — press, talk shows, radio
- **Documentaries** — Burn the Stage, Break the Silence, etc.
- **Concerts** — full concert films

### Community Maintenance
- The content index is a JSON file in an open source repo
- Community members can submit pull requests to add or correct videos
- No admin approval flow required for contributions — PRs are self-moderating
- An `/admin` page allows the owner to add/edit entries via a form UI without touching code

---

## 6. Browsing & Navigation

### Home Page
- Hero banner — featured or recommended content
- Horizontal carousels — Continue Watching, BTS Bootcamp, By Era, Run BTS, Concerts, New to the Index
- Each carousel is independently scrollable
- Clicking a video card opens the player; clicking a category title opens the collection page

### Collection Pages
- One page per content type (Run BTS, Concerts, Vlogs, etc.)
- Feels like a show page — poster art, short description, episode/video list
- Sortable by date, episode number, or duration
- Shows watched/unwatched status per video for logged-in users

### Era Pages
- One page per era (Debut, HYYH, Wings, Love Yourself, Map of the Soul, BE, Solo Era)
- All content from that period regardless of type
- Timeline layout — shows how content unfolded chronologically

### TikTok Vertical Scroll *(V2)*
- Within any collection or category, users can switch to a vertical scroll mode
- Each video card fills the screen — swipe up to see the next one
- Quick-tap to mark watched, favorite, or open the full player
- Designed to create a discovery rabbit hole

### Search & Filters
- Full-text search across the index by title, member, era, and type
- Filters: era, content type, member, subtitle availability, watched/unwatched, duration range

---

## 7. Player & Autoplay

### Player
- Embedded YouTube player — clean, full-width, minimal surrounding chrome
- Up Next panel visible alongside the player showing the queued video
- Video automatically marked as watched after 80% of runtime is completed
- Manual mark watched / unwatched toggle always available
- Favorite button, share button, and add-to-queue button in player UI

### Context-Aware Autoplay
Autoplay is intelligent — it knows what context you are watching in and sequences accordingly:

- Watching Run BTS chronologically → autoplays next Run BTS episode in sequence
- In a concert collection → plays the next concert in chronological order
- In Bootcamp path → plays the next Bootcamp step regardless of type
- Browsing freely → suggests related content, autoplay is optional

### Autoplay Settings
- Toggle autoplay on or off globally
- Set a delay between videos (0s, 5s, 10s, 30s)
- Set a session limit — stop after X videos
- Settings persist per user profile

### Convert to Queue
- Any collection, era page, or filtered result can be converted into a sequential watch queue
- Examples: Chronological Run BTS, All concerts by date, All HYYH-era content
- Queue is saved to the user profile and resumable

---

## 8. BTS Bootcamp

The Bootcamp is a structured, guided on-ramp for new ARMYs. It should feel like a journey — not a homework assignment. Context and curation are everything.

### Chapters (Suggested Structure)
- **Chapter 1: Who Is BTS?** — the essentials, the members, the story
- **Chapter 2: The Music** — title tracks in order, key performances
- **Chapter 3: The Lore** — HYYH universe, the connection between eras
- **Chapter 4: The Members** — solo content, individual arcs
- **Chapter 5: The Daily Life** — Bangtan Bombs, Run BTS, behind the scenes
- **Chapter 6: The Fandom** — ARMY culture, fan content context

### How It Works
- Each step in a chapter has a short description: why this video, what to watch for
- Autoplay follows the Bootcamp sequence — one step flows into the next
- Users can pause the path and browse freely, then return to their place
- Progress per chapter is tracked and visualized — satisfying completion states

### Track Lengths *(V2)*
- **Quick Start** — 2 hours, the absolute essentials
- **Weekend Dive** — 10 hours, enough to feel like a real ARMY
- **Full Immersion** — the complete path, weeks of content

---

## 9. User Profiles & Accounts

### Profile System
- Users create a profile with a username and optional PIN
- No email, no password reset, no external auth service
- Logging in = typing your username → app fetches your row from `users.json` → loads your state
- Multiple profiles can exist (e.g., siblings sharing a device)
- Profile creation includes: username, favorite member, new or veteran ARMY

### Data Transparency
- All profile data lives in `users.json` — a file in the open GitHub repo
- The `/data` page renders this file raw — any user can technically access any profile
- This is intentional and accepted: the data is watching progress, not personal information
- No privacy guarantees are made or implied — documented openly as a known characteristic

### Progress Export *(V2)*
- Users can download their row from `users.json` as a personal backup
- They can import it later to restore progress on a new device or browser

---

## 10. Progress Tracking

All tracking is stored per profile in the JSON files. No local browser storage — everything is in the repo so it persists across sessions for anyone who knows their username.

| Tracker | Description |
|---|---|
| **Watched / Unwatched** | Per-video flag, togglable manually or set automatically at 80% completion |
| **Favorites** | User-curated list of saved videos, accessible from profile and home page |
| **Watch History** | Auto-logged, shows recently watched with timestamps |
| **Progress by Era** | % of each era watched — shown on era pages and dashboard |
| **Progress by Type** | % of Run BTS, Concerts, MVs etc. watched |
| **Overall Progress** | % of the entire index watched |
| **Bootcamp Progress** | Chapter completion, current step, time spent |
| **Continue Watching** | Resume state per series — picks up where you left off |

---

## 11. Timestamp Chat

Every video has a community comment system divided into 10-second intervals. Instead of one big comment section, each moment in the video has its own thread. Fans can discuss the exact same second together.

### How It Works
- Side panel opens alongside the player showing the active interval's thread
- Thread updates as the video plays — you see comments for wherever you are
- Top comment for the current interval floats up as a subtle bubble overlay on the video
- Clicking a timestamp in the panel scrubs the video to that moment
- Users can browse all intervals as a timeline — scroll through the video's entire commentary

### Posting & Replies
- Only users with a profile can post — comments attributed to username
- Comments are nested — any comment can be replied to
- Reply structure: `parent_comment_id` is null for top-level, references parent for replies
- Submitting a comment appends a new row to `comments.json` via the GitHub API
- Simple append model — no real-time sync, refreshes on interval change

### Likes
- Each comment has a like button — stored locally in the browser (localStorage)
- Likes are not shared across users — personal reactions, not social signals
- Top comment bubble is determined by earliest posted, not like count

### Comment Schema

| Field | Description |
|---|---|
| `comment_id` | Unique identifier for the comment |
| `parent_comment_id` | `null` for top-level, references parent for replies |
| `video_id` | References the video in `videos.json` |
| `interval` | 10-second bucket, e.g. `"0:20"` means 0:20–0:30 |
| `username` | Profile username of the poster |
| `comment` | Text content of the comment |
| `posted_at` | ISO timestamp of submission |

---

## 12. User Dashboard *(V2)*

### Profile Page
- Username, favorite member, ARMY type (new / veteran)
- Total watch time across all videos
- % of entire index watched
- Favorite era (inferred from watch history)
- Bootcamp progress overview with chapter completion bars

### Shelves
- **Favorites** — saved videos in a Netflix-style grid
- **Watch History** — recently watched, most recent first
- **In Progress** — series with partial completion
- **My Queues** — saved sequential watch queues

### Milestones & Badges
- Unlocked by completing meaningful thresholds
- Examples: Watched all MVs, Run BTS Completionist, Seen Every Concert, 100 Hours Watched
- Displayed on profile — lightweight gamification, never the focus

---

## 13. Admin Page

The `/admin` page is a form-based UI for adding and editing content index entries without touching the JSON file directly. It is not linked in the main navigation.

### Capabilities
- Add a new video to `videos.json` via form — all schema fields exposed as inputs
- Edit an existing entry by video ID
- Preview a video entry before saving
- Bulk import via CSV paste *(V2)*
- Changes write to the repo via GitHub API and trigger a Vercel redeploy

### Access
- No login wall — the page is obscure by URL, not protected by auth
- Consistent with the overall open source transparency philosophy
- Community contributors can use it; the repo PR process is the accountability layer

---

## 14. Build Plan

| Feature | Phase | Notes |
|---|---|---|
| Content index (videos.json) | **MVP** | Foundation of everything |
| Home page carousels | **MVP** | Hero + horizontal rails |
| Era & collection pages | **MVP** | One page per era/type |
| Embedded player + basic autoplay | **MVP** | Context-aware sequencing |
| Bootcamp path (single track) | **MVP** | Guided new ARMY experience |
| User profiles (username + PIN) | **MVP** | Local profile system |
| Progress tracking (watched, favs, history) | **MVP** | Per-profile, written to users.json |
| /data hidden page | **MVP** | Raw file viewer, intentionally open |
| /admin content editor | **MVP** | Add/edit videos without touching code |
| TikTok vertical scroll browse mode | V2 | Within category/collection |
| Multi-track Bootcamp | V2 | Short / weekend / full immersion |
| Autoplay settings + convert-to-queue | V2 | User controls + custom playlists |
| Dashboard stats + milestones | V2 | Badges, watch time, % complete |
| Advanced search + filters | V2 | Member, subtitle, duration, era |
| Timestamp chat + nested replies | V2 | Per-interval comment threads |
| Export / import progress | V2 | JSON download for backup |

---

## 15. Open Questions

| Question | Notes |
|---|---|
| **Domain extension** | .com, .app, or .fan? Check availability on porkbun.com |
| **HYBE trademark** | Using "BTS" in domain is a grey area — fan sites generally operate fine but worth noting |
| **Initial content seeding** | Who populates videos.json first before launch? Owner or community? |
| **Bootcamp curation** | Who curates the initial Bootcamp path and chapter descriptions? |
| **GitHub API rate limits** | Public repos have limits on writes — may need a thin serverless function for heavy write operations |
| **Subtitle data** | Include subtitle availability and CC links per video in the index? |
| **Comment moderation** | Any flagging system, or fully open with no moderation? |
| **PIN storage** | Store PINs as plaintext (consistent with transparency ethos) or hash them? |

---

*BTSBootcamp · Product Requirements v1.0 · May 2026*

*For the ARMYs. Built by the ARMYs.*
