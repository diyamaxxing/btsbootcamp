# Architecture Decisions

A running log of significant architecture/requirements decisions for BTSBootcamp, in the order they were made, with the reasoning behind them. Not a spec — the spec is `BTSBootcamp-Requirements.md` and `CLAUDE.md`. This is the "why," so future contributors don't have to re-derive it or accidentally re-litigate something already settled.

Each entry: what was decided, what alternatives were considered and rejected, and why.

---

## 2026-07-18/19 — User writes: three-repo credential-isolation pipeline

**Decision:** User signups (and likely comments, when built) don't write to the main site repo at all. Instead:
- `btsbootcamp` (this repo) — site code only. No write credential used anywhere in the pipeline ever has permission on this repo.
- `burnthestage` — staging repo. The public-facing write goes here: a fine-grained GitHub PAT scoped *only* to this repo (safe to embed in client JS, see `js/auth.js`) creates a new file per signup under `pending/`.
- `bestofbootcamp` — the real, live data repo. A GitHub Actions workflow in `burnthestage` (`.github/workflows/validate-and-promote.yml` + `scripts/promote.js`) validates pending submissions (valid JSON, matches schema, no duplicate username) and, using a *second*, separate credential (`BOB_TOKEN`, a repo secret scoped only to `bestofbootcamp`), promotes valid ones into `bestofbootcamp/data/users.json`. Invalid/rejected submissions are deleted from staging without being promoted.

**Why two credentials instead of one:** GitHub fine-grained PATs scope to a whole repo, not a branch — a single token with access to a repo containing both a "pending" and "live" area could still be misused to bypass any intended workflow, and enforcing separation via branch protection requires configuration that's easy to get wrong. Two separate repos make the boundary enforced by GitHub's permission system itself, with nothing to misconfigure.

**What this protects against:** code defacement / script injection (impossible — no write credential in this pipeline touches the code repo) and structural data corruption (invalid JSON, wrong schema — caught before promotion). What it does NOT protect against: semantically-valid-but-garbage content (a well-formed spam row) — that needs smarter heuristics (e.g. rate-limiting new rows), not just the repo boundary.

**Accepted trade-off — latency:** writes are not instant. Realistic end-to-end time is roughly 30 seconds to a couple of minutes (Actions trigger/queue delay + validation run + promotion commit + propagation to wherever the live site reads from). Accepted explicitly in exchange for the security isolation — see "why this is acceptable" below.

**Why the latency is acceptable:** accounts/comments are an optional social layer, not required for core site use — browsing, watching, and the Bootcamp path all work with zero login. The friction of an async signup doesn't sit in the onboarding funnel.

