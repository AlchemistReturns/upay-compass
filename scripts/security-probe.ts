// Security probe against the LOCAL Supabase stack. Run: pnpm security:probe
// Needs the local stack with the functions served (pnpm sb start; pnpm sb functions serve ...), and
//   RLS_TEST_URL=http://127.0.0.1:54321 RLS_TEST_ANON_KEY=<anon> RLS_TEST_SERVICE_KEY=<service_role>
// (values from `pnpm sb status -o env`). It refuses to run against anything but localhost.
// Test users: the local phone numbers +8801700000003 and +8801700000004 (OTP 123456).
// Prints PASS / FAIL per check and exits non-zero if any check fails.
import { createHmac } from "node:crypto";
import { readdirSync } from "node:fs";

const URL_ = process.env.RLS_TEST_URL ?? "";
const ANON = process.env.RLS_TEST_ANON_KEY ?? "";
const SERVICE = process.env.RLS_TEST_SERVICE_KEY ?? "";
if (!URL_ || !ANON || !SERVICE) {
  console.error("Set RLS_TEST_URL, RLS_TEST_ANON_KEY and RLS_TEST_SERVICE_KEY (local stack only).");
  process.exit(2);
}
const host = new globalThis.URL(URL_).hostname;
if (host !== "127.0.0.1" && host !== "localhost") {
  console.error(`Refusing to probe ${host}: this script only runs against the local stack.`);
  process.exit(2);
}

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `  -> ${detail}` : ""}`);
}

type Res = { status: number; body: any };
async function http(
  method: string,
  path: string,
  token: string | null,
  body?: unknown,
  extra: Record<string, string> = {},
  raw = false,
): Promise<Res> {
  const headers: Record<string, string> = { apikey: ANON, ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined && !raw) headers["Content-Type"] = "application/json";
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : raw ? (body as BodyInit) : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: res.status, body: parsed };
}
const fn = (name: string, token: string | null, body?: unknown, raw = false, extra = {}) =>
  http("POST", `/functions/v1/${name}`, token, body, extra, raw);
const rest = (method: string, path: string, token: string, body?: unknown) =>
  http(method, `/rest/v1/${path}`, token, body, { Prefer: "return=representation" });
const rpc = (name: string, token: string | null, args: unknown = {}) =>
  http("POST", `/rest/v1/rpc/${name}`, token, args);
const svc = (method: string, path: string, body?: unknown) =>
  http(method, `/rest/v1/${path}`, SERVICE, body, { Prefer: "return=representation" });

async function signIn(phone: string): Promise<{ token: string; id: string }> {
  let sent = await http("POST", "/auth/v1/otp", null, { phone });
  if (sent.status === 429) {
    await new Promise((r) => setTimeout(r, 5500));
    sent = await http("POST", "/auth/v1/otp", null, { phone });
  }
  const v = await http("POST", "/auth/v1/verify", null, { type: "sms", phone, token: "123456" });
  if (!v.body?.access_token)
    throw new Error(`sign-in failed for ${phone}: ${JSON.stringify(v.body)}`);
  return { token: v.body.access_token, id: v.body.user.id };
}

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
function forgedJwt(sub: string, secret: string) {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const payload = b64({ sub, role: "authenticated", aud: "authenticated", exp: 4_000_000_000 });
  const sig = createHmac("sha256", secret).update(`${head}.${payload}`).digest("base64url");
  return `${head}.${payload}.${sig}`;
}

const A = await signIn("+8801700000003");
const B = await signIn("+8801700000004");
const clearLimits = () => svc("DELETE", `audit_log?entity=eq.limit&user_id=in.(${A.id},${B.id})`);
await clearLimits();

// ---------------------------------------------------------------------------------------------
console.log("\n== 1. Every Edge Function rejects missing, invalid and forged tokens");
const functions = readdirSync("supabase/functions", { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
  .map((d) => d.name);
for (const name of functions) {
  const none = await fn(name, null, {});
  const garbage = await fn(name, "not-a-jwt", {});
  const forged = await fn(name, forgedJwt(A.id, "a-secret-the-server-does-not-use"), {});
  const anonKey = await fn(name, ANON, {});
  check(`${name}: no Authorization header -> 401`, none.status === 401, `got ${none.status}`);
  check(`${name}: garbage token -> 401`, garbage.status === 401, `got ${garbage.status}`);
  check(
    `${name}: token signed with the wrong secret -> 401`,
    forged.status === 401,
    `got ${forged.status}`,
  );
  check(
    `${name}: anon key used as a user token -> 401`,
    anonKey.status === 401,
    `got ${anonKey.status}`,
  );
}

// ---------------------------------------------------------------------------------------------
console.log("\n== 2. User A cannot read or write user B's rows through the REST API");
const defs = await http("GET", "/rest/v1/", SERVICE);
const tables = Object.keys(defs.body?.definitions ?? {}).sort();
check("table list discovered from the API", tables.length > 10, `found ${tables.length}`);

// give B a row in the tables people can write, and some server-written rows
const bGoal = (
  await svc("POST", "goals", { user_id: B.id, title: "probe-b-goal", target_amount: 100 })
).body[0];
await svc("POST", "budgets", { user_id: B.id, category_id: 1, limit_amount: 500 });
await svc("POST", "transactions", {
  user_id: B.id,
  amount: 70,
  direction: "out",
  channel: "merchant",
  counterparty: "ProbeShop",
  occurred_at: new Date().toISOString(),
});
const bMessage = (
  await svc("POST", "coach_messages", {
    user_id: B.id,
    role: "assistant",
    content: "probe-b-secret",
  })
).body[0];
await svc("POST", "category_rules", { user_id: B.id, keyword: "probe", category_id: 1 });
await svc("POST", "savings_entries", { user_id: B.id, kind: "deposit", amount: 5 });
await svc("POST", "health_scores", { user_id: B.id, score: 50, breakdown: {} });

const ownerCol = (t: string) =>
  t === "profiles" ? "id" : defs.body.definitions[t]?.properties?.user_id ? "user_id" : null;
const SHARED_READ = new Set(["categories", "learn_modules"]);
const count = async (t: string, col: string, id: string) =>
  Number(
    (await http("GET", `/rest/v1/${t}?select=count&${col}=eq.${id}`, SERVICE)).body?.[0]?.count ??
      -1,
  );

for (const t of tables) {
  const col = ownerCol(t);
  const read = await http("GET", `/rest/v1/${t}?select=*&limit=1000`, A.token);
  if (SHARED_READ.has(t)) {
    check(`${t}: shared reference data, read-only for users`, read.status === 200);
    continue;
  }
  const rows: any[] = Array.isArray(read.body) ? read.body : [];
  if (!col) {
    check(
      `${t}: no per-person key; not readable by a user`,
      rows.length === 0,
      `${rows.length} rows`,
    );
    continue;
  }
  const foreign = rows.filter((r) => r[col] !== A.id);
  check(`${t}: A reads only A's rows`, foreign.length === 0, `${foreign.length} foreign rows`);

  const before = await count(t, col, B.id);
  await http("DELETE", `/rest/v1/${t}?${col}=eq.${B.id}`, A.token);
  const sets = col === "id" ? { full_name: "pwned" } : { [col]: B.id };
  await http("PATCH", `/rest/v1/${t}?${col}=eq.${B.id}`, A.token, sets);
  check(
    `${t}: A cannot delete or change B's rows`,
    (await count(t, col, B.id)) === before,
    `rows before ${before}`,
  );
}
const bProfile = (await svc("GET", `profiles?id=eq.${B.id}&select=full_name`)).body[0];
check("profiles: B's name was not changed by A", bProfile?.full_name !== "pwned");

