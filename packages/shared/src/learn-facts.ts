/**
 * Vetted Bangladesh-specific facts that a generated learn module may state (DPS terms, fees, rates,
 * regulations, festival dates). This is the ONLY place such a fact can come from: the model is
 * never trusted to know them, and everything else in a generated module stays concept-level.
 *
 * Rules for adding an entry:
 *   - It must come from an official source (Bangladesh Bank, a ministry, the provider's own
 *     published tariff), linked in `url`, with the day it was checked.
 *   - If it cannot be verified from an official source, it does not go in.
 *   - Write it in both languages, short and plain. Any number in it may then appear in a module.
 *   - Re-check entries before a release; a stale fee is worse than none.
 *
 * It starts empty on purpose: nothing has been verified yet (see docs/PROJECT_STATE.md).
 */

export type VettedFact = {
  id: string;
  /** Topic ids (learn-topics.ts) the fact may be used in. */
  topics: readonly string[];
  en: string;
  bn: string;
  source: string;
  url: string;
  /** "YYYY-MM-DD" */
  checkedOn: string;
};

export const LEARN_FACT_SHEET: readonly VettedFact[] = [];

/** The vetted facts a topic may use. */
export function vettedFactsFor(topicId: string): VettedFact[] {
  return LEARN_FACT_SHEET.filter((f) => f.topics.includes(topicId));
}
