import { Suspense } from "react";
import { BrowseClient } from "@/components/Browse/BrowseClient";

export default function BrowsePage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <BrowseClient />
    </Suspense>
  );
}
