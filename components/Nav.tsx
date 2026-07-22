"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";

export function Nav() {
  const { session } = useAuth();
  const router = useRouter();
  const [term, setTerm] = useState("");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = term.trim();
    if (!trimmed) return;
    router.push(`/browse?search=${encodeURIComponent(trimmed)}`);
  }

  return (
    <nav className="flex items-center gap-5 border-b border-line px-5 py-3">
      <Link href="/" className="text-sm text-ink no-underline">
        <strong>BTS Bootcamp</strong>
      </Link>
      <Link href="/browse" className="text-sm text-ink no-underline">
        Browse
      </Link>
      <form onSubmit={handleSearch} className="max-w-80 flex-1">
        <input
          type="text"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search videos…"
          className="w-full border border-line bg-surface px-3 py-1.5 text-[13px] text-ink placeholder:text-faint-2"
        />
      </form>
      <Link href="/profile" className="ml-auto text-sm text-ink no-underline">
        {session ?? "Log in"}
      </Link>
    </nav>
  );
}