const writes: [string, object][] = [
  ["goals", { user_id: B.id, title: "forged", target_amount: 1 }],
  ["budgets", { user_id: B.id, category_id: 2, limit_amount: 1 }],
  [
    "transactions",
    {
      user_id: B.id,
      amount: 1,
      direction: "out",
      channel: "merchant",
      counterparty: "forged",
      occurred_at: new Date().toISOString(),
    },
  ],
  ["category_rules", { user_id: B.id, keyword: "forged", category_id: 1 }],
  ["audit_log", { user_id: B.id, action: "forged" }],
];
for (const [t, row] of writes) {
  const r = await rest("POST", t, A.token, row);
  check(
    `${t}: A cannot insert a row owned by B (row level security, 401/403)`,
    r.status === 401 || r.status === 403,
    `status ${r.status}`,
  );
}
const forgedLeft = await svc("GET", "audit_log?action=eq.forged&select=id");
check("no forged audit row exists", (forgedLeft.body as any[]).length === 0);

// ---------------------------------------------------------------------------------------------
console.log("\n== 3. Cross-user ids in function inputs are rejected");
const speak = await fn("voice-speak", A.token, { message_id: bMessage.id, language: "en" });
check("voice-speak with B's coach message id -> 404", speak.status === 404, `got ${speak.status}`);
const bTx = (await svc("GET", `transactions?user_id=eq.${B.id}&select=id,category_source`)).body[0];
const cat = await fn("categorize-transaction", A.token, { transaction_ids: [bTx.id] });
const bTxAfter = (
  await svc("GET", `transactions?id=eq.${bTx.id}&select=category_source,category_id`)
).body[0];
check(
  "categorize-transaction with B's transaction id leaves it untouched",
  cat.status < 500 && bTxAfter.category_source === bTx.category_source,
  `status ${cat.status}`,
);
const seed = await fn("seed-demo", A.token, {});
check("seed-demo as a non-admin -> 403", seed.status === 403, `got ${seed.status}`);
const del = await fn("delete-account", A.token, { pin: "0000", confirm: true, user_id: B.id });
const stillB = await svc("GET", `profiles?id=eq.${B.id}&select=id`);
check(
  "delete-account ignores a user id in the body (B still exists)",
  (stillB.body as any[]).length === 1 && del.status !== 200,
  `status ${del.status}`,
);

