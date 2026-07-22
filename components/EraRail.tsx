import Link from "next/link";
import type { Era, Video } from "@/lib/types";

interface EraRailProps {
  eras: Era[];
  videos: Video[];
  mode: "link" | "toggle";
  /** toggle mode only — the currently-selected era (eraFrom === eraTo === this) */
  selectedEra?: string | null;
  /** toggle mode only */
  onToggle?: (eraName: string) => void;
}

// eraFrom and eraTo are set to the SAME era to express "just this one era"
// using the browse page's range-filter params, rather than adding a
// separate single-era query param it would also need to support.
export function EraRail({ eras, videos, mode, selectedEra, onToggle }: EraRailProps) {
  const active = videos.filter((v) => v.status === "active");
  const withCounts = eras
    .map((era) => ({ era, count: active.filter((v) => v.era === era.name).length }))
    .filter(({ count }) => count > 0);

  return (
    <div className="scroll-thin-era mb-5 flex gap-2 overflow-x-auto pb-1.5">
      {withCounts.map(({ era, count }) =>
        mode === "link" ? (
          <Link
            key={era.id}
            href={`/browse?eraFrom=${encodeURIComponent(era.name)}&eraTo=${encodeURIComponent(era.name)}`}
            className="flex flex-none items-center gap-1.5 border border-line-soft bg-surface px-3 py-[5px] text-xs whitespace-nowrap text-ink-dim hover:border-line-hover hover:text-ink"
          >
            {era.name}
            <span className="text-[10px] text-faint-2">{count}</span>
          </Link>
        ) : (
          <button
            key={era.id}
            type="button"
            onClick={() => onToggle?.(era.name)}
            className={`flex flex-none items-center gap-1.5 border px-3 py-[5px] text-xs whitespace-nowrap ${
              selectedEra === era.name
                ? "border-ink bg-elevated text-ink"
                : "border-line-soft bg-surface text-ink-dim hover:border-line-hover hover:text-ink"
            }`}
          >
            {era.name}
            <span className={`text-[10px] ${selectedEra === era.name ? "text-muted-2" : "text-faint-2"}`}>
              {count}
            </span>
          </button>
        )
      )}
    </div>
  );
}
