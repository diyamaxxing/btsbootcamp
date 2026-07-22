import Link from "next/link";
import { fmtViews } from "@/lib/format";
import type { Video } from "@/lib/types";

interface CardProps {
  video: Video;
  /** Player recommendation cards use the YouTube-hosted thumbnail (ytId-derived), not v.thumbnail. */
  thumbnail?: string;
  /** "rail" = fixed-width card inside a horizontal carousel; "grid" = browse results grid. */
  variant?: "rail" | "grid";
}

export function Card({ video, thumbnail, variant = "rail" }: CardProps) {
  const meta = [video.era, fmtViews(video.view_count) ? `${fmtViews(video.view_count)} views` : ""]
    .filter(Boolean)
    .join(" · ");
  const src = thumbnail ?? video.thumbnail;

  return (
    <Link
      href={`/player?id=${encodeURIComponent(video.id)}`}
      className={`block text-ink no-underline ${variant === "rail" ? "w-[200px] flex-none" : ""}`}
    >
      <img
        src={src}
        alt={video.title}
        loading="lazy"
        className={`block bg-elevated object-cover ${variant === "rail" ? "h-[112px] w-[200px]" : "aspect-video w-full"}`}
      />
      <p className="mt-1.5 line-clamp-2 text-xs leading-[1.4]">{video.title}</p>
      {meta && <p className="mt-[3px] text-[11px] text-faint-2">{meta}</p>}
    </Link>
  );
}
