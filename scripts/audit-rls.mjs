// Security audit of the local database: run `pnpm audit:rls` with the local Supabase stack up.
// Exits non-zero if any public table lacks row level security, anon can touch private data,
// or a security definer function is callable by anon / has no fixed search_path.
import { execFileSync } from "node:child_process";

const CONTAINER = process.env.AUDIT_DB_CONTAINER ?? "supabase_db_upay-compass";
const psql = (q) =>
  execFileSync("docker", ["exec", CONTAINER, "psql", "-U", "postgres", "-At", "-F", "|", "-c", q])
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split("|"));

// Tables meant to be readable before login (reference data) — everything else must be closed to anon.
const ANON_READABLE = new Set(["categories"]);
let failed = false;
const fail = (m) => {
  failed = true;
  console.log("✗", m);
};

const tables = psql(
  "select c.relname, c.relrowsecurity, (select count(*) from pg_policy p where p.polrelid=c.oid) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 1",
);
console.log(`Tables in public: ${tables.length}`);
for (const [name, rls, policies] of tables) {
  if (rls !== "t") fail(`RLS is OFF on ${name}`);
  else console.log(`✓ ${name}: RLS on, ${policies} polic${policies === "1" ? "y" : "ies"}`);
}

const anonGrants = psql(
  "select table_name, string_agg(privilege_type, ',') from information_schema.role_table_grants where table_schema='public' and grantee='anon' group by 1 order by 1",
);
for (const [name, privs] of anonGrants) {
  if (!ANON_READABLE.has(name) || privs !== "SELECT") fail(`anon has ${privs} on ${name}`);
  else console.log(`✓ anon may only read the public reference table ${name}`);
}
if (anonGrants.length === 0) console.log("✓ anon has no table grants");

const funcs = psql(
  "select p.proname, p.prosecdef, coalesce(array_to_string(p.proconfig, ','),''), has_function_privilege('anon', p.oid, 'execute'), has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 1",
);
console.log(`Functions in public: ${funcs.length}`);
for (const [name, definer, config, anon, authed] of funcs) {
  if (definer === "t" && !/search_path/.test(config))
    fail(`security definer ${name} has no fixed search_path`);
  if (definer === "t" && anon === "t") fail(`security definer ${name} is callable by anon`);
  if (definer === "t" && authed === "t")
    console.log(`  · ${name}: definer, callable by signed-in users (checks auth.uid() inside)`);
}

// Column-level: users must not be able to write server-controlled profile columns.
const profileCols = psql(
  "select column_name from information_schema.column_privileges where table_schema='public' and table_name='profiles' and grantee='authenticated' and privilege_type='UPDATE' order by 1",
).map((r) => r[0]);
const forbidden = [
  "id",
  "phone",
  "role",
  "opening_balance",
  "roundup_enabled",
  "roundup_goal_id",
].filter((c) => profileCols.includes(c));
if (forbidden.length)
  fail(`users can update server-controlled profile columns: ${forbidden.join(", ")}`);
else console.log(`✓ users can update only: ${profileCols.join(", ")}`);

console.log(failed ? "\nAUDIT FAILED" : "\nAUDIT PASSED");
process.exit(failed ? 1 : 0);
