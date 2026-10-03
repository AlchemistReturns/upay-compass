/**
 * Reads the hand-written learn modules out of the Phase 5 content migration text. Used by tests and
 * evaluation scripts to hold generated modules to the same measure as the course; not exported from
 * the package index because the app never needs it.
 */

export type HandWrittenModule = {
  slug: string;
  position: number;
  minutes: number;
  title: { en: string; bn: string };
  summary: { en: string; bn: string };
  body: { en: string; bn: string };
};

const unquote = (s: string) => s.replace(/''/g, "'");

export function parseLearnContentSql(sql: string): HandWrittenModule[] {
  const row =
    /\(\s*'([a-z0-9-]+)', (\d+), \d, (\d+),\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*\$md\$([\s\S]*?)\$md\$,\s*\$md\$([\s\S]*?)\$md\$/g;
  return [...sql.matchAll(row)].map((m) => ({
    slug: m[1]!,
    position: Number(m[2]),
    minutes: Number(m[3]),
    title: { en: unquote(m[4]!), bn: unquote(m[5]!) },
    summary: { en: unquote(m[6]!), bn: unquote(m[7]!) },
    body: { en: m[8]!, bn: m[9]! },
  }));
}
