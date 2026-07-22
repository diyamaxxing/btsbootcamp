import type { Video } from "@/lib/types";
import { Card } from "./Card";

interface CarouselProps {
  title: string;
  videos: Video[];
  count?: number; // shown next to the title when it differs from videos.length (e.g. mainmuster's full-type counts)
  disclaimer?: string;
  /** Player recommendation cards need a YouTube-derived thumbnail per video, keyed by video.id. */
  thumbnailFor?: (video: Video) => string;
}

export function Carousel({ title, videos, count, disclaimer, thumbnailFor }: CarouselProps) {
  if (!videos.length) return null;

  return (
    <section className="mb-10">
      <h2 className="mb-2.5 text-base tracking-wide text-faint-2 uppercase">
        {title}
        <span className="ml-1.5 text-xs font-normal text-faint-2">{count ?? videos.length}</span>
      </h2>
      {disclaimer && <p className="mb-2.5 text-[11px] text-faint-2 italic">{disclaimer}</p>}
      <div className="scroll-thin-rail flex gap-3 overflow-x-auto pb-2">
        {videos.map((v) => (
          <Card key={v.id} video={v} thumbnail={thumbnailFor?.(v)} variant="rail" />
        ))}
      </div>
    </section>
  );
}
