// Small load test against the LOCAL Supabase stack. Run: pnpm load:test
// Needs the local stack with functions served and RLS_TEST_URL / RLS_TEST_ANON_KEY (pnpm sb status -o env).
// Measures (1) ingestion through reset-demo (wipe + load a persona's history + score refresh) with
// 1, 3 and 6 people at once, and (2) the main read paths at 1, 10, 50 and 100 concurrent requests.
// Prints a markdown report. Refuses any host but localhost. Numbers describe THIS machine only.
import os from "node:os";

const URL_ = process.env.RLS_TEST_URL ?? "";
const ANON = process.env.RLS_TEST_ANON_KEY ?? "";
if (!URL_ || !ANON) {
  console.error("Set RLS_TEST_URL and RLS_TEST_ANON_KEY (local stack only).");
  process.exit(2);
}
const host = new globalThis.URL(URL_).hostname;
if (host !== "127.0.0.1" && host !== "localhost") {
  console.error(`Refusing to run against ${host}: local stack only.`);
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function signIn(phone) {
  const h = { apikey: ANON, "Content-Type": "application/json" };
  let r = await fetch(`${URL_}/auth/v1/otp`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ phone }),
  });
  if (r.status === 429) {
    await sleep(5500);
    r = await fetch(`${URL_}/auth/v1/otp`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ phone }),
    });
  }
  const v = await (
    await fetch(`${URL_}/auth/v1/verify`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ type: "sms", phone, token: "123456" }),
    })
  ).json();
  if (!v.access_token) throw new Error(`sign-in failed for ${phone}`);
  return v.access_token;
}

const pct = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
const ms = (n) => `${Math.round(n)}`;

async function timed(fn) {
  const t0 = performance.now();
  let ok = false;
  let body = null;
  try {
    const res = await fn();
    ok = res.ok;
    body = await res.json().catch(() => null);
  } catch {
    ok = false;
  }
  return { ms: performance.now() - t0, ok, body };
}

const phones = ["01", "02", "03", "04", "05", "06"].map((n) => `+88017000000${n}`);
const tokens = [];
for (const p of phones) tokens.push(await signIn(p));

const H = (t) => ({
  apikey: ANON,
  Authorization: `Bearer ${t}`,
  "Content-Type": "application/json",
});
const personas = ["student", "gig", "salaried"];

// ---- 1. ingestion
const ingestRows = [];
for (const n of [1, 3, 6]) {
  const t0 = performance.now();
  const results = await Promise.all(
    tokens.slice(0, n).map((t, i) =>
      timed(() =>
        fetch(`${URL_}/functions/v1/reset-demo`, {
          method: "POST",
          headers: H(t),
          body: JSON.stringify({ persona: personas[i % 3] }),
        }),
      ),
    ),
  );
  const wall = (performance.now() - t0) / 1000;
  const inserted = results.reduce((a, r) => a + (r.body?.inserted ?? 0), 0);
  const lat = results.map((r) => r.ms).sort((a, b) => a - b);
  ingestRows.push({
    n,
    ok: results.filter((r) => r.ok).length,
    inserted,
    wall,
    perSec: inserted / wall,
    p50: pct(lat, 50),
    max: lat[lat.length - 1],
  });
}

// ---- 2. read paths
const now = new Date();
const from = new Date(now.getTime() - 30 * 86400000).toISOString();
const reads = {
  "transactions list (REST, 50 rows)": (t) =>
    fetch(
      `${URL_}/rest/v1/transactions?select=id,amount,counterparty,occurred_at&order=occurred_at.desc&limit=50`,
      { headers: H(t) },
    ),
  "dashboard_summary (RPC)": (t) =>
    fetch(`${URL_}/rest/v1/rpc/dashboard_summary`, {
      method: "POST",
      headers: H(t),
      body: JSON.stringify({ p_from: from, p_to: now.toISOString() }),
    }),
  "spend_by_category (RPC)": (t) =>
    fetch(`${URL_}/rest/v1/rpc/spend_by_category`, {
      method: "POST",
      headers: H(t),
      body: JSON.stringify({ p_from: from, p_to: now.toISOString() }),
    }),
};
const readRows = [];
for (const [name, call] of Object.entries(reads)) {
  for (const c of [1, 10, 50, 100]) {
    const total = Math.max(200, c * 4);
    let next = 0;
    const lat = [];
    let errors = 0;
    const t0 = performance.now();
    await Promise.all(
      Array.from({ length: c }, async () => {
        while (next < total) {
          const i = next++;
          const r = await timed(() => call(tokens[i % tokens.length]));
          lat.push(r.ms);
          if (!r.ok) errors++;
        }
      }),
    );
    const wall = (performance.now() - t0) / 1000;
    lat.sort((a, b) => a - b);
    readRows.push({
      name,
      c,
      total,
      rps: total / wall,
      p50: pct(lat, 50),
      p95: pct(lat, 95),
      p99: pct(lat, 99),
      errors,
    });
  }
}

const cpu = os.cpus();
console.log(`# Load test results\n`);
console.log(
  `Run ${new Date().toISOString()} on the local Supabase stack (Docker) on one machine: ${cpu.length} logical CPUs (${cpu[0].model.trim()}), ${(os.totalmem() / 2 ** 30).toFixed(0)} GB RAM, Node ${process.version}. Client and server share the machine, so these numbers show relative behaviour, not production capacity.\n`,
);
console.log(`## Ingestion (reset-demo: wipe, load a persona's history, refresh scores)\n`);
console.log(
  `| People at once | Succeeded | Payments loaded | Wall time (s) | Payments per second | Median latency (ms) | Slowest (ms) |\n|---|---|---|---|---|---|---|`,
);
for (const r of ingestRows)
  console.log(
    `| ${r.n} | ${r.ok}/${r.n} | ${r.inserted} | ${r.wall.toFixed(1)} | ${r.perSec.toFixed(0)} | ${ms(r.p50)} | ${ms(r.max)} |`,
  );
console.log(`\n## Read paths (requests spread over the 6 local test users)\n`);
console.log(
  `| Request | Concurrent | Requests | Requests per second | p50 (ms) | p95 (ms) | p99 (ms) | Errors |\n|---|---|---|---|---|---|---|---|`,
);
for (const r of readRows)
  console.log(
    `| ${r.name} | ${r.c} | ${r.total} | ${r.rps.toFixed(0)} | ${ms(r.p50)} | ${ms(r.p95)} | ${ms(r.p99)} | ${r.errors} |`,
  );
