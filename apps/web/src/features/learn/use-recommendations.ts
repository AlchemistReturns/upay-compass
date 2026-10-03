import { useMemo } from "react";
import { rankModules, type LearnReason } from "@compass/shared";
import { useHealthSnapshots } from "@/features/health/use-health";
import { useNudges } from "@/features/nudges/use-nudges";
import { useCompletedModules, useModules, type LearnModule } from "./use-learn";

export type Recommendation = { mod: LearnModule; reason: LearnReason };

/**
 * Unfinished modules, best first, each with the reason it is recommended. The ranking is a pure
 * function in `@compass/shared` (weakest health component, unread alerts, course order).
 */
export function useRecommendations(): { items: Recommendation[]; isPending: boolean } {
  const modules = useModules();
  const completed = useCompletedModules();
  const snapshots = useHealthSnapshots();
  const nudges = useNudges();

  const items = useMemo(() => {
    if (!modules.data || !completed.data) return [];
    const bySlug = new Map(modules.data.map((m) => [m.slug, m]));
    const doneSlugs = new Set(
      modules.data.filter((m) => completed.data.has(m.id)).map((m) => m.slug),
    );
    const ranked = rankModules({
      health: snapshots.data?.[0]?.breakdown ?? null,
      activeNudges: (nudges.data ?? []).filter((n) => !n.read).map((n) => n.type),
      completed: doneSlugs,
    });
    return ranked.flatMap((r) => {
      const mod = bySlug.get(r.slug);
      return mod && r.reason !== "done" ? [{ mod, reason: r.reason }] : [];
    });
  }, [modules.data, completed.data, snapshots.data, nudges.data]);

  return { items, isPending: modules.isPending || completed.isPending };
}
