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
