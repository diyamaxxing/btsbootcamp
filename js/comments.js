// ── Plain video comments: post, read, draft persistence ─────────────────────
//
// V1 slice of #15 — flat, per-video comments only. No 10-second-interval
// threading, no nested replies, no bubble overlay, no timeline. Those are
// deliberate follow-ups once this core write path is proven live, the same
// way user profiles (#7) shipped before being hardened (#16).
//
// Reuses two staging repos with the same "nothing valuable inside" shape:
//   - campcomments — a peer of burnthestage (js/auth.js's staging inbox),
//     not routed through it. createComment() below writes one file per
//     comment to pending/ using a token scoped ONLY to this repo. A leaked
//     token can spam that queue but never touch real data.
//   - bestofbootcamp — already the live, validated home for users.json;
//     also now holds comments.json, promoted by a GitHub Actions workflow
//     living in campcomments (see that repo's scripts/promote.js), using a
//     credential scoped only to bestofbootcamp, never exposed here.
//
// Depends on auth.js being loaded first on the page (DATA_OWNER, DATA_REPO,
// utf8ToBase64, getSession are reused as globals — classic <script> tags
// share one global scope, same pattern profile.html already relies on).

const COMMENTS_STAGING_OWNER = "diyamaxxing";
const COMMENTS_STAGING_REPO = "campcomments"; // pending comments land here

// Fine-grained PAT scoped to ONLY `contents:write` on campcomments.
// Intentionally embedded in client code, same reasoning as STAGING_TOKEN in
// auth.js — see ARCHITECTURE_DECISIONS.md.
const COMMENTS_TOKEN = "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";

const MAX_COMMENT_LENGTH = 2000;

const DRAFT_KEY = "bts_pending_comment_draft";

// In-memory only; cleared on page reload. Mirrors usersCache in auth.js.
let commentsCache = null;

// Fetches the live (already-promoted) comment list from bestofbootcamp —
// same repo js/auth.js reads users.json from, just a different file.
async function loadComments() {
  if (commentsCache) return commentsCache;
  const res = await fetch(`https://raw.githubusercontent.com/${DATA_OWNER}/${DATA_REPO}/main/data/comments.json`);
  commentsCache = await res.json();
  return commentsCache;
}

// Newest-first flat list for one video. No interval bucketing in V1 — every
// comment on a video is one thread.
function commentsForVideo(comments, videoId) {
  return comments
    .filter((c) => c.video_id === videoId)
    .sort((a, b) => new Date(b.posted_at) - new Date(a.posted_at));
}

// Submits a comment to the staging repo's pending/ folder. Same non-instant
// contract as createUser() in auth.js — this does not mean the comment is
// live yet, just that it was accepted for the promotion pipeline to pick up.
async function createComment({ videoId, username, comment }) {
  const trimmed = (comment || "").trim();
  if (!trimmed) {
    throw new Error("Comment can't be empty.");
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    throw new Error(`Comment must be ${MAX_COMMENT_LENGTH} characters or fewer.`);
  }

  const entry = {
    video_id: videoId,
    parent_comment_id: null,
    username,
    comment: trimmed,
  };

  // Unique filename per submission, same reasoning as createUser()'s
  // filename convention — every write creates a brand-new file, no SHA
  // conflict possible even if two people comment on the same video at once.
  const filename = `${videoId}-${Date.now()}.json`;

  const res = await fetch(
    `https://api.github.com/repos/${COMMENTS_STAGING_OWNER}/${COMMENTS_STAGING_REPO}/contents/pending/${filename}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${COMMENTS_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        message: `Pending comment on ${videoId}`,
        content: utf8ToBase64(JSON.stringify(entry, null, 2)),
      }),
    }
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Failed to submit comment");
  }

  return entry;
}

// ── Draft persistence across the login redirect ─────────────────────────────
// A logged-out visitor who types a comment and hits Enter gets sent to
// profile.html to log in/sign up. Their draft is saved here so it can be
// auto-posted the moment login succeeds, instead of being lost. Separate
// from auth.js's SESSION_KEY — this is a one-shot draft, not session state.

function saveDraftComment({ videoId, comment }) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ videoId, comment }));
}

// Reads and clears the draft in one call so it's never accidentally posted
// twice (e.g. a second login within the same browser tab).
function consumeDraftComment() {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  localStorage.removeItem(DRAFT_KEY);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ── Local echo for comments this browser just posted ────────────────────────
// createComment() only means "accepted into the pipeline," not "live" — on
// top of the usual ~30s-2min promotion delay, GitHub's raw-content CDN
// (raw.githubusercontent.com) caches per-edge-node for up to 5 minutes, and
// different requests can land on different edges, so a reload right after
// posting can easily still show stale (pre-comment) data even once
// promotion itself has finished. Rather than make the person wait out both
// delays to see their own words, remember what THIS browser just posted and
// merge it into the display until the live data actually catches up — a
// local echo, not a substitute for the real, shared record.
const LOCAL_COMMENTS_KEY = "bts_local_pending_comments";
const LOCAL_COMMENT_TTL_MS = 10 * 60 * 1000; // generous upper bound for promotion + CDN propagation

function readLocalComments() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_COMMENTS_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeLocalComments(list) {
  localStorage.setItem(LOCAL_COMMENTS_KEY, JSON.stringify(list));
}

// Called right after a successful createComment() — from both the direct
// post path (player.html) and the auto-post-on-login path (profile.html) —
// so either path survives a reload/redirect the same way.
function saveLocalComment({ videoId, username, comment }) {
  const list = readLocalComments();
  list.push({ video_id: videoId, username, comment, saved_at: Date.now() });
  writeLocalComments(list);
}

// Local echoes for one video that the live data doesn't contain yet.
// Matches on (video_id, username, comment) since the client never learns
// the server-assigned comment_id — an imperfect but sufficient heuristic
// for "the real one showed up, stop showing the local copy." Also prunes
// anything past LOCAL_COMMENT_TTL_MS (e.g. a rejected submission) so a
// failed post doesn't sit there forever claiming to be "Posting…".
function pendingLocalComments(liveComments, videoId) {
  const now = Date.now();
  const stillPendingForThisVideo = [];
  const kept = readLocalComments().filter((local) => {
    if (now - local.saved_at > LOCAL_COMMENT_TTL_MS) return false;
    const isLive = liveComments.some(
      (c) => c.video_id === local.video_id && c.username === local.username && c.comment === local.comment
    );
    if (isLive) return false;
    if (local.video_id === videoId) stillPendingForThisVideo.push(local);
    return true;
  });
  writeLocalComments(kept);
  return stillPendingForThisVideo;
}
