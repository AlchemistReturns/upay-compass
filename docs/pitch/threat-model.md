# Threat model

Scope: the web app, the Supabase project (Auth, Postgres, Edge Functions) and the calls to OpenAI, as built in this repository. Every mitigation named below exists in the code; the file is given so it can be checked. Where something is weak, it says so (see Residual risks).

## 1. Assets

| Asset | Where it lives | Why it matters |
|---|---|---|
| Payments, balances, budgets, goals, savings | Postgres (`transactions`, `budgets`, `goals`, `savings_entries` …) | Personal financial record |
| Savings plan requests (monthly amount, length, reference; no real deposit behind them) | Postgres (`savings_plans`): own rows only, insert and read; Undo only through `cancel_savings_plan()` | Personal financial intent; the figures are illustrative and written by the browser, so they are display only and never move money |
| Phone number, name, income type | `profiles`, Supabase Auth | Identity |
| PIN hash, passkey public keys | `user_pins`, `user_passkeys` (closed to browsers) | App lock |
| Coach chat text, consents | `coach_messages`, `profiles` | Personal; consent is a promise made to the person |
| Health, readiness scores and forecasts | `health_scores`, `readiness_scores`, `forecasts` | Must come from code, not from the browser |
| Service-role key, OpenAI key | Edge Function secrets only | Full database access; spend |
| Audit and monitoring records | `audit_log`, `model_events` | Evidence and limits; must not hold content |

## 2. Trust boundaries

| Boundary | Crossing | Control |
|---|---|---|
| Browser → Vercel (static app) | Page and script delivery | HTTPS from the host; response headers `nosniff`, `X-Frame-Options: DENY`, referrer and permissions policy (`apps/web/next.config.ts`) |
| Browser → Supabase Auth | Phone OTP sign-in, JWT | Auth rate limits; short-lived JWT with refresh-token rotation (`supabase/config.toml`) |
| Browser → Supabase REST (Postgres) | Anon key plus the person's JWT | Row level security on every table (`pnpm audit:rls`); column grants; no anon grants except the category list |
| Browser → Edge Functions | `Authorization: Bearer <JWT>` | `verify_jwt = false`, so each function calls `authenticate()` (`_shared/http.ts`), which verifies the token with Auth |
| Edge Functions → Postgres | Caller's JWT (RLS applies) or service role | Service role used only after the caller is verified, and only for writes users must not forge |
| Edge Functions → OpenAI | Coach summary, spoken text and audio, merchant labels | Consent, minimal data, validated output (section 3) |

## 3. Threats and mitigations (STRIDE)

| # | Threat | Mitigation in this codebase | Evidence |
|---|---|---|---|
| S1 | Calling a function without signing in, or with a made-up token | Every function starts with `authenticate()` | `pnpm security:probe` section 1: all 16 functions answer 401 to no header, a garbage token, a token signed with another secret, and the anon key |
| S2 | Using another person's id in a request | Functions act as the caller (RLS) and ignore user ids in bodies; `voice-speak` reads the coach message as the caller | Probe section 3 |
| T1 | A person edits their own score, balance, role or saved amount | `saved_amount`, `opening_balance`, `role`, `phone` are not writable by users (column grants); scores, forecasts, nudges and contributions are written only by the service role or security-definer functions | `pnpm audit:rls` (column check); `rls.integration.test.ts` |
| T2 | Reading or writing another person's rows through the REST API | RLS policy `auth.uid() = user_id` on every personal table | Probe section 2 (49 checks, all tables found through the API) |
| T3 | Malformed or oversized input | zod schemas on every body (message ≤ 1000 characters, spoken text ≤ 500, uuid ids); audio 1 KB to 1.5 MB | Probe section 7 |
| R1 | Denying having done something | `audit_log` entry per AI call, import, export, deletion; no content stored | Section 4 caveat on who can write it |
| I1 | Data leaking to the model | Coach: a summary with no phone, name, counterparty or transaction list. Voice: transcript only after the person agreed. Categorizer: only after the same consent as the coach (`hasAiConsent`), and then only merchant name and note with digit runs removed (`redact`) | `packages/shared/src/coach-context.ts`, `_shared/ai-categorize.ts`; test `privacy.integration.test.ts` (no consent, no model call) |
| I2 | Secrets in the browser | OpenAI and service-role keys are read only in Edge Functions | `pnpm audit:bundle`: 55 files scanned, passed |
| I3 | Data in exports or logs | Export never includes the PIN hash or keys; monitoring rows hold no user id or text | `privacy.integration.test.ts`; `model_events` table definition |
| D1 | Cost or load abuse of AI endpoints | `takeSlot()` takes a slot before the work: coach 20 and categorizer 20 per 10 min, voice 60 per 10 min, export and delete 5 per hour; a slot that cannot be written means refuse | Probe section 5 (429 on the 21st coach call, 6th export, 6th delete) |
| D2 | Brute-forcing the PIN | See PIN rows below | Probe section 4 |
| E1 | A signed-in user calling admin functions | `admin_insights()` checks `role = 'admin'`; `seed-demo` returns 403; internal functions (`purge_*`) are not callable by browser roles | Probe section 6 |
| E2 | Prompt injection through typed text, imported statements or merchant names | The coach has no tools and cannot write data: it only streams text about the person's own numbers, and "can I afford X" is decided in code. The categorizer can only return a key from a fixed list (anything else is dropped). Voice output must match a JSON schema and `validateCommand`; the amount must be one the person said; nothing runs until the person taps confirm. Generated lessons pass `learn-validate`. | `coach-chat/index.ts`, `ai-categorize.ts`, `voice-command/index.ts` |
| E3 | A voice command doing something the person did not mean | Confirm card before any write; "remove" shows candidate payments to pick from | `voice-command/index.ts` |

