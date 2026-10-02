/**
 * Slugs of the learn modules, in order. The module text lives in the database (see the Phase 5
 * content migration); the slugs are listed here so the pages can be built ahead of time and kept
 * for offline use. A test keeps this list in step with the migration.
 */
export const LEARN_SLUGS = [
  "budget-basics",
  "needs-vs-wants",
  "emergency-fund",
  "save-small",
  "mobile-money-safety",
  "irregular-income",
  "goals-that-stick",
  "borrowing-basics",
] as const;
