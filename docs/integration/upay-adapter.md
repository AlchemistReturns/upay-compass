# Connecting real upay data

Compass reads transactions through one interface, so the source of the data can change without touching the rest of the app. Today three sources plug into it:

| Source | `source` value | What it is | Status |
|---|---|---|---|
| Simulator | `simulated` | Deterministic personas (student, gig worker, salaried) used for the demo | Working, used in the demo |
| Statement import | `statement_csv` | A upay statement the person exports as CSV and uploads | Working, tested with fixtures |
| upay partner API | `upay_api` | Live pull by the person's verified phone number | Built against an **assumed** API; has never run against upay |

Nothing in this document is a claim that upay offers a public API. We found no public documentation or sandbox, and access is by contacting upay. The `upay_api` adapter is the seam where that API plugs in.

## How it fits together

```
 simulator ─┐
 CSV upload ─┼─> TransactionFeed.pull(ctx, since) ─> FeedBatch { records, openingBalance }
 upay API  ─┘                                              │
                                                           v
        ingest pipeline (supabase/functions/_shared/ingest.ts)
        validate each record  ->  categorize (rules, then AI for unknown merchants)
        -> insert once (external_id) -> refresh health score, forecast, readiness
```

The pipeline never trusts a feed. Every record is checked with `transactionSchema`; bad ones are counted, written to `audit_log` and skipped, and the rest still import.

The contract lives in `packages/shared/src/feed.ts`:

- `TransactionFeed`: `id`, `simulated`, and `pull(ctx, since)`.
- `FeedContext`: `{ userId, phone }`. `phone` is the verified E.164 number, which real feeds use to find the account.
- `FeedBatch`: `{ records: unknown[], openingBalance: number | null }`. `openingBalance` is the wallet balance before the earliest record when the source knows it; `null` leaves the stored value alone.
- `FeedError` with a code (`not_configured`, `unauthorized`, `not_found`, `invalid_input`, `unavailable`). The pipeline turns each code into an HTTP status.
- `checkFeedBatch(batch)`: a conformance check to run in an adapter's tests.

Record ids must be stable across calls. They become `external_id`, which is what makes importing the same period twice a no-op.

## Adding a new source

1. Create `adapters/<name>/` (copy `adapters/upay-statement` for the package files) and implement `TransactionFeed`. Return unreadable rows as `{ id, parse_error }` records rather than dropping them.
2. In a test, run `checkFeedBatch` over a fixture batch and assert it is empty.
3. In `supabase/functions/_shared/feeds.ts` add a branch to `feedRequestSchema` and return your feed from `buildFeed`.
4. Add the package to the `imports` map in `supabase/functions/ingest-transactions/deno.json`.
5. Add the id to `FeedSourceId` in `packages/shared/src/feed.ts`.

Nothing else changes: the pipeline, the audit log and the screens that read transactions are source-agnostic.

## Request format

`POST /functions/v1/ingest-transactions`, signed in as the person:

```jsonc
{ "source": "simulated", "persona": "gig" }          // also accepted as just { "persona": "gig" }
{ "source": "statement_csv", "csv": "...", "openingBalance": 1500 }   // openingBalance optional
{ "source": "upay_api" }
{ "action": "sources" }                              // { simulated, statement_csv, upay_api: bool }
```

The response is the import summary: `source`, `received`, `rejected`, `inserted`, `duplicates`, `ai_categorized`, `needs_review`, `health_score`.

## Statement (CSV) format

A header row, then one row per payment. Column names are matched case-insensitively against common aliases.

| Meaning | Accepted headers | Required |
|---|---|---|
| Date and time | `date`, `datetime`, `time`, `timestamp`, `transaction date` | yes |
| Amount | `amount`, `amt`, `value`, `taka`, `bdt` | yes, or use credit and debit columns |
| Direction | `type`, `direction`, `dr/cr`, `flow` (values like Credit/Debit, in/out, sent/received) | needed unless amounts are signed or credit and debit are separate |
| Credit and debit | `credit` + `debit` (or `money in` + `money out`) | alternative to amount |
| Name | `name`, `description`, `merchant`, `details`, `particulars`, `counterparty` | yes |
| Channel | `channel`, `service` | no, inferred from the text |
| Note | `note`, `reference`, `remarks`, `narration` | no |
| Balance after | `balance`, `running balance` | no; used to work out the opening balance |

Details:

