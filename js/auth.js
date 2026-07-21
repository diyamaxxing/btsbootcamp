// ── Profile auth: login, signup, session ────────────────────────────────────
//
// There is no local users.json in this repo anymore. User profiles live in
// bestofbootcamp, written to via a Google Form intake, never via a
// credential this browser holds:
//
//   1. createUser() below submits straight to a Google Form (see
//      SIGNUP_FORM_URL) — a real hidden-iframe form POST, not fetch, since
//      Google's response endpoint doesn't send CORS headers. No account, no
//      credential of any kind touches this browser.
//   2. Every response becomes a row in the form's linked Google Sheet. A
//      scheduled GitHub Actions workflow in bestofbootcamp
//      (automation/signups/promote.js) reads new rows, validates them, and
//      commits accepted ones into bestofbootcamp/data/users.json, using a
//      Google service-account credential that lives only as a repo secret —
//      never exposed here.
//
// This replaces an earlier design (a fine-grained GitHub PAT embedded in
// this file) that turned out not to work: GitHub auto-revokes its own
// PAT-format tokens the moment they're detected in a public repo, no matter
// how narrowly scoped, so a client-embedded GitHub credential can't stay
// live here. Full investigation and every alternative considered is in
// issue #18 and ARCHITECTURE_DECISIONS.md.
//
// Practical consequence: createUser() does not create an account instantly.
// It submits a request; the account exists once the scheduled workflow
// promotes it — typically within the next few minutes, not instant.

const SESSION_KEY = "bts_session_username";

const DATA_OWNER = "diyamaxxing";
const DATA_REPO = "bestofbootcamp"; // promoted, live users.json lives here

// The signup Google Form's raw submission endpoint and each question's
// entry ID — see ARCHITECTURE_DECISIONS.md for how these are obtained
// (Form editor → "Get pre-filled link"). Not secrets: submitting to a
// public form endpoint needs no auth, these values just say where to send
// the data and which field is which.
const SIGNUP_FORM_URL = "PASTE_YOUR_SIGNUP_FORM_ACTION_URL_HERE";
const SIGNUP_FORM_FIELDS = {
  username: "PASTE_USERNAME_ENTRY_ID_HERE",
  pin: "PASTE_PIN_ENTRY_ID_HERE",
  favoriteMember: "PASTE_FAVORITEMEMBER_ENTRY_ID_HERE",
  armyType: "PASTE_ARMYTYPE_ENTRY_ID_HERE",
};

// Must match the validator in bestofbootcamp/automation/signups/promote.js —
// if you change one, change the other, or the scheduled job will silently
// reject submissions this form considered valid.
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

// Submits form data directly to a Google Form's response endpoint via a
// hidden iframe, so the visitor never leaves this page and no visible
// redirect happens. A real <form> POST (not fetch/XHR) is required because
// Google's formResponse endpoint sends no CORS headers — a fetch() call
// would be blocked from reading the response even though the submission
// itself would succeed; a form POST targeting a hidden iframe sidesteps
// that entirely since the browser doesn't apply CORS to form submissions
// the same way. Resolves once the iframe finishes loading — that's the
// only signal available (the response page's content is cross-origin and
// unreadable), so this is "accepted," not "confirmed," same contract every
// write in this pipeline already has.
function submitToGoogleForm(actionUrl, fields) {
  return new Promise((resolve) => {
    const iframeName = `gform-target-${Date.now()}`;
    const iframe = document.createElement("iframe");
    iframe.name = iframeName;
    iframe.style.display = "none";
    iframe.addEventListener("load", () => {
      resolve();
      iframe.remove();
    });
    document.body.appendChild(iframe);

    const form = document.createElement("form");
    form.action = actionUrl;
    form.method = "POST";
    form.target = iframeName;
    form.style.display = "none";

    Object.entries(fields).forEach(([name, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
    form.remove();
  });
}

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

// Submits a signup request to the Google Form. IMPORTANT: this does not log
// the user in or confirm the account exists — it only means the request was
// submitted for the scheduled promotion workflow to pick up. Callers should
// tell the user to check back shortly, not treat the resolved promise as
// "you're now registered." See pages/profile.html's renderPending() for the
// UI side of that distinction.
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

  await submitToGoogleForm(SIGNUP_FORM_URL, {
    [SIGNUP_FORM_FIELDS.username]: entry.username,
    [SIGNUP_FORM_FIELDS.pin]: entry.pin || "",
    [SIGNUP_FORM_FIELDS.favoriteMember]: entry.favoriteMember || "",
    [SIGNUP_FORM_FIELDS.armyType]: entry.armyType || "",
  });

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
