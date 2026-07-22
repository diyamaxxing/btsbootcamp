"use client";

// Profile auth: login, signup, session. There is no local users.json in
// this repo — user profiles live in bestofbootcamp, written to via a
// Google Form intake, never via a credential this browser holds. See
// CLAUDE.md, "GitHub as the database," and ARCHITECTURE_DECISIONS.md's
// Google-Form-intake entry for the full write-pipeline design.
//
// Replaces js/auth.js's getSession()/setSession()/clearSession() window
// globals with React context so every consumer (Nav, the player's comment
// gate, profile.html's login/create panels) reacts to session changes
// instead of each page manually re-running its own render() after login.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { submitToGoogleForm } from "@/lib/googleForm";
import { rawContentUrl } from "@/lib/github";
import type { UserProfile } from "@/lib/types";

const SESSION_KEY = "bts_session_username";

// The signup Google Form's raw submission endpoint and each question's
// entry ID — see ARCHITECTURE_DECISIONS.md for how these are obtained
// (Form editor → "Get pre-filled link"). Not secrets: submitting to a
// public form endpoint needs no auth, these values just say where to send
// the data and which field is which.
const SIGNUP_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSe-M1WSMdaMmtBnkWohK5_P2ADK4qK8vd-yTaPKZtNVjz8x_w/formResponse";
const SIGNUP_FORM_FIELDS = {
  username: "entry.1811748859",
  pin: "entry.1856643483",
  favoriteMember: "entry.388797197",
  armyType: "entry.1549988481",
};

// Must match the validator in bestofbootcamp/automation/signups/promote.js —
// if you change one, change the other, or the scheduled job will silently
// reject submissions this form considered valid.
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

export interface CreateUserInput {
  username: string;
  pin?: string;
  favoriteMember?: string;
  armyType?: string;
}

interface AuthContextValue {
  session: string | null;
  setSession: (username: string) => void;
  clearSession: () => void;
  loadUsers: () => Promise<UserProfile[]>;
  findUser: (users: UserProfile[], username: string) => UserProfile | null;
  verifyPin: (user: UserProfile, pin: string) => boolean;
  // Only submits the request to the Google Form — does NOT mean the account
  // exists yet (promotion happens async via GitHub Actions, ~30s-2min
  // later). Callers should tell the user to check back shortly, not treat
  // the resolved promise as "you're now registered."
  createUser: (profile: CreateUserInput) => Promise<{ username: string }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// In-memory only; cleared on full page reload. Avoids re-fetching
// users.json on every findUser() call within a single session.
let usersCache: UserProfile[] | null = null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<string | null>(null);

  useEffect(() => {
    setSessionState(localStorage.getItem(SESSION_KEY));
  }, []);

  function setSession(username: string) {
    localStorage.setItem(SESSION_KEY, username);
    setSessionState(username);
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    setSessionState(null);
  }

  async function loadUsers(): Promise<UserProfile[]> {
    if (usersCache) return usersCache;
    const res = await fetch(rawContentUrl("data/users.json"));
    usersCache = await res.json();
    return usersCache as UserProfile[];
  }

  // Case-insensitive username lookup against an already-loaded user list.
  function findUser(users: UserProfile[], username: string): UserProfile | null {
    const target = username.trim().toLowerCase();
    return users.find((u) => u.username.toLowerCase() === target) || null;
  }

  // PIN is optional per the profile system design — a user with no PIN set
  // (user.pin is null) can be logged into by username alone.
  function verifyPin(user: UserProfile, pin: string): boolean {
    if (!user.pin) return true;
    return String(user.pin) === String(pin || "").trim();
  }

  async function createUser(profile: CreateUserInput) {
    const username = (profile.username || "").trim();
    if (!USERNAME_PATTERN.test(username)) {
      throw new Error("Username must be 3-20 characters: letters, numbers, underscore only.");
    }

    await submitToGoogleForm(SIGNUP_FORM_URL, {
      [SIGNUP_FORM_FIELDS.username]: username,
      [SIGNUP_FORM_FIELDS.pin]: profile.pin ? String(profile.pin).trim() : "",
      [SIGNUP_FORM_FIELDS.favoriteMember]: profile.favoriteMember || "",
      [SIGNUP_FORM_FIELDS.armyType]: profile.armyType || "",
    });

    return { username };
  }

  return (
    <AuthContext.Provider
      value={{ session, setSession, clearSession, loadUsers, findUser, verifyPin, createUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
