"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { createComment, saveDraftComment, saveLocalComment } from "@/lib/comments";
import { fmtCommentTime } from "@/lib/format";
import type { Comment, PendingComment } from "@/lib/types";

interface CommentSidebarProps {
  videoId: string;
  comments: (Comment | PendingComment)[];
  onPosted: (c: PendingComment) => void;
}

// Wires the comment input. Not logged in: saves the draft and sends the
// visitor to /profile to log in/sign up — the profile page auto-posts it on
// successful login. Logged in: posts for real and shows it optimistically
// at the top of the list via onPosted (promotion isn't instant, same as
// signups).
export function CommentSidebar({ videoId, comments, onPosted }: CommentSidebarProps) {
  const { session } = useAuth();
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [posting, setPosting] = useState(false);

  async function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    if (!value.trim()) return;

    if (!session) {
      saveDraftComment({ videoId, comment: value });
      router.push("/profile");
      return;
    }

    setError("");
    setPosting(true);
    try {
      const trimmed = value.trim();
      await createComment({ videoId, username: session, comment: value });
      // Persisted locally (not just this optimistic insert) so it still
      // shows up as "yours" if the page reloads before promotion + CDN
      // propagation catch up — see lib/comments.ts's local-echo comment.
      saveLocalComment({ videoId, username: session, comment: trimmed });
      setValue("");
      onPosted({ video_id: videoId, username: session, comment: trimmed, pending: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPosting(false);
    }
  }

  return (
    <aside className="scroll-thin-comments flex max-h-[300px] min-w-0 flex-col gap-3 overflow-y-auto border border-elevated p-4 md:max-h-none">
      <h2 className="text-xs tracking-[0.08em] text-faint uppercase">Comments</h2>
      <div className="flex">
        <input
          type="text"
          value={value}
          disabled={posting}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={session ? "Add a comment…" : "Log in to comment…"}
          className="flex-1 border border-line bg-surface px-3.5 py-2.5 text-[13px] text-ink-dim placeholder:text-faint-2 disabled:cursor-not-allowed disabled:text-faint-2"
        />
      </div>
      <p className="min-h-[1em] text-xs text-danger">{error}</p>
      <div>
        {comments.length === 0 ? (
          <p className="py-2 text-[13px] text-ghost">Be the first to comment.</p>
        ) : (
          comments.map((c, i) => {
            const isPending = "pending" in c && c.pending;
            return (
              <div key={i} className="border-t border-elevated py-2.5 first:border-t-0">
                <p className="text-xs font-semibold text-ink-dim">{c.username}</p>
                <p className="mt-0.5 text-[13px] leading-[1.4] break-words text-ink-dim">{c.comment}</p>
                <p className={`mt-1 text-[11px] ${isPending ? "text-pending" : "text-faint-2"}`}>
                  {isPending ? "Posting…" : fmtCommentTime((c as Comment).posted_at)}
                </p>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
