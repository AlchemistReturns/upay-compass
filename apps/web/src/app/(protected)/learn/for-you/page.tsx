import { Suspense } from "react";
import { LoadingCards } from "@/components/compass";
import { ForYouView } from "@/features/learn/for-you-view";

/**
 * A "Made for you" lesson: /learn/for-you?id=<id>. One static page for every id, so nothing has to
 * be built per module and the service worker caches a single shell. The id is read in the browser.
 */
export default function Page() {
  return (
    <Suspense fallback={<LoadingCards rows={3} />}>
      <ForYouView />
    </Suspense>
  );
}
