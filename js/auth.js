// ── Profile auth: login, signup, session ────────────────────────────────────
//
// There is no local users.json in this repo anymore. User profiles are
// managed across two sibling repos to keep a write credential from ever
// being able to touch this repo's code:
//
//   1. burnthestage   — staging inbox. createUser() below writes one file per
//                        signup to pending/ using a GitHub token scoped ONLY
//                        to this repo. Safe to embed client-side (see
//                        STAGING_TOKEN) because that scope can't reach
//                        anything else — not this repo's code, not the real
//                        user data.
//   2. bestofbootcamp — the real, live data. A GitHub Actions workflow living
//                        in burnthestage validates each pending signup
//                        (well-formed, matches schema, username not taken)
//                        and promotes valid ones here using a SECOND,
//                        separate credential that never leaves GitHub Actions.
//
// Full rationale for the split (and alternatives that were rejected, like a
// single repo-wide token) is in ARCHITECTURE_DECISIONS.md at the repo root.
//
// Practical consequence: createUser() does not create an account instantly.
// It submits a request; the account exists once the Actions workflow
// promotes it, typically ~30 seconds to a couple of minutes later.

const SESSION_KEY = "bts_session_username";

const STAGING_OWNER = "diyamaxxing";
const STAGING_REPO = "burnthestage"; // pending signups land here

const DATA_OWNER = "diyamaxxing";
const DATA_REPO = "bestofbootcamp"; // promoted, live users.json lives here

// Fine-grained PAT scoped to ONLY `contents:write` on burnthestage.
// Intentionally embedded in client code — see the comment block above for
// why that's an accepted risk rather than an oversight.
const STAGING_TOKEN = "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";

// Must match the validator in burnthestage/scripts/promote.js — if you change
// one, change the other, or the Actions job will silently reject submissions
// this form considered valid.
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

// In-memory only; cleared on page reload. Avoids re-fetching users.json on
// every findUser() call within a single page view.
let usersCache = null;

// Fetches the live (already-promoted) user list from bestofbootcamp.
// Not the local repo — there is no local copy to fall back to.
async function loadUsers() {
  if (usersCache) return usersCache;
  const res = await fetch(`https://raw.githubusercontent.com/${DATA_OWNER}/${DATA_REPO}/main/data/users.json`);
  usersCache = await res.json();
  return usersCache;
}

// Case-insensitive username lookup against an already-loaded user list.
function findUser(users, username) {
  const target = username.trim().toLowerCase();
  return users.find((u) => u.username.toLowerCase() === target) || null;
}

// PIN is optional per the profile system design — a user with no PIN set
// (user.pin is null) can be logged into by username alone.
function verifyPin(user, pin) {
  if (!user.pin) return true;
  return String(user.pin) === String(pin || "").trim();
}

// Plain btoa() mangles non-ASCII characters (e.g. accented usernames);
// this round-trips through encodeURIComponent so UTF-8 content survives
// being base64-encoded for the GitHub Contents API.
function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

// Submits a signup request to the staging repo's pending/ folder.
// IMPORTANT: this does not log the user in or confirm the account exists —
// it only means the request was accepted for review by the Actions
// pipeline. Callers should tell the user to check back shortly, not treat
// the resolved promise as "you're now registered." See pages/profile.html's
// renderPending() for the UI side of that distinction.
async function createUser(profile) {
  const username = (profile.username || "").trim();
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error("Username must be 3-20 characters: letters, numbers, underscore only.");
  }

  const entry = {
    username,
    pin: profile.pin ? String(profile.pin).trim() : null,
    favoriteMember: profile.favoriteMember || null,
    armyType: profile.armyType || null,
  };

  // Unique filename per submission (not a shared array) so two people
  // signing up at nearly the same moment never collide on the same file's
  // version/SHA — each write creates a brand-new file, no conflict possible.
  const filename = `${username.toLowerCase()}-${Date.now()}.json`;

  const res = await fetch(
    `https://api.github.com/repos/${STAGING_OWNER}/${STAGING_REPO}/contents/pending/${filename}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${STAGING_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        message: `Pending signup: ${username}`,
        content: utf8ToBase64(JSON.stringify(entry, null, 2)),
      }),
    }
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Failed to submit signup request");
  }

  return entry;
}

// ── Session: a pointer, not a data store ────────────────────────────────────
// This only remembers WHICH username is "logged in" on this browser so a
// page refresh doesn't log you out. It is not where any actual user data
// lives — that's always bestofbootcamp. Clearing it just forgets who you
// were, it never deletes or affects the account itself.

function getSession() {
  return localStorage.getItem(SESSION_KEY);
}

function setSession(username) {
  localStorage.setItem(SESSION_KEY, username);
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
