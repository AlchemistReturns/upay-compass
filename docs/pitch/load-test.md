# Load test

Run 2026-10-07T06:16:27.467Z on the local Supabase stack (Docker) on one machine: 24 logical CPUs (Intel(R) Core(TM) Ultra 9 275HX), 31 GB RAM, Node v26.4.0. Client and server share the machine, so these numbers show relative behaviour, not production capacity.

## Ingestion (reset-demo: wipe, load a persona's history, refresh scores)

| People at once | Succeeded | Payments loaded | Wall time (s) | Payments per second | Median latency (ms) | Slowest (ms) |
|---|---|---|---|---|---|---|
| 1 | 1/1 | 313 | 0.7 | 472 | 663 | 663 |
| 3 | 3/3 | 824 | 0.3 | 3191 | 250 | 258 |
| 6 | 6/6 | 1648 | 0.4 | 4590 | 354 | 359 |

## Read paths (requests spread over the 6 local test users)

| Request | Concurrent | Requests | Requests per second | p50 (ms) | p95 (ms) | p99 (ms) | Errors |
|---|---|---|---|---|---|---|---|
| transactions list (REST, 50 rows) | 1 | 200 | 70 | 15 | 21 | 28 | 0 |
| transactions list (REST, 50 rows) | 10 | 200 | 1285 | 7 | 14 | 16 | 0 |
| transactions list (REST, 50 rows) | 50 | 200 | 1599 | 28 | 47 | 49 | 0 |
| transactions list (REST, 50 rows) | 100 | 400 | 1035 | 65 | 252 | 317 | 0 |
| dashboard_summary (RPC) | 1 | 200 | 65 | 15 | 26 | 33 | 0 |
| dashboard_summary (RPC) | 10 | 200 | 1608 | 5 | 10 | 17 | 0 |
| dashboard_summary (RPC) | 50 | 200 | 2110 | 22 | 38 | 41 | 0 |
| dashboard_summary (RPC) | 100 | 400 | 2490 | 40 | 59 | 61 | 0 |
| spend_by_category (RPC) | 1 | 200 | 72 | 15 | 20 | 23 | 0 |
| spend_by_category (RPC) | 10 | 200 | 1409 | 6 | 13 | 15 | 0 |
| spend_by_category (RPC) | 50 | 200 | 2516 | 19 | 24 | 25 | 0 |
| spend_by_category (RPC) | 100 | 400 | 1785 | 45 | 80 | 104 | 0 |

## How to read this

- **Command:** `pnpm load:test` (script: `scripts/load-test.mjs`, local stack only, refuses other hosts). The tables above are its output from one run; the numbers will vary between runs.
- **Ingestion** is the demo-load path (`reset-demo`): it wipes a person's data, loads one persona's history through the same pipeline as every import (validate, categorize, insert once, refresh scores), and returns. The 1-person row is the first request after a cold start, which is why it is slower than the 3- and 6-person rows; treat the later rows as warm. The AI fallback is off in this run (no consent), so no OpenAI latency is included.
- **Read paths** are the queries behind Home and Activity, sent straight to the REST API with real sign-in tokens, so row level security is applied on every request.
- **Error rate** was 0 on every row.

## What this does not show

- Only 6 local test users exist, so concurrency above 6 is parallel requests from the same few accounts, not that many people.
- Client and database share one machine in Docker. Production latency adds network time and the hosting plan's limits (the cloud project is on the free tier).
- Not measured: AI endpoints (coach, voice, categorizer; limited by per-person rate limits and OpenAI), larger histories than the persona data (about 300 to 800 payments per person), sustained load over time, and the live deployment. A real stress test (soak, spike, breaking point) is still to do.
