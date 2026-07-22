// Plain video comments: post, read, draft persistence. V1 slice of #15 —
// flat, per-video comments only. No 10-second-interval threading, no
// nested replies, no bubble overlay, no timeline. Those are deliberate
// follow-ups once this core write path is proven live, the same way user
// profiles (#7) shipped before being hardened (#16).
//
// Write path mirrors createUser() in hooks/useAuth.tsx: createComment()
// below submits straight to a Google Form (no account, no credential
// touching this browser). A scheduled workflow in bestofbootcamp
// (automation/comments/promote.js) reads new rows, validates them
// (including cross-checking username against a real profile), and commits
// accepted ones into bestofbootcamp/data/comments.json.
//
// Plain functions, not a hook — nothing here holds component state; the
// module-level cache below is the only shared state, same pattern as
// hooks/useAuth.tsx's usersCache.

import { submitToGoogleForm } from "./googleForm";
import { rawContentUrl } from "./github";
import type { Comment, PendingComment } from "./types";

// The comment Google Form's raw submission endpoint and each question's
// entry ID — same non-secret status as SIGNUP_FORM_URL/FIELDS in
// hooks/useAuth.tsx.
const COMMENT_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSdbQtsvKMm6g_7tXRF9tLvjxT5bRaRV2AO5mJxRUmuS8hzboA/formResponse";
const COMMENT_FORM_FIELDS = {
  video_id: "entry.1052827571",
  username: "entry.1734509424",
  comment: "entry.317022676",
};

const MAX_COMMENT_LENGTH = 2000;

export const DRAFT_KEY = "bts_pending_comment_draft";

// In-memory only; cleared on page reload. Mirrors usersCache in
// hooks/useAuth.tsx.
let commentsCache: Comment[] | null = null;

// Fetches the live (already-promoted) comment list from bestofbootcamp —
// same repo hooks/useAuth.tsx reads users.json from, just a different file.
export async function loadComments(): Promise<Comment[]> {
  if (commentsCache) return commentsCache;
  const res = await fetch(rawContentUrl("data/comments.json"));
  commentsCache = await res.json();
  return commentsCache as Comment[];
}

// Newest-first flat list for one video. No interval bucketing in V1 — every
// comment on a video is one thread.
export function commentsForVideo(comments: Comment[], videoId: string): Comment[] {
  return comments
    .filter((c) => c.video_id === videoId)
    .sort((a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime());
}

interface CreateCommentInput {
  videoId: string;
  username: string;
  comment: string;
}

// Submits a comment to the Google Form. Same non-instant contract as
// createUser() — this does not mean the comment is live yet, just that it
// was submitted for the scheduled promotion workflow to pick up.
export async function createComment({ videoId, username, comment }: CreateCommentInput) {
  const trimmed = (comment || "").trim();
  if (!trimmed) {
    throw new Error("Comment can't be empty.");
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    throw new Error(`Comment must be ${MAX_COMMENT_LENGTH} characters or fewer.`);
  }

  await submitToGoogleForm(COMMENT_FORM_URL, {
    [COMMENT_FORM_FIELDS.video_id]: videoId,
    [COMMENT_FORM_FIELDS.username]: username,
    [COMMENT_FORM_FIELDS.comment]: trimmed,
  });

  return { video_id: videoId, parent_comment_id: null, username, comment: trimmed };
}

// ── Draft persistence across the login redirect ─────────────────────────
// A logged-out visitor who types a comment and hits Enter gets sent to
// /profile to log in/sign up. Their draft is saved here so it can be
// auto-posted the moment login succeeds, instead of being lost. Separate
// from the session key — this is a one-shot draft, not session state.

interface Draft {
  videoId: string;
  comment: string;
}

export function saveDraftComment({ videoId, comment }: Draft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ videoId, comment }));
}

// Reads and clears the draft in one call so it's never accidentally posted
// twice (e.g. a second login within the same browser tab).
export function consumeDraftComment(): Draft | null {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  localStorage.removeItem(DRAFT_KEY);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Peeks (doesn't consume) — used by the post-signup "pending" panel to
// decide whether to mention "your comment will post once you log in."
export function hasDraftComment(): boolean {
  return !!localStorage.getItem(DRAFT_KEY);
}

// ── Local echo for comments this browser just posted ────────────────────
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

interface LocalComment {
  video_id: string;
  username: string;
  comment: string;
  saved_at: number;
}

function readLocalComments(): LocalComment[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_COMMENTS_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeLocalComments(list: LocalComment[]) {
  localStorage.setItem(LOCAL_COMMENTS_KEY, JSON.stringify(list));
}

// Called right after a successful createComment() — from both the direct
// post path (the player page) and the auto-post-on-login path (the profile
// page) — so either path survives a reload/redirect the same way.
export function saveLocalComment({ videoId, username, comment }: CreateCommentInput) {
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
export function pendingLocalComments(liveComments: Comment[], videoId: string): PendingComment[] {
  const now = Date.now();
  const stillPendingForThisVideo: PendingComment[] = [];
  const kept = readLocalComments().filter((local) => {
    if (now - local.saved_at > LOCAL_COMMENT_TTL_MS) return false;
    const isLive = liveComments.some(
      (c) => c.video_id === local.video_id && c.username === local.username && c.comment === local.comment
    );
    if (isLive) return false;
    if (local.video_id === videoId) {
      stillPendingForThisVideo.push({
        video_id: local.video_id,
        username: local.username,
        comment: local.comment,
        pending: true,
      });
    }
    return true;
  });
  writeLocalComments(kept);
  return stillPendingForThisVideo;
}
