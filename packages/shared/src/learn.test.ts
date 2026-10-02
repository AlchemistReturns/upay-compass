import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LEARN_SLUGS } from "./learn";

const migration = fileURLToPath(
  new URL("../../../supabase/migrations/20261003090100_phase5_learn_content.sql", import.meta.url),
);

describe("learn modules", () => {
  const sql = readFileSync(migration, "utf8");
  const slugs = [...sql.matchAll(/^\s*'([a-z0-9-]+)', (\d+), \d, \d,/gm)];

  it("LEARN_SLUGS matches the modules seeded by the migration, in order", () => {
    expect(slugs.map((m) => m[1])).toEqual([...LEARN_SLUGS]);
    expect(slugs.map((m) => Number(m[2]))).toEqual(LEARN_SLUGS.map((_, i) => i + 1));
  });

  it("every module has English and Bangla text (Bangla script present)", () => {
    const bodies = [...sql.matchAll(/\$md\$([\s\S]*?)\$md\$/g)].map((m) => m[1]);
    expect(bodies).toHaveLength(LEARN_SLUGS.length * 2);
    bodies.forEach((body = "", i) => {
      // Bangla letters only: the taka sign (U+09F3) also appears in English text
      const hasBangla = /[অ-হ]/.test(body);
      expect(hasBangla, `body ${i} should be ${i % 2 ? "Bangla" : "English"}`).toBe(i % 2 === 1);
    });
  });
});
