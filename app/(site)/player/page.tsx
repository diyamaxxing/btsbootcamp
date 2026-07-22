import { Suspense } from "react";
import { PlayerClient } from "@/components/Player/PlayerClient";

export default function PlayerPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <PlayerClient />
    </Suspense>
  );
}