### PIN and unlock mechanism

| # | Threat | Mitigation | Weakness |
|---|---|---|---|
| P1 | Reading the PIN from the database | bcrypt hash (`crypt`, cost 8) in `user_pins`; the table has no policies and no grants for browsers; `has_pin`, `set_pin`, `verify_pin` are the only entry points | Cost 8 is low for bcrypt; with 4 to 6 digits a leaked hash would fall quickly |
| P2 | Guessing the PIN | Wrong tries 1 and 2 are free; tries 3 to 7 each start a wait (30 s, 1, 2, 5, 15 min) during which `verify_pin` refuses to check anything; the 8th wrong try clears the PIN | None found in the counter itself (probe section 4) |
| P3 | Someone with the phone, app unlocked | Locks after 2 minutes in the background (`LOCK_AFTER_HIDDEN_MS`); a new browser session asks for the PIN | The lock is enforced by the app, not the server (W1) |
| P4 | Stolen session token | Short JWT life, refresh rotation | **W1**: the PIN is not required by the data API. A token holder can read and export data without it, and can clear the PIN (8 wrong tries, about 23.5 minutes of enforced waiting) and then call `set_pin` with the session alone. Verified against the local stack. This also weakens PIN re-entry as the guard on account deletion. |
| P5 | Passkey replay or phishing | Challenge stored server-side, single use, 5 minute life; origin allow-list; user verification required; signature counter updated | Passkeys unlock the app screen; they do not replace OTP login |

## 4. Residual risks

| # | Risk | Severity | Status |
|---|---|---|---|
| W1 | PIN is an app lock, not an authorization factor (P4). A stolen session can reset the PIN and delete the account. The fix is a fresh OTP, or a recent sign-in, for deletion and for PIN changes. | Medium | Not fixed; known limitation |
| W2 | `audit_log` can be written by the signed-in person (policy "insert own audit"), including free-form `detail` of any size (a 200 KB row was accepted locally). It is a usage log, not tamper-proof evidence, and "no content" holds for server-written rows only. | Low | Not fixed |
| W3 | No Content-Security-Policy. The other basic headers are set. A CSP needs testing against the theme script and Supabase calls. | Low | Not fixed |
| W4 | Some function errors return the internal message in `detail` (for example `coach-chat` context_failed, `reset-demo`). | Low | Not fixed |
| W5 | Payment labelling used to send the counterparty name and note to OpenAI without a consent step. **Fixed:** `categorize-transaction` and the import pipeline now call the model only when the person has agreed (`coach_consent_at`, the same consent as the coach and lessons); otherwise unplaced payments are filed under Other and marked to check. The consent screen lists this use. A person who agreed earlier, before this change, also agreed to the old coach text, which did not mention it, so they are not asked again. | Low (was Medium) | Fixed; the remaining gap is people who agreed to the older wording |
| W6 | Only test data and personas are used. There is no real upay API connection and no real money movement, so real-world fraud patterns and volumes are untested. | Context | By design for the hackathon |
| W7 | Bangla speech was tested with generated audio, not recordings of many real speakers. | Context | Stated in `docs/pitch/voice-checklist.md` |
| W8 | Auth settings of the live Supabase project (OTP limits, SMS provider, backups) were not inspected; the local `config.toml` was. The probes ran against the local stack only. | Context | Check in the dashboard before launch |
| W9 | Edge Functions answer any origin (`Access-Control-Allow-Origin: *`). Safe while access needs a bearer token, but worth narrowing. | Low | Not fixed |
