import {
  MAX_PERSONAL_TOPICS,
  buildModuleFacts,
  factsChangedMaterially,
  pickPersonalizedTopics,
  type LearnSignals,
  type ModuleFacts,
  type PickedTopic,
} from "./learn-topics.ts";

/**
 * Which "Made for you" modules to show, and which of them must be written (again). Pure: the Edge
 * Function loads the person's stored rows and signals, asks this, then calls the model only for the
 * modules in `generate`.
 */

/** A generated module is written again after this many days, even if nothing changed. */
export const LEARN_MODULE_TTL_DAYS = 7;

export type StoredModuleMeta = {
  id: string;
  topic_id: string;
  facts: ModuleFacts;
  reason_id: string;
  expires_at: string;
  completed_at: string | null;
  dismissed_at: string | null;
};

export type PlannedModule = {
  pick: PickedTopic;
  facts: ModuleFacts;
  /** The stored row to show as it is, or null when the module has to be written. */
  reuse: StoredModuleMeta | null;
  /** A stored row for the same topic that may stand in if writing fails (still unexpired). */
  fallback: StoredModuleMeta | null;
};

export type LearnPlan = {
  /** Picked topics, best first: reused or to be written. */
  modules: PlannedModule[];
  /** Finished modules that have not expired: shown as finished, and they take a slot. */
  finished: StoredModuleMeta[];
};

const fresh = (row: StoredModuleMeta, now: Date) => Date.parse(row.expires_at) > now.getTime();

export function planLearnRefresh(
  signals: LearnSignals,
  stored: StoredModuleMeta[],
  now: Date,
): LearnPlan {
  const finished = stored
    .filter((r) => r.completed_at && !r.dismissed_at && fresh(r, now))
    .sort((a, b) => a.topic_id.localeCompare(b.topic_id));
  const recent = stored.flatMap((r) => {
    const at = [r.completed_at, r.dismissed_at]
      .filter((x): x is string => Boolean(x))
      .sort()
      .at(-1);
    return at ? [{ topicId: r.topic_id, at }] : [];
  });
  const slots = Math.max(0, MAX_PERSONAL_TOPICS - finished.length);
  const picks = pickPersonalizedTopics(signals, recent, now).slice(0, slots);

  const modules = picks.map((pick) => {
    const facts = buildModuleFacts(pick.topic, signals);
    const row = stored.find((r) => r.topic_id === pick.topic.id && !r.dismissed_at) ?? null;
    const usable = row && fresh(row, now) ? row : null;
    // write again when the reason or the facts moved materially ("the top signal changed")
    const reuse =
      usable && usable.reason_id === pick.reason && !factsChangedMaterially(usable.facts, facts)
        ? usable
        : null;
    return { pick, facts, reuse, fallback: reuse ? null : usable };
  });
  return { modules, finished };
}

/** When a module written now should be written again. */
export function moduleExpiry(now: Date): string {
  return new Date(now.getTime() + LEARN_MODULE_TTL_DAYS * 86_400_000).toISOString();
}

/** Calls to generate-learn-modules per person in the window (the app calls it about once an hour). */
export const LEARN_RATE_LIMIT = 6;
export const LEARN_RATE_WINDOW_MINUTES = 60;
