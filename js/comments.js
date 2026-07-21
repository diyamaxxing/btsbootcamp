// ── Plain video comments: post, read, draft persistence ─────────────────────
//
// V1 slice of #15 — flat, per-video comments only. No 10-second-interval
// threading, no nested replies, no bubble overlay, no timeline. Those are
// deliberate follow-ups once this core write path is proven live, the same
// way user profiles (#7) shipped before being hardened (#16).
//
// Write path mirrors js/auth.js's createUser(): createComment() below
// submits straight to a Google Form (no account, no credential touching
// this browser). A scheduled workflow in bestofbootcamp
// (automation/comments/promote.js) reads new rows, validates them
// (including cross-checking username against a real profile), and commits
// accepted ones into bestofbootcamp/data/comments.json.
//
// Depends on auth.js being loaded first on the page (DATA_OWNER, DATA_REPO,
// getSession, submitToGoogleForm are reused as globals — classic <script>
// tags share one global scope, same pattern profile.html already relies
// on). Full rationale for this design (and why an earlier client-embedded-
// PAT approach was abandoned) is in issue #18 and ARCHITECTURE_DECISIONS.md.

// The comment Google Form's raw submission endpoint and each question's
// entry ID — same non-secret status as SIGNUP_FORM_URL/FIELDS in auth.js.
const COMMENT_FORM_URL = "PASTE_YOUR_COMMENT_FORM_ACTION_URL_HERE";
const COMMENT_FORM_FIELDS = {
  video_id: "PASTE_VIDEO_ID_ENTRY_ID_HERE",
  username: "PASTE_USERNAME_ENTRY_ID_HERE",
  comment: "PASTE_COMMENT_ENTRY_ID_HERE",
};

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

// Submits a comment to the Google Form. Same non-instant contract as
// createUser() in auth.js — this does not mean the comment is live yet,
// just that it was submitted for the scheduled promotion workflow to pick
// up.
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

  await submitToGoogleForm(COMMENT_FORM_URL, {
    [COMMENT_FORM_FIELDS.video_id]: entry.video_id,
    [COMMENT_FORM_FIELDS.username]: entry.username,
    [COMMENT_FORM_FIELDS.comment]: entry.comment,
  });

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
