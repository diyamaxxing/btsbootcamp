import type { Video } from "@/lib/types";
import { fmtHours } from "@/lib/format";

// Replaces the old mainmuster.html #stats-bar, which was dead markup (its
// CSS even targeted the wrong selector, #stats vs #stats-bar) carried
// through the Next.js migration as an empty placeholder. This is a real
// implementation, deliberately scoped to just the two headline numbers
// (#12) rather than every stat the old markup implied.
export function StatsBar({ videos }: { videos: Video[] }) {
  const totalSec = videos.reduce((sum, v) => sum + (v.duration_sec || 0), 0);

  return (
    <div className="mb-8 flex gap-8 border-b border-elevated pb-6">
      <div>
        <p className="text-2xl text-ink">{videos.length.toLocaleString()}</p>
        <p className="text-[11px] tracking-[0.1em] text-faint-2 uppercase">Videos</p>
      </div>
      <div>
        <p className="text-2xl text-ink">{fmtHours(totalSec)}</p>
        <p className="text-[11px] tracking-[0.1em] text-faint-2 uppercase">Total Runtime</p>
      </div>
    </div>
  );
}