// ---------------------------------------------------------------------------------------------
console.log("\n== 4. PIN lockout and attempt limit");
await svc("DELETE", `user_pins?user_id=eq.${A.id}`);
await rpc("set_pin", A.token, { new_pin: "4321" });
const wrong = async () => (await rpc("verify_pin", A.token, { pin: "9999" })).body;
const endWait = () =>
  svc("PATCH", `user_pins?user_id=eq.${A.id}`, {
    locked_until: new Date(Date.now() - 1000).toISOString(),
  });
const w1 = await wrong();
const w2 = await wrong();
check("wrong tries 1 and 2 are free", w1.locked_seconds === 0 && w2.locked_seconds === 0);
const w3 = await wrong();
check("3rd wrong try starts a wait", w3.locked_seconds > 0 && !w3.reset, JSON.stringify(w3));
const during = (await rpc("verify_pin", A.token, { pin: "4321" })).body;
check(
  "during the wait even the right PIN is refused",
  during.ok === false && during.locked_seconds > 0,
);
let last = w3;
let tries = 3;
while (!last.reset && tries < 12) {
  await endWait();
  last = await wrong();
  tries++;
}
check(
  "PIN is cleared on the 8th wrong try",
  last.reset === true && tries === 8,
  `after ${tries} tries`,
);
check("after clearing, the account has no PIN", (await rpc("has_pin", A.token)).body === false);
const noRead = await http("GET", "/rest/v1/user_pins?select=*", A.token);
check(
  "user_pins is not readable by a user",
  noRead.status >= 400 || (noRead.body as any[]).length === 0,
);
const noReadAnon = await http("GET", "/rest/v1/user_pins?select=*", ANON);
check(
  "user_pins is not readable with the anon key",
  noReadAnon.status >= 400 || noReadAnon.body.length === 0,
);

// ---------------------------------------------------------------------------------------------
console.log("\n== 5. Rate limits return 429 past the limit");
await clearLimits();
const exportCodes: number[] = [];
for (let i = 0; i < 6; i++) exportCodes.push((await fn("export-my-data", A.token, {})).status);
check(
  "export-my-data: 5 allowed per hour, the 6th is 429",
  exportCodes.slice(0, 5).every((c) => c === 200) && exportCodes[5] === 429,
  exportCodes.join(","),
);
await svc("PATCH", `profiles?id=eq.${A.id}`, { coach_consent_at: null });
const coachCodes: number[] = [];
for (let i = 0; i < 21; i++)
  coachCodes.push((await fn("coach-chat", A.token, { message: "hi" })).status);
check(
  "coach-chat: 20 per 10 minutes, the 21st is 429",
  coachCodes.slice(0, 20).every((c) => c !== 429) && coachCodes[20] === 429,
  coachCodes.join(","),
);
await clearLimits();
const delCodes: number[] = [];
for (let i = 0; i < 6; i++)
  delCodes.push((await fn("delete-account", A.token, { pin: "1234", confirm: true })).status);
check("delete-account: the 6th attempt in an hour is 429", delCodes[5] === 429, delCodes.join(","));
await clearLimits();

