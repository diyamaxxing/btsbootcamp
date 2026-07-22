import Link from "next/link";
import type { Video } from "@/lib/types";

export function Hero({ video }: { video: Video }) {
  return (
    <section className="relative mb-8">
      <Link href={`/player?id=${encodeURIComponent(video.id)}`} className="relative block no-underline">
        <img
          src={video.thumbnail}
          alt={video.title}
          className="block max-h-[360px] w-full bg-elevated object-cover"
        />
        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/90 to-transparent px-6 pt-10 pb-5">
          <p className="mb-1.5 text-[11px] tracking-[0.1em] text-ink-dim uppercase">
            {video.type}
            {video.era ? ` · ${video.era}` : ""}
          </p>
          <h2 className="mb-1.5 text-[22px] text-ink">{video.title}</h2>
          <p className="text-xs text-muted-2">
            {(video.view_count || 0).toLocaleString()} views · {(video.like_count || 0).toLocaleString()} likes
          </p>
        </div>
      </Link>
    </section>
  );
}
