"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { MEMBERS, type UserProfile } from "@/lib/types";
import { consumeDraftComment, createComment, hasDraftComment, saveLocalComment } from "@/lib/comments";

type View =
  | { kind: "loading" }
  | { kind: "loggedIn"; user: UserProfile }
  | { kind: "loginCreate" }
  | { kind: "pending"; username: string };

export default function ProfilePage() {
  const { session, setSession, clearSession, loadUsers, findUser, verifyPin, createUser } = useAuth();
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: "loading" });

  const [loginUsername, setLoginUsername] = useState("");
  const [loginPin, setLoginPin] = useState("");
  const [loginError, setLoginError] = useState("");

  const [createUsername, setCreateUsername] = useState("");
  const [createPin, setCreatePin] = useState("");
  const [createMember, setCreateMember] = useState("");
  const [createArmyType, setCreateArmyType] = useState<"new" | "veteran">("new");
  const [createError, setCreateError] = useState("");

  // Re-runs whenever the session pointer changes (login, logout). A session
  // pointing at a username that isn't in bestofbootcamp (yet, or ever — e.g.
  // a signup that was rejected during promotion) falls back to the
  // login/create panel instead of getting stuck on a broken logged-in view.
  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      if (!session) {
        if (!cancelled) setView({ kind: "loginCreate" });
        return;
      }
      const users = await loadUsers();
      const user = findUser(users, session);
      if (cancelled) return;
      if (user) {
        setView({ kind: "loggedIn", user });
      } else {
        clearSession();
        setView({ kind: "loginCreate" });
      }
    }
    resolve();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");

    const users = await loadUsers();
    const user = findUser(users, loginUsername);
    if (!user) {
      setLoginError("No profile with that username.");
      return;
    }
    if (!verifyPin(user, loginPin)) {
      setLoginError("Incorrect PIN.");
      return;
    }

    setSession(user.username);

    // A comment typed while logged out (see CommentSidebar's Enter handler)
    // is saved as a draft and redirected here. Post it now that login
    // succeeded, then take them back to the video instead of the normal
    // logged-in profile view.
    const draft = consumeDraftComment();
    if (draft) {
      try {
        await createComment({ videoId: draft.videoId, username: user.username, comment: draft.comment });
        // So it shows up as "yours" the moment they land back there,
        // without waiting on promotion + CDN propagation.
        saveLocalComment({ videoId: draft.videoId, username: user.username, comment: draft.comment });
      } catch {
        // Best-effort — if the draft fails to post (e.g. comment now too
        // long), just fall through to the normal logged-in view instead of
        // blocking login on it.
      }
      router.push(`/player?id=${encodeURIComponent(draft.videoId)}`);
      return;
    }

    setView({ kind: "loggedIn", user });
  }

  // createUser() only submits the request to the Google Form — it does NOT
  // mean the account exists yet (promotion happens async via GitHub
  // Actions, ~30s-2min later). Don't auto-login here; show the pending
  // state instead so the user isn't told they're in when they aren't.
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    try {
      const user = await createUser({
        username: createUsername,
        pin: createPin,
        favoriteMember: createMember,
        armyType: createArmyType,
      });
      setView({ kind: "pending", username: user.username });
    } catch (err) {
      setCreateError((err as Error).message);
    }
  }

  function handleLogout() {
    clearSession();
  }

  if (view.kind === "loading") return <p>Loading...</p>;

  if (view.kind === "loggedIn") {
    const { user } = view;
    return (
      <div className="max-w-[400px] border border-elevated p-6">
        <h1 className="text-lg">{user.username}</h1>
        <p className="mt-2 text-[13px] text-muted">
          {user.armyType === "veteran" ? "Veteran ARMY" : "New ARMY"} · Bias: {user.favoriteMember || "—"}
        </p>
        <p className="mt-2 text-[13px] text-muted">Joined {user.createdAt}</p>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-4 border border-line-strong bg-transparent px-3.5 py-2.5 text-ink"
        >
          Log out
        </button>
      </div>
    );
  }

  if (view.kind === "pending") {
    return (
      <div className="max-w-[400px] border border-elevated p-6">
        <h1 className="text-lg">Request submitted</h1>
        <p className="mt-2 text-[13px] text-muted">
          Your profile &quot;{view.username}&quot; is being created — this usually takes a minute or two.
        </p>
        <p className="mt-2 text-[13px] text-muted">Try logging in shortly.</p>
        {hasDraftComment() && (
          <p className="mt-2 text-[13px] text-muted">Your comment will post automatically once you log back in.</p>
        )}
        <button
          type="button"
          onClick={() => setView({ kind: "loginCreate" })}
          className="mt-4 border border-line-strong bg-transparent px-3.5 py-2.5 text-ink"
        >
          Back to login
        </button>
      </div>
    );
  }

  return (
    <div className="grid max-w-[640px] grid-cols-1 gap-7 md:grid-cols-2">
      <form onSubmit={handleLogin} className="flex flex-col gap-3 border border-elevated p-5">
        <h2 className="text-sm tracking-[0.08em] text-faint uppercase">Log in</h2>
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          Username
          <input
            type="text"
            required
            value={loginUsername}
            onChange={(e) => setLoginUsername(e.target.value)}
            className="border border-line bg-surface px-3.5 py-2.5 text-[13px] text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          PIN (if set)
          <input
            type="password"
            inputMode="numeric"
            value={loginPin}
            onChange={(e) => setLoginPin(e.target.value)}
            className="border border-line bg-surface px-3.5 py-2.5 text-[13px] text-ink"
          />
        </label>
        <button type="submit" className="bg-ink px-3.5 py-2.5 text-[13px] tracking-[0.05em] text-base uppercase">
          Log in
        </button>
        <p className="min-h-[1em] text-xs text-danger">{loginError}</p>
      </form>

      <form onSubmit={handleCreate} className="flex flex-col gap-3 border border-elevated p-5">
        <h2 className="text-sm tracking-[0.08em] text-faint uppercase">Create a profile</h2>
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          Username
          <input
            type="text"
            required
            value={createUsername}
            onChange={(e) => setCreateUsername(e.target.value)}
            className="border border-line bg-surface px-3.5 py-2.5 text-[13px] text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          PIN (optional)
          <input
            type="password"
            inputMode="numeric"
            value={createPin}
            onChange={(e) => setCreatePin(e.target.value)}
            className="border border-line bg-surface px-3.5 py-2.5 text-[13px] text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          Favorite member
          <select
            value={createMember}
            onChange={(e) => setCreateMember(e.target.value)}
            className="border border-line bg-surface px-3.5 py-2.5 text-[13px] text-ink"
          >
            <option value="">—</option>
            {MEMBERS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          ARMY status
          <select
            value={createArmyType}
            onChange={(e) => setCreateArmyType(e.target.value as "new" | "veteran")}
            className="border border-line bg-surface px-3.5 py-2.5 text-[13px] text-ink"
          >
            <option value="new">New ARMY</option>
            <option value="veteran">Veteran ARMY</option>
          </select>
        </label>
        <button type="submit" className="bg-ink px-3.5 py-2.5 text-[13px] tracking-[0.05em] text-base uppercase">
          Create profile
        </button>
        <p className="min-h-[1em] text-xs text-danger">{createError}</p>
      </form>
    </div>
  );
}