**Alternatives considered and rejected:**
- *Single client-embedded GitHub PAT with repo-wide access* — rejected: a leaked token could rewrite any file in the repo (fine-grained PAT "Contents" permission isn't scoped per-file), including the site's actual code.
- *IP-address-based user tracking/identity* — rejected: IPs are unstable (rotate on mobile/dynamic connections) and shared (NAT/household/carrier-grade NAT collapses multiple people into one identity); also carries real privacy weight if published in a public repo's history, more so than a self-chosen username.
- *Progressive "security questions" unlocked by Bootcamp progress* (gamified auth) — logged as a future idea on GitHub issue #7, not adopted for MVP. Revisit once the Bootcamp chapter structure (#6) exists to unlock attributes against.
- *Pure human-moderated email/mailbox queue* — considered viable (friction judged acceptable), but the multi-repo pipeline was judged better: no manual-labor bottleneck, comparable security properties once the token-exposure risk was fully broken down, and it doesn't depend on an external email provider tolerating automated IMAP access.
- *A Vercel serverless function (`api/create-user.js`) holding a single repo-wide secret* — this was the original plan and was built, then removed once the repo-isolation design made a client-embedded (but narrowly-scoped) token an acceptable replacement. See "hosting" decision below for why Vercel was dropped entirely.

---

## 2026-07-19 — Personal data (progress tracking) is local-first, not written anywhere

**Decision:** Watch progress, favorites, and PIN checks are stored only in `localStorage`, per browser/device. No write pipeline, no repo, no server, ever, for this data.

**Why:** this data only needs to matter to the person generating it — there's no requirement for other people or other devices to see it. Given that, the entire write-credential/security conversation above doesn't apply, because nothing needs to be shared.

**Trade-off accepted:** progress does not sync across devices or browsers, and clearing site data loses it. This is a real departure from the original PRD (which put progress in `users.json` for cross-device durability via the profile system) but was judged the better fit given the "genuinely static, old-school" direction.

**Consequence for the roadmap:** issue #13 (user-based recommendation signals) assumed visibility into individual watch history that this decision doesn't provide. That issue's scope needs revisiting — it would have to work off aggregate/anonymous signals, or the local-first decision would need a carve-out, if it's ever built.

---

## 2026-07-19 — Hosting: GitHub Pages, not Vercel

**Decision:** Site hosting moves to GitHub Pages. Vercel (and the serverless function it was hosting) is no longer part of the architecture.

**Why:** the original reason for Vercel was `api/create-user.js` needing a host that supports serverless functions — GitHub Pages doesn't. Once the three-repo write pipeline removed the need for that function entirely (see above), there was nothing left requiring Vercel. GitHub Pages is also the better philosophical fit for "genuinely static, old-school" hosting, and it keeps everything (Pages + Actions + all three repos) under one vendor, which isn't a hard requirement but is a nice property to get for free.

**Consequence:** all repos are kept **public** — this doesn't weaken the credential-isolation design at all (isolation comes from permission scope, not repo visibility) and unlocks unlimited free GitHub Actions minutes (private repos get a capped free allowance), on top of matching the project's existing "no privacy guarantees, radically transparent" ethos already established for user data.

**Consequence for docs:** `CLAUDE.md`'s hosting section and file structure needed updating to drop Vercel references; the local `data/users.json` in this repo is removed since it's no longer the live data source (that's `bestofbootcamp/data/users.json` now).

---

## 2026-07-19 — Cross-category tagging and song-linking are computed from title text, not hand-maintained

**Decision:** `scripts/build_videos_json.py` now derives two things automatically from each video's title, replacing what used to be manual/nonexistent:
- `tags` — every category a video structurally matches, beyond its source-playlist `type`, with **no category treated as primary**. A video's `type` is still one concrete fact (which playlist it actually shipped in), but `tags` can hold any number of additional categories with equal standing.
- `song` — the quoted title substring (e.g. "Butter"), used purely as a recommendation-linking key across categories, not a classification.

**Why title text, and why NOT a loose keyword list:** matching was validated against the real CSVs before being built, not assumed. Plain substring matching on category names over-matches badly — e.g. "MV" appears in 25 Bangtan Bomb titles that are about an MV ("MV Reaction," "MV Shooting") but aren't MVs themselves, and "dance practice" (any case, anywhere) matches casual bomb titles like "Attack on BTS at dance practice" that aren't Dance Practice videos. The fix: each category's pattern is derived from the **exact naming convention that category's own official videos use** (e.g. real MVs are titled `'[Song]' Official MV`; real Dance Practice videos are titled `'[Song]' Dance Practice`), and a video only gets cross-tagged if it matches that specific convention, not a loose mention. This produces exactly the previously-known 5 Bangtan-Bombs-that-are-actually-Dance-Practice videos with zero false positives, and correctly produces zero MV cross-tags (no bomb follows the real MV convention, confirming playlist origin was already correct there — not a broken rule, an expected negative result).

**Why `song` is separate from `tags`:** tags answer "what type of content is this," song answers "what release is this about," and they don't collapse into each other — an MV, its Dance Practice, and a Bangtan Bomb about its jacket shoot all share the same `song` while having three completely different `type`s. Verified against real data: "Butter" alone links 16 videos across all 4 non-Run-BTS playlists; 115 songs link 2+ videos catalog-wide. This became a new, high-priority carousel in the player's recommendation river (`More '[Song]'`), placed ahead of "Up Next" — sharing a release is a stronger signal than sharing an era or type.

**Known limitations, accepted rather than solved:**
- Only Dance Practice and MV have validated cross-tag patterns so far. Behind/Sketch/Episode-style categories likely have the same casual-vs-formal ambiguity (e.g. "Sketch" appears in both Bangtan Bombs and BTS Episodes without being a reliable distinguishing signal) and weren't given patterns — better to leave a category untagged than guess at a pattern that hasn't been checked against real titles.
- `song` extraction can truncate early on a song title containing its own apostrophe (e.g. "Killin' It Girl") since the pattern uses quote characters as delimiters. Accepted: a missed link just means one fewer recommendation, not incorrect data.
- Song-name casing was verified consistent across the real catalog (grouping coverage was identical with/without lowercasing), so `song` keeps original case for cleaner display rather than normalizing defensively against a problem that doesn't occur in practice.

---

## 2026-07-21 — Comments (#15): a peer staging repo, not routed through burnthestage; profile-required; V1 scope cut to flat per-video comments

**Decision:** Comments extend the existing write-isolation pattern with a fourth repo, `campcomments`, rather than reusing `burnthestage`. `campcomments` is a **peer staging inbox** to `burnthestage` — the two are independent, neither routes through the other — and both promote into the same destination, `bestofbootcamp`, which now holds both `data/users.json` and `data/comments.json`.

**Why a new staging repo instead of adding a `pending-comments/` folder to `burnthestage`:** two reasons, both about risk shape, not raw security:
1. **Blast radius for code changes, not just credentials.** `burnthestage`'s signup pipeline was just verified live end-to-end this session (#16). Adding comment-promotion logic to that same repo — new script, new workflow file — means any future bug in comment handling shares a repo with the already-proven signup path. A separate repo means comments can never affect signups, full stop, regardless of what the code does.
2. **The security shape is already proven, just reused.** `campcomments` mirrors `burnthestage` exactly: a client-embedded token scoped only to itself, holding nothing but an unvalidated `pending/` queue. This isn't a new risk category being introduced — it's the same accepted risk (a leaked client token can spam a worthless inbox) applied to a second inbox, rather than inventing something novel.

**Why `bestofbootcamp` stays the single, consolidated destination rather than also splitting per data-type (e.g. a `campcomments`-owned `data/comments.json`):** the isolation boundary in this architecture was never "one live-data repo per content type" — it's "code repo vs. staging repo(s) vs. validated-data repo." `BOB_TOKEN` already has full `contents:write` on all of `bestofbootcamp` (fine-grained PATs scope per-repo, not per-file), so adding `comments.json` there doesn't expand what that credential can already do. A separate live-data repo for comments would mean a *fifth* repo and a *third* server-only credential for no corresponding security gain. Each staging repo issues its own `BOB_TOKEN` (same name, same scope, different token value per repo, since GitHub secrets aren't shareable across repos) — comment-promotion also uses this to cross-check `username` against the live `users.json` in the same repo, rejecting comments attributed to a username with no real profile.

**Why posting requires an existing profile:** matches the PRD as written (`BTSBootcamp-Requirements.md` §11: "Only users with a profile can post — comments attributed to username"). An anonymous, free-text-name alternative was floated mid-session but rejected: this repo has **no comment moderation system built** (PRD explicitly lists it as an open question), and with a public write path and zero moderation, anonymous posting is a much easier spam/impersonation target than profile-gated posting, where at least a username ties abuse to a revocable account. The PRD's nested-reply feature also needs persistent identity to mean anything — anonymous posters can't meaningfully be replied to across sessions.

**Consequence for UX — draft persistence across the login redirect:** since posting requires login, a logged-out visitor who types a comment and hits Enter is redirected to `profile.html` rather than shown an inline error. To avoid losing what they typed, the draft is saved to `localStorage` (`bts_pending_comment_draft`, see `js/comments.js`) and auto-posted the moment login succeeds — not on signup submission itself, since a brand-new account still has to clear the async staging/promote pipeline before it's real.

**V1 scope, deliberately cut down from the full PRD spec:** flat, per-video comments only — no `interval` field (no 10-second-interval bucketing), no nested replies (schema keeps `parent_comment_id` for forward-compatibility but the promote script currently rejects any non-null value), no floating "top comment" bubble overlay, no full-timeline scrubbing, no local per-comment likes. Chosen to get the core write path (staging → validate → promote → read-back) proven live first, the same way user profiles shipped as a working pipeline (#7) before being hardened (#16) — rather than building the full interval-threading UI against an unproven write path. These become explicit, scoped follow-up work once V1 is verified live.

**Discovered during live verification — a second, CDN-level delay beyond promotion, and a local-echo fix:** the existing "writes take ~30s-2min" framing (see the three-repo pipeline decision above) only accounts for the Actions promotion step. Live testing of comments surfaced a second, independent delay: `raw.githubusercontent.com` (used for every read in this architecture — `loadUsers()`, `loadComments()`) caches per-CDN-edge for up to 5 minutes (`cache-control: max-age=300`), and different requests — even from the same machine seconds apart — can land on different edges with independently-stale cache state. A `curl` from one location returned the freshly-promoted comment immediately while the browser, hitting a different edge, kept returning stale (pre-comment) data for several minutes after promotion had already succeeded. This almost certainly already applied to `users.json` reads too; it simply went unnoticed there because nothing had previously reloaded the exact same URL within the same browser tab both before and immediately after a promotion.

**Decision:** rather than fight CDN propagation (not something this architecture controls), comments this browser itself just posted are echoed locally — `js/comments.js`'s `saveLocalComment()`/`pendingLocalComments()`, `localStorage` key `bts_local_pending_comments`, 10-minute TTL — and merged into the display ahead of the live fetch until the live data actually contains them (matched by video_id + username + comment text, since the client never learns the server-assigned `comment_id`). This makes "you see your own comment immediately" independent of both the promotion delay and CDN propagation, without pretending to solve either — other people still only see a new comment once both delays clear, which remains an accepted trade-off per the original latency reasoning.
