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

// Tables only the server writes: signed-in users may read them and nothing else. Personalized
// learn modules (Phase 12) change only through update_personalized_module(), so the generated
// content and its facts cannot be edited from the browser.
const SERVER_WRITTEN = ["personalized_modules"];
for (const table of SERVER_WRITTEN) {
  const privs = psql(
    `select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where table_schema='public' and table_name='${table}' and grantee='authenticated'`,
  )[0]?.[0];
  if (privs !== "SELECT")
    fail(`authenticated has ${privs ?? "nothing"} on ${table}, expected SELECT only`);
  else console.log(`✓ signed-in users can only read ${table}`);
}

// Monitoring (model_events) holds no content but is still operator-only: no policies and no
// grants for the browser roles, so only Edge Functions (service role) write it and only
// system_health() (security definer, aggregates only) reads it.
const NO_CLIENT_ACCESS = ["model_events"];
for (const table of NO_CLIENT_ACCESS) {
  const privs = psql(
    `select string_agg(grantee || ':' || privilege_type, ',') from information_schema.role_table_grants where table_schema='public' and table_name='${table}' and grantee in ('anon','authenticated')`,
  )[0]?.[0];
  const policies = psql(
    `select count(*) from pg_policy p join pg_class c on c.oid=p.polrelid where c.relname='${table}'`,
  )[0]?.[0];
  if (privs) fail(`browser roles have grants on ${table}: ${privs}`);
  else if (policies !== "0") fail(`${table} has ${policies} policies, expected none`);
  else console.log(`✓ ${table}: no policies and no anon/authenticated grants`);
}
for (const fnName of ["purge_model_events", "purge_expired_data"]) {
  const purge = psql(
    `select has_function_privilege('anon','public.${fnName}()','execute'), has_function_privilege('authenticated','public.${fnName}()','execute')`,
  )[0];
  if (purge && purge.some((v) => v === "t")) fail(`${fnName}() is callable by browser roles`);
  else console.log(`✓ ${fnName}() is not callable by browser roles`);
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