// ---------------------------------------------------------------------------------------------
console.log("\n== 6. The anon key cannot reach admin-only or internal functions");
for (const name of [
  "admin_insights",
  "system_health",
  "purge_expired_data",
  "purge_model_events",
  "reset_demo",
  "community_insights",
]) {
  const r = await rpc(name, ANON, name === "system_health" ? { p_hours: 24 } : {});
  check(`rpc ${name} with the anon key is refused`, r.status >= 400, `status ${r.status}`);
}
for (const name of ["admin_insights", "purge_expired_data", "purge_model_events"]) {
  const r = await rpc(name, A.token, {});
  check(`rpc ${name} as a signed-in non-admin is refused`, r.status >= 400, `status ${r.status}`);
}
const anonTables = await Promise.all(
  tables
    .filter((t) => !SHARED_READ.has(t))
    .map(async (t) => [t, await http("GET", `/rest/v1/${t}?select=*&limit=1`, ANON)] as const),
);
for (const [t, r] of anonTables) {
  check(
    `${t}: anon key reads nothing`,
    r.status >= 400 || (Array.isArray(r.body) && r.body.length === 0),
  );
}

// ---------------------------------------------------------------------------------------------
console.log("\n== 7. Voice and coach functions reject oversized or malformed bodies");
await svc("PATCH", `profiles?id=eq.${A.id}`, {
  voice_consent_at: new Date().toISOString(),
  coach_consent_at: null,
});
await clearLimits();
const big = (n: number) => "a".repeat(n);
const cases: [string, string, unknown, number[], boolean?][] = [
  ["coach-chat", "message of 1001 characters", { message: big(1001) }, [400]],
  ["coach-chat", "empty message", { message: "  " }, [400]],
  ["coach-chat", "message that is not a string", { message: { $ne: 1 } }, [400]],
  ["coach-chat", "body that is not JSON", "{not json", [400], true],
  ["coach-chat", "2 MB body", { message: big(2_000_000) }, [400, 413]],
  ["voice-command", "text of 501 characters", { text: big(501) }, [400]],
  ["voice-command", "missing text", {}, [400]],
  ["voice-command", "array instead of object", [1, 2], [400]],
  ["voice-command", "body that is not JSON", "<xml/>", [400], true],
  [
    "voice-speak",
    "message_id that is not a uuid",
    { message_id: "1; drop table", language: "en" },
    [400],
  ],
  ["voice-speak", "unsupported language", { message_id: bMessage.id, language: "fr" }, [400]],
  ["voice-transcribe", "request without audio", "nothing", [400], true],
];
for (const [name, what, body, ok, raw] of cases) {
  const r = await fn(name, A.token, body, Boolean(raw));
  check(`${name}: ${what} -> ${ok.join(" or ")}`, ok.includes(r.status), `got ${r.status}`);
}
// oversized audio: needs the voice consent set above; the size check runs before any OpenAI call
const form = new FormData();
form.append("audio", new Blob([new Uint8Array(1_500_001)], { type: "audio/webm" }), "a.webm");
const tooBig = await fn("voice-transcribe", A.token, form as unknown as BodyInit, true);
check("voice-transcribe: audio over 1.5 MB -> 413", tooBig.status === 413, `got ${tooBig.status}`);
const tiny = new FormData();
tiny.append("audio", new Blob([new Uint8Array(10)], { type: "audio/webm" }), "a.webm");
const tooSmall = await fn("voice-transcribe", A.token, tiny as unknown as BodyInit, true);
check(
  "voice-transcribe: audio under 1 KB -> 400",
  tooSmall.status === 400,
  `got ${tooSmall.status}`,
);

// ---------------------------------------------------------------------------------------------
// tidy up what the probe created
await svc("DELETE", `goals?id=eq.${bGoal.id}`);
await svc("DELETE", `budgets?user_id=eq.${B.id}`);
await svc("DELETE", `transactions?user_id=eq.${B.id}`);
await svc("DELETE", `coach_messages?user_id=eq.${B.id}`);
await svc("DELETE", `category_rules?user_id=eq.${B.id}`);
await svc("DELETE", `savings_entries?user_id=eq.${B.id}`);
await svc("DELETE", `health_scores?user_id=eq.${B.id}`);
await svc("PATCH", `profiles?id=eq.${A.id}`, { voice_consent_at: null });
await clearLimits();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