- Amounts may use commas, `৳`, `Tk`, `BDT`, Bangla digits, or `(500)` for negative.
- Dates without a time zone are read as **Bangladesh time**, **day first** for slashes (`30/09/2026 14:05`). ISO dates work too.
- If there is one amount column and no direction column, money out must be negative. A file where nothing is negative is refused (`direction_unknown`), because guessing would turn every payment into income.
- Limits: 1 MB and 5,000 rows.
- Identical rows in the same minute both import (they get `-2`, `-3` suffixes), and re-uploading the file adds nothing.
- Rows that cannot be read are reported in the summary as `rejected` and logged; the rest import.

## upay partner API (assumed contract)

Written down so the real specification can be swapped in by configuration. **Every name below is a guess.**

```
GET {UPAY_API_BASE_URL}/v1/accounts/{phone}/transactions?from=<ISO>&limit=<n>&cursor=<c>
GET {UPAY_API_BASE_URL}/v1/accounts/{phone}/balance
Authorization: Bearer {UPAY_API_KEY}
```

A page looks like:

```json
{
  "data": [
    {
      "txn_id": "T1", "amount": 120.5, "type": "DEBIT", "service": "MERCHANT_PAY",
      "counterparty_name": "Rahim Tea Stall", "counterparty_msisdn": "+8801712345678",
      "reference": "tea", "timestamp": "2026-10-02T12:30:00+06:00", "status": "SUCCESS"
    }
  ],
  "next_cursor": null
}
```

Mapping to Compass (`adapters/upay-api/src/map.ts`):

| upay field | Compass field | Rule |
|---|---|---|
| `txn_id` | `id` | prefixed `upay-` |
| `amount` | `amount` | must be a positive number |
| `type` | `direction` | CREDIT / IN / CR / RECEIVED is in; DEBIT / OUT / DR / SENT is out; anything else is rejected |
| `service` | `channel` | SEND_MONEY, CASH_OUT, CASH_IN / ADD_MONEY, MERCHANT_PAY, MOBILE_RECHARGE, BILL_PAY and variants; unknown services are rejected, never guessed |
| `counterparty_name` | `counterparty` | falls back to the phone masked as `***1234`; a full counterparty number is never stored |
| `reference` | `note` | |
| `timestamp` | `occurred_at` | converted to UTC |
| `status` | | only SUCCESS / COMPLETED rows are imported; failed, pending and reversed rows moved no money |

Behaviour:

- **Incremental sync.** After the first full pull, each sync asks only for transactions since three days before the newest one already imported, so late-posting rows are not missed. Overlap is harmless because inserts are idempotent.
- **Opening balance.** On a full pull the adapter reads the balance endpoint and works the opening balance out as today's balance minus the net of all returned transactions. A missing balance endpoint does not fail the import.
- **Errors.** HTTP 401/403 becomes `unauthorized`, 404 `not_found`, other failures, timeouts and malformed responses `unavailable`. Pagination stops after 50 pages.

### Switching to the real API

When upay shares its specification:

1. Set the secrets on the Supabase project: `pnpm sb secrets set UPAY_API_BASE_URL=... UPAY_API_KEY=...`.
2. If field names differ, override them without code changes: `UPAY_API_FIELD_MAP` (JSON, keys as in `FieldMap`, values are dotted paths) and `UPAY_API_SERVICE_MAP` (JSON, upay service name to Compass channel).
3. If the endpoints or authentication differ, change the two paths and the header in `adapters/upay-api/src/index.ts`; that is the only file that knows them.
4. Replace the fixtures in `adapters/upay-api/src/api.test.ts` with real, anonymised samples and keep `checkFeedBatch` in the tests.
5. The sync option appears on the import screen by itself once the secrets are set (`{ "action": "sources" }` reports `upay_api: true`).

## Before real user data flows

This is the part that needs a decision with upay and a lawyer, not just code.

- **Consent and purpose.** Get explicit, revocable consent before pulling a person's history, and say what it is used for. There is no consent screen for the live feed yet; the coach and voice features already have one to copy.
- **Credentials.** `UPAY_API_KEY` is server-side only. It is a partner credential and never reaches the browser or the logs.
- **Data minimisation.** The adapter keeps names and masks counterparty numbers. The AI categorizer already strips long digit runs before any text leaves the server, and phone numbers are not sent to the model.
- **Mixing data.** Importing real transactions into an account that still holds demo data mixes the two. Use Demo tools to reset first, or use a fresh account.
- **Opening balance.** A wrong opening balance shifts every balance figure, the forecast and the health score. Prefer a balance column or the live balance endpoint over a typed value.
- **Production hardening not done yet.** Per-user rate limits on imports, a retention and deletion policy for imported data, and monitoring of feed errors (the system health page tracks AI calls, not feeds).
