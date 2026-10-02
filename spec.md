# upay Compass — Specification

Event: DIU CPC × upay AI Hackathon 2026
Track: 03 — Customer Innovation & Financial Independence
Document type: Self-contained team specification (problem + decisions + features + roadmap)
Stack decided: Responsive web app (Next.js, installable PWA), Supabase (Postgres + Auth + Realtime + RLS + Edge Functions), LLM-powered coach via OpenAI API

**New to the project? Start at Section 17 (Developer Guide).** It covers setup, daily workflow, conventions and the shared cloud project.

> ⚠️ Items marked with this symbol are assumptions. The official track brief, judging weights and deliverable list were not available when this was written. Replace them with the real values.

---

## 1. Problem Statement

**Challenge:** Build an intelligent customer-facing product for the upay ecosystem that helps everyday users understand their money, build savings habits, and move toward financial independence.

**Product:** upay Compass, a financial companion that turns raw wallet transactions into plain-language insights, budgets, goals, forecasts, and personalized coaching in Bangla and English.

**Core loop the product must demonstrate:**

```
Connect → Understand → Plan → Save → Get Guided → Improve
```

**User money flow modeled:** Income (salary / gig / allowance) → Wallet → Spending (send money, cash out, merchant, recharge, bills) → Savings → Goals. Users: students, young earners, gig and informal workers, first-time savers.

**Constraint:** No live upay system is available. The product runs on simulated transaction data behind a swappable adapter, so a real upay API can replace it later.

### 1.1 Constraints and Guardrails

- Operate only on simulated or user-entered data; never move real money.
- No real credentials or private upay systems.
- Label simulated data as simulated in the UI.
- Educational guidance only: no regulated investment, loan, or insurance advice.
- Send minimal data to the LLM; never phone numbers or raw identifiers.
- Preserve user control: every automated saving or rule is opt-in and reversible.
- Document all assumptions.

### 1.2 Success Criteria

```
Useful App + Meaningful Intelligence + Trustworthy Data Handling
+ Reliable Backend + Local-Language UX + Measurable Impact
= Financial Independence Product
```

A smaller, explainable, working product beats a broad unfinished one.

---

## 2. Required Deliverables

1. Working application, runnable end to end (installable PWA)
2. Source repository with setup, dependencies, deployment instructions
3. Data integration: simulated upay transaction feed through an adapter
4. Intelligence component: categorization, health score, forecast, AI coach
5. User interface in Bangla and English
6. Architecture diagram: data source → backend → intelligence → application
7. Reproducible deployment (deferred until the core build is done; local dev runs on the Supabase CLI stack and the linked cloud project)
8. Impact / business-value case for upay (metrics, user story)
9. Final demo / pitch

**Stretch:** automated tests, CI/CD, gamification, admin insights panel, experiment tracking.

**Deferred (out of scope for now):** web push notifications, offline write queue. Nudges stay in-app only; offline support is limited to a cached read-only dashboard.

---

## 3. Evaluation Criteria

| Criterion | Weight | Assessed on |
|---|---|---|
| Problem Relevance | 20% | Solves a real and meaningful customer/business problem |
| AI/ML Depth | 20% | AI is material to the solution and technically credible |
| Business/Customer Impact | 20% | Clear, measurable value and plausible economics  |
| Prototype Quality | 15% | Working end-to-end experience, not only slides |
| Innovation | 10% | Distinctive insight or differentiated product idea  |
| Scalability and Integration | 10% | Believable path toward real systems and future data  |
| Responsible AI and Security | 5% | Privacy, explain ability, fairness, and safety considered  |

**Working assumption:** product, intelligence and impact carry the most weight, so build those first.

---

## 4. Data Reference

### 4.1 Simulated upay transaction feed (adapter)

```
getTransactions(userId, since) → Transaction[]
Transaction { id, amount, direction(in|out), channel, counterparty, note, occurred_at }
channel ∈ send_money | cash_out | merchant | recharge | bill | add_money
```

- Seed generator produces realistic Bangladeshi patterns: rickshaw/transport, food, mobile recharge, utility bills, tuition, remittance, salary or gig inflows.
- Three personas: **Student**, **Gig worker** (irregular income), **Salaried**.
- Deterministic by seed, so demos are repeatable.

### 4.2 Categories

Food, Transport, Recharge & Data, Bills & Utilities, Education, Shopping, Family & Transfers, Health, Entertainment, Savings, Income, Other. Each has `name_en`, `name_bn`, `icon`, `is_essential`.

### 4.3 Hard rules

- Raw transactions are the source of truth; all insights are derived and recomputable.
- User category corrections always override AI categorization.
- Same seed + same persona ⇒ identical data.
- The LLM never computes numbers; it only explains numbers produced by code.

---

## 5. Architecture Decisions

**Pattern:** One web client, Supabase as the backend platform, and Edge Functions for intelligence. No separate server to babysit.

```
 Simulated upay Feed      Supabase Edge Functions               PWA Client
 (adapter, seeded)  ────► - ingest-transactions                 Next.js + TypeScript
                          - categorize-transaction              - dashboard, budgets, goals
                          - compute-health-score                - coach chat (streaming)
                          - forecast-cashflow                   - learn hub, nudges
                          - coach-chat  ───► OpenAI API         - cached read + install
                          - generate-nudges (cron)                    ▲
                                  │                                   │ supabase-js
                          ┌───────▼───────────────────────────────────┴──┐
                          │ Supabase: Postgres + RLS · Auth · Realtime   │
                          └──────────────────────────────────────────────┘
```

**Decision rationale**
- Supabase gives auth, database, row-level security and realtime in one place, which suits a hackathon timeline.
- Intelligence lives in Edge Functions so API keys never reach the browser.
- Categorization is rules first, AI fallback second: fast, cheap, explainable.
- The adapter pattern keeps the demo honest and the product real-ready.
- PWA over native: one codebase, installable, works on low-end phones and weak networks.
- Next.js (App Router) is used as a client-first app: data goes straight from the browser to Supabase via `supabase-js` under RLS. Next.js route handlers are not used for business logic; that stays in Edge Functions.

---

## 6. Authentication & Authorization (Supabase Auth) 

upay is phone-centric, so login mirrors that.

**Flow**
1. User enters a Bangladeshi mobile number (`+8801XXXXXXXXX`, regex-validated).
2. Supabase phone OTP. For the hackathon use **Supabase test phone numbers with fixed OTPs** to avoid SMS cost; **email magic link** as fallback.
3. Trigger on `auth.users` insert creates a `profiles` row.
4. User sets a 4–6 digit **app PIN once**. It is stored **on the server** (bcrypt hash plus a failed-attempt counter in `user_pins`) and verified by the server, so it survives logout and follows the user to any device. The Supabase JWT stays the real session; the PIN is a UI lock on top of it. Logging in with an OTP counts as unlocking, so a returning user with a PIN goes straight into the app.
5. Session persisted and auto-refreshed; PIN lock after 2 minutes in the background, and in any brand-new browser session.

> Design note: this is a competition prototype with simulated data and test accounts, so a server-side PIN is acceptable. The PIN does not protect data (RLS and the JWT do); it only locks the screen. A 4–6 digit PIN is weak by nature, which is why attempts are counted on the server and the 5th failure clears it.

**Roles**

| Role | Can do |
|---|---|
| `user` | read/write own data only |
| `admin` | read anonymized aggregates, manage learn content, run demo seeding |

**Rules**
- RLS on every table, policies keyed on `auth.uid() = user_id`.
- No service-role key in the client or the repo; `.env.example` only.
- OTP rate limiting. 5 wrong PIN attempts clear the PIN, sign the user out, and require an OTP login plus a new PIN. Attempts are counted in the database, not in the browser.
- Logout clears the session, the query cache and the unlock flag. The PIN is kept on the server.
- PIN storage is only reachable through the `has_pin`, `set_pin` and `verify_pin` functions (Section 7); clients cannot read or write `user_pins`.

---

## 7. Database Schema (Supabase / Postgres)

```sql
profiles(id uuid pk → auth.users, phone text, full_name text, language text default 'bn',
         income_type text, monthly_income numeric, onboarded boolean default false, role text default 'user')

categories(id serial pk, key text unique, name_en text, name_bn text, icon text, is_essential boolean)

transactions(id uuid pk, user_id uuid, amount numeric, direction text, channel text,
             counterparty text, note text, category_id int, category_source text,  -- rule|ai|user
             occurred_at timestamptz, created_at)
  -- index (user_id, occurred_at desc)

category_rules(id uuid pk, user_id uuid null, keyword text, category_id int)  -- learned from user overrides

budgets(id uuid pk, user_id uuid, category_id int, limit_amount numeric,
        period text default 'monthly', alert_threshold numeric default 0.8)

goals(id uuid pk, user_id uuid, title text, target_amount numeric, saved_amount numeric default 0,
      target_date date, status text default 'active')
goal_contributions(id uuid pk, goal_id uuid, user_id uuid, amount numeric, source text, created_at) -- manual|roundup

health_scores(id uuid pk, user_id uuid, score int, breakdown jsonb, computed_at)
forecasts(id uuid pk, user_id uuid, horizon_days int, projected_balance jsonb, risk_flags jsonb, computed_at)
coach_messages(id uuid pk, user_id uuid, role text, content text, created_at)
nudges(id uuid pk, user_id uuid, type text, title text, body text, read boolean default false, created_at)

learn_modules(id serial pk, slug text, title_en text, title_bn text, body_md_en text, body_md_bn text, level int)
user_progress(user_id uuid, module_id int, completed_at timestamptz, primary key (user_id, module_id))
gamification(user_id uuid pk, streak_days int default 0, last_active date, badges jsonb default '[]')

user_pins(user_id uuid pk → auth.users, pin_hash text, failed_attempts int, updated_at)
  -- RLS on, NO policies, NO grants: reachable only via security definer functions has_pin(), set_pin(pin), verify_pin(pin)
audit_log(id bigserial pk, user_id uuid, action text, entity text, entity_id text, detail jsonb, created_at)
```

**RLS pattern**
```sql
alter table transactions enable row level security;
create policy "own rows" on transactions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```
`categories` is public read-only reference data (readable by `anon` and `authenticated`, so the pre-login shell can render it); `learn_modules` is read-only to authenticated users. Writes to both happen only through migrations.

**Column-level grants on `profiles`:** authenticated users may update only `full_name`, `language`, `income_type`, `monthly_income`, `onboarded`. `id`, `phone` and `role` are server-controlled, so users cannot grant themselves admin.

**Realtime-enabled:** `transactions, nudges, budgets, goals, health_scores`.

---

## 8. Features

| ID | Feature | Phase |
|---|---|---|
| F1 | Phone OTP login, PIN lock, session handling | 1 |
| F2 | Onboarding: language, income type, income, first goal | 1 |
| F3 | Transaction ingestion: simulated feed + manual add/edit | 2 |
| F4 | Auto-categorization: rules, AI fallback, user override learning | 2 |
| F5 | Dashboard: income vs expense, category breakdown, trends | 2 |
| F6 | Budgets with threshold alerts | 3 |
| F7 | Savings goals with projected completion date | 3 |
| F8 | Round-up micro-savings into a goal | 3 |
| F9 | Financial Health Score with explainable breakdown | 3 |
| F10 | Cashflow forecast and low-balance risk flags | 4 |
| F11 | AI Coach chat (Bangla/English, streaming, grounded in user data) | 4 |
| F12 | Smart nudges (overspend, unusual spend, goal behind, bill due) | 4 |
| F13 | Learn hub: short financial literacy modules | 5 |
| F14 | Gamification: streaks and badges | 5 |
| F15 | PWA: installable, cached offline read | 5 |
| F16 | Admin aggregate insights (anonymized) | 6 |
| F17 | Demo mode: one-click personas and seeded data | 6 |

---

## 9. Intelligence Design

**Categorization (F4).** 1) user override rules, 2) channel + keyword map, 3) Edge Function LLM fallback for unknowns, returning a category key only. Overrides are stored as `category_rules` so the same merchant is right next time.

**Health Score (F9), 0–100, transparent formula**

| Component | Weight |
|---|---|
| Savings rate | 30% |
| Budget adherence | 25% |
| Emergency buffer (months of essentials) | 25% |
| Income stability | 20% |

The screen shows "what moved your score" and the top 3 improvement actions.

**Forecast (F10).** Detect recurring income and bills by interval and amount similarity, project 30-day balance, flag days where balance dips under a safety buffer. Seasonal-naive baseline first; model upgrade only if it measurably improves error.

**Round-up (F8).** Each outgoing transaction rounds up to the next ৳10; the difference is credited to the chosen goal (simulated, opt-in, reversible).

**AI Coach (F11).**
- Edge Function builds a compact context: profile, 30-day summary, budgets, goals, score. No raw PII.
- The model explains and advises using the user's own numbers; code computes all figures.
- Guardrails: educational only, no product promises, no investment/loan advice, declines out-of-scope questions politely.
- Suggested prompts: "Why did I overspend this week?", "Can I afford ৳5,000 for a phone?"
- Confidence rule: if data is too thin (few transactions), the coach says so and asks for more history instead of guessing.

**Nudges (F12).** Rule-driven, not LLM-driven: budget at 80%, spend 2× above category norm, goal behind schedule, bill due in 3 days.

---

## 10. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (App Router) + React + TypeScript, Tailwind, shadcn/ui | Team standard, mobile-first |
| Data fetching | TanStack Query + `@supabase/supabase-js` | Caching, realtime |
| Charts | Recharts | Dashboard visuals |
| i18n | `i18next` (en/bn) | Bangla-first UX |
| PWA | Web manifest + Serwist (`@serwist/next`) | Install, cached offline read |
| Backend platform | **Supabase** | Postgres, Auth, Realtime, RLS, Edge Functions |
| Edge Functions | Deno/TypeScript | Categorize, score, forecast, coach, nudges |
| LLM | OpenAI API (from Edge Functions only; models set by `OPENAI_COACH_MODEL` / `OPENAI_CATEGORIZE_MODEL` secrets) | Coach and categorization fallback |
| Validation | zod | Input safety |
| Testing | Vitest + Playwright (stretch) | Core logic and demo flow |
| CI | GitHub Actions (lint, typecheck, test, format check on push) | Second check behind the local Husky hook |
| Local tooling | pnpm workspaces, Husky + lint-staged, Supabase CLI as a dev dependency (`pnpm sb <cmd>`) | No global installs |
| Deployment | Deferred. Planned: Vercel (client) + Supabase cloud | Added after the core build |

---

## 11. Development Roadmap and Build Process

Each phase lists **what to build**, **how it will be built** (step-by-step process), and **how we verify it**. Phases are gated: do not start the next one until the "Done when" check passes.

### 11.1 Repository Layout and Working Rules

```
upay-compass/
├─ apps/web/                     # Next.js (App Router) + TS PWA
│  ├─ src/{app,components,features,lib,i18n,hooks}
│  └─ public/{manifest.webmanifest,icons}
├─ supabase/
│  ├─ migrations/                # versioned SQL (schema, RLS, triggers)
│  ├─ functions/                 # Edge Functions (Deno/TS)
│  │  ├─ categorize-transaction/ ├─ compute-health-score/
│  │  ├─ forecast-cashflow/      ├─ coach-chat/
│  │  ├─ generate-nudges/        └─ seed-demo-user/
│  ├─ seed.sql                   # dev-only data (optional)
│  └─ config.toml                # Supabase CLI config (also used by the optional local stack)
├─ packages/shared/              # shared types, zod schemas, score/forecast pure functions
├─ adapters/upay-sim/            # simulated transaction feed + persona generator
├─ docs/{architecture.png,demo-script.md}
├─ .github/workflows/ci.yml
├─ .husky/                       # pre-commit: lint-staged + lint
├─ pnpm-workspace.yaml
└─ .env.example
```

Reference data (the 12 categories, and later the learn modules) is inserted by migrations, not `seed.sql`, because `supabase db push` does not run seeds.

**Working rules**
- Git (team workflow, see Section 17): `main` is protected in spirit, always passes lint, typecheck and tests. Work on short-lived branches `feat/<feature-id>-<slug>` (for example `feat/f6-budgets`), open a PR, get one review, squash merge. Conventional commit messages (`feat(scope): ...`, `fix`, `chore`, `docs`, `test`).
- Schema changes only through `supabase/migrations` (never edit tables in the dashboard). Create files with `pnpm sb migration new <name>`, never edit a migration that has been pushed or merged (add a new one). The shared cloud project is the primary database, so migrations are applied to it with `pnpm sb db push` following the rules in Section 17.6. Risky or destructive migrations are tried on the optional local stack first.
- Secrets: the browser only ever gets the `NEXT_PUBLIC_*` URL and anon key. The service-role key, DB password and OpenAI key never go in the repo, in chat or in screenshots.
- Business logic (score, forecast, categorization rules) lives as **pure TypeScript functions in `packages/shared`**, unit-tested, then wrapped by Edge Functions. This keeps AI/LLM out of anything numeric.
- Each feature is built **vertically**: migration → function/logic → API call → UI → test, in that order.
- Definition of done per feature: works in both languages, RLS verified, empty/error state handled, demo-able.

---

### 11.2 Phases

**Status:** Phases 0 and 1 complete. Phase 2 is next.

### Phase 0 — Foundations

**Build process**
1. **Bootstrap repo:** create monorepo (`pnpm` workspaces), Next.js App Router TS app, Tailwind, shadcn/ui, ESLint + Prettier, Husky pre-commit.
2. **Supabase setup:** Supabase CLI as a dev dependency (`pnpm sb ...`), `supabase init`, `pnpm sb login` and `pnpm sb link` (run in a real terminal), the cloud project is the primary database (an optional local stack with `pnpm sb start` is available for risky migrations). Keys go in `apps/web/.env.local` (`.env.example` committed).
3. **First migrations:** `profiles` (RLS, column-level update grants, `handle_new_user` trigger) and `categories` with the 12 en/bn rows inserted in the migration itself; a second migration opens `categories` to `anon` reads.
4. **Client wiring:** `lib/supabase.ts` creates the browser client from `NEXT_PUBLIC_*` env vars; TanStack Query provider; App Router route groups `(public)` and `(protected)`.
5. **UI shell:** mobile-first layout, bottom navigation (Home, Budgets, Goals, Coach, Learn), theme tokens, Noto Sans Bengali font.
6. **i18n:** `i18next` with `en.json`/`bn.json`, Bangla default; language stored in localStorage now and synced to `profiles.language` once login exists (Phase 1); all strings via `t()` from day one (no hardcoded text).
7. **CI:** Husky pre-commit (lint-staged Prettier + lint) and a GitHub Actions workflow (lint, typecheck, test, format check on push). Deployment and automated `db push` are deferred; migrations are pushed manually.

**Verify:** app runs locally against the cloud project, reads `categories` from Supabase, language toggle switches the shell, lint, typecheck, tests and build pass.

---

### Phase 1 — Auth & Onboarding (F1, F2)

**Build process**
1. **Enable phone auth** in Supabase using **test phone numbers with fixed OTPs only** (no real SMS). GoTrue requires an SMS provider to be selected even for test numbers, so a dummy Twilio provider is enabled. Locally this is `[auth.sms.test_otp]` plus a dummy `[auth.sms.twilio]` in `config.toml` (dummy token in the gitignored `supabase/.env`). In the cloud project it is set in the dashboard (Authentication → Providers → Phone). Local test numbers: `+8801700000001` to `…03`, OTP `123456`. Local OTP resend is limited to once per 5 seconds (`max_frequency`). The email magic link fallback is **not built yet** (open item, see Section 12).
2. **Login screen:** phone input accepts `01XXXXXXXXX`, `8801…` or `+8801…` (Bangla digits too) and normalizes to `+8801[3-9]XXXXXXXX` with zod (`packages/shared/src/auth.ts`), calls `supabase.auth.signInWithOtp({ phone })`, then OTP screen calls `verifyOtp`.
3. **Profile creation:** the `handle_new_user` trigger inserts the `profiles` row; client then redirects to onboarding if `onboarded = false`.
4. **PIN lock:**
   - A user without a PIN is sent to `/set-pin` after login and sets a 4–6 digit PIN through the `set_pin` RPC (bcrypt via pgcrypto, set once; the raw PIN is never stored). A user who already has one is not asked again: the OTP login unlocks the session.
   - `verify_pin` returns `{ok, attempts_left, reset}`; it counts failures per user in the database and, on the 5th wrong attempt, deletes the PIN (`reset: true`). The client then signs the user out, so the next login sets a new PIN.
   - `LockProvider` tracks `visibilitychange`; after 2 minutes hidden, show the PIN screen. A brand-new browser session (new tab or restart) also asks for the PIN; a plain reload does not (flag kept in `sessionStorage`).
5. **Route guard:** a single `useAuthStatus` hook derives `signed-out | needs-pin | locked | needs-onboarding | ready`, and `<Guard own="…">` redirects each route group to where that state belongs (a locked app shows the PIN screen on every route); `onAuthStateChange` keeps session in sync; logout clears the session, the Query cache and the unlock flag (the PIN stays on the server).
6. **Onboarding wizard (3 steps):** language → income type & monthly income → first goal (optional). Writes to `goals` (if filled in) and `profiles`, then sets `onboarded = true`. The `goals` table is created in Phase 1 (migration `20260102000000_goals.sql`) with column-level grants so clients cannot write `saved_amount`; Phase 3 adds contributions and the RPCs. The saved language on `profiles.language` is adopted on login and kept in sync by the language toggle.
7. **RLS policies:** `profiles` select/update only where `id = auth.uid()`.

**Verify:** sign up → onboard → background app 2 min → PIN prompt → relogin works; with two test accounts, account A cannot read account B's rows (automated test using real users: `packages/shared/src/rls.integration.test.ts`, covering profile and goal RLS and the PIN functions; it runs only when `RLS_TEST_URL` and `RLS_TEST_ANON_KEY` are set and the test phone numbers exist on that project).

**Verified so far:** unit tests for phone and OTP validation; the integration test against the local stack (25 tests); and browser smoke runs against the local stack covering login → PIN → onboarding → home → logout → login again (PIN kept, no PIN screen) → new browser session shows the lock → wrong PIN counts down on the server → 5 wrong PINs sign the user out and the next login asks for a new PIN. Not yet verified: the 2-minute background lock timing, and the PIN flow end to end against the cloud project with the cloud test numbers.

---

### Phase 2 — Transactions & Dashboard (F3, F4, F5)

**Build process**
1. **Migration:** `transactions` (with `(user_id, occurred_at desc)` index), `category_rules`, RLS "own rows" policy; enable Realtime on `transactions`.
2. **Adapter + generator (`adapters/upay-sim`):**
   - Define `Transaction` type and `getTransactions(userId, since)`.
   - Persona configs (Student, Gig worker, Salaried) define income cadence, typical merchants, amount distributions; a seeded PRNG makes output deterministic.
   - Generator produces ~90 days of history with weekly/monthly patterns (salary day, bills, recharges).
3. **Ingestion:** Edge Function `ingest-transactions` takes the adapter output, validates with zod (reject malformed → `audit_log`), inserts in batches, then triggers categorization.
4. **Categorizer pipeline (pure function + Edge Function):**
   1. Check user `category_rules` (exact merchant/keyword match) → `category_source = 'user'`.
   2. Channel map (`recharge` → Recharge & Data, `bill` → Bills & Utilities).
   3. Keyword dictionary (en + bn terms, e.g. "bkash" "pathao", "tuition").
   4. Remaining unknowns → batch call to LLM with a strict prompt returning only a category key from the allowed list (JSON, validated; invalid → `Other`) → `category_source = 'ai'`.
5. **Manual add/edit UI:** form with amount, direction, channel, note, date; editing a category writes a `category_rules` row so the next similar transaction is correct.
6. **Dashboard queries:** SQL views/RPCs for monthly income vs expense, spend by category, 8-week trend; fetched via TanStack Query; charts with Recharts; period filter (week/month/3 months).
7. **Realtime:** subscribe to `transactions` inserts for the user, invalidate dashboard queries on event.

**Verify:** unit tests for categorizer (golden set of ~50 labelled transactions, target >85% correct); seeded persona shows correct totals vs a SQL check; correcting a category persists and applies to the next matching transaction.

---

### Phase 3 — Budgets, Goals, Health Score (F6, F7, F8, F9)

**Build process**
1. **Migrations:** `budgets`, `goals`, `goal_contributions`, `health_scores`; RLS own-rows; Realtime on `budgets`, `goals`, `health_scores`.
2. **Budgets:**
   - UI to set monthly limit per category with alert threshold slider.
   - Progress = `spent_this_month / limit`, computed by an RPC; progress bar turns amber at threshold, red at 100%.
   - A DB trigger/Edge Function on transaction insert checks thresholds and inserts a `nudges` row once per budget per month.
3. **Goals:** create with target amount/date; projected completion = remaining / average monthly contribution (pure function in `packages/shared`); manual contribution creates a `goal_contributions` row and updates `saved_amount` in one transaction (RPC).
4. **Round-up:**
   - Per-user setting (on/off, target goal).
   - On each outgoing transaction, compute `roundup = ceil(amount/10)*10 - amount`; insert a `goal_contributions` row with `source = 'roundup'`.
   - Fully reversible: toggle off stops it, history shows each round-up, user can undo.
5. **Health score:**
   - Implement `computeHealthScore(inputs)` as a pure function: savings rate (30), budget adherence (25), emergency buffer in months (25), income stability via coefficient of variation (20); each normalized to 0–100.
   - Edge Function `compute-health-score` reads last 90 days, calls the function, stores score + `breakdown` JSON.
   - Triggered after ingestion, after budget changes, and by a daily cron.
6. **Score screen:** gauge, four component bars, "what moved your score" (diff vs previous snapshot), top 3 actions generated from the weakest components by templates.

**Verify:** unit tests with fixed inputs → fixed scores; changing a transaction visibly changes the score and the explanation; round-up totals reconcile with transaction math.

---

### Phase 4 — Intelligence Layer (F10, F11, F12)

**Build process**
1. **Migrations:** `forecasts`, `coach_messages`, `nudges`; RLS own-rows; Realtime on `nudges`.
2. **Recurring detection (pure function):**
   - Group transactions by normalized counterparty + channel.
   - A group is recurring if there are at least 3 occurrences, interval variance under a tolerance (weekly ≈7d, monthly ≈30d ±3), and amounts within ±15%.
   - Output: next expected date and amount per item, for both income and bills.
3. **Forecast:**
   - Start from the current balance; add expected recurring income; subtract expected recurring bills; subtract a baseline daily variable spend (trailing median by weekday).
   - Produce a 30-day projected balance series and `risk_flags` where balance < safety buffer (e.g. 1 week of essentials).
   - Edge Function `forecast-cashflow` runs daily (cron) and on demand; UI shows a line chart with risk markers.
   - Only add an ML model if it beats the baseline on backtested MAE.
4. **AI Coach (`coach-chat`):**
   1. Verify JWT, load only that user's data.
   2. Build a compact context object: language, income type, 30-day totals by category, budgets, goals, latest score + breakdown, forecast risks. No phone, no names, no raw transaction dump.
   3. System prompt sets role, language, tone, and guardrails (educational only, no investment/loan advice, cite the user's numbers, refuse out-of-scope politely, say "not enough data" when thin).
   4. Call the LLM with streaming; relay the stream to the client (SSE); persist both messages to `coach_messages`.
   5. Rate limit per user; truncate history to the last N turns.
   - **Numbers come from code, not the model:** quick-answer tools such as "can I afford X?" are computed by a pure function (balance after X vs forecast and buffer) and handed to the LLM only to explain.
5. **Chat UI:** streaming message bubbles, suggested prompt chips, language follows profile, typing indicator, error + retry.
6. **Nudges:** Edge Function `generate-nudges` (hourly cron) evaluates rules per user (budget ≥ 80%, category spend > 2× its 8-week average, goal behind schedule, bill due in 3 days, forecast risk) with a dedupe key so each nudge fires once; written to `nudges`, shown in an in-app inbox with unread badge.

**Verify:** coach test set of ~15 questions checked for grounded numbers and guardrail behavior; forecast backtest on seeded personas; the demo gig-worker account shows a visible low-balance warning.

---

### Phase 5 — Engagement & PWA (F13, F14, F15)

> Push notifications and the offline write queue are deferred (see Section 2). Nudges are in-app only.

**Build process**
1. **Learn hub:** `learn_modules` and `user_progress` migrations; write 8–10 short modules in Markdown (en/bn) seeded via `seed.sql`; render with a markdown component; mark complete on finish; show progress ring.
2. **Gamification:** `gamification` table; on app open, update `streak_days` using `last_active`; badge rules evaluated server-side (RPC) for First Goal, 7-Day Streak, Budget Master, Module Graduate; badge toast + profile shelf.
3. **PWA:**
   - `app/manifest.ts` web manifest (name, icons, theme color, `display: standalone`) plus `@serwist/next` service worker.
   - Service worker: precache app shell; stale-while-revalidate for read queries; cache last dashboard payload in IndexedDB for offline read.
   - Writes are disabled while offline (clear message); no offline queue.
   - Install prompt handling (`beforeinstallprompt`) and an offline banner.
4. **Performance pass:** route-level code splitting, image/icon optimization, skeleton loaders, font subsetting; run Lighthouse locally against a production build and fix until mobile score ≥ 90.

**Verify:** install to home screen, switch to airplane mode and the last dashboard still loads, offline banner shows and write actions are disabled with a clear message.

---

### Phase 6 — Admin, Polish & Demo (F16, F17)

**Build process**
1. **Admin insights:** role-gated route; SQL views over aggregates only (no user-level rows, minimum group size to avoid re-identification): top spend categories, average score, goal completion rate, round-up total; simple charts.
2. **Demo mode:** `seed-demo-user` Edge Function (admin-only) creates/reset three personas with deterministic data, budgets, goals and a pre-seeded forecast risk; a "Reset demo" button.
3. **Quality pass:** empty/loading/error states on every screen; accessibility checks (contrast AA, tap targets ≥ 44px, screen-reader labels); native-speaker review of all Bangla copy and the coach prompt; copy that labels simulated data.
4. **Hardening:** re-audit RLS on every table with a script, confirm no service-role key in the client bundle, run dependency audit.
5. **Pitch assets:** architecture diagram, impact metrics slide (from Section 14), 3-minute demo script, backup screen recording, fallback plan for offline venue Wi-Fi.
6. **Rehearsal:** two full dry runs of the Section 16 script on a clean account; fix any step that takes manual DB edits.

**Verify:** full demo runs end to end, repeatable from a reset, with no manual database changes.

---

### 11.3 Build Order and Parallelism

```
Phase 0 ──► Phase 1 ──► Phase 2 ──┬─► Phase 3 ──► Phase 4 ──► Phase 5 ──► Phase 6
                                   └─ (frontend can mock Phase 3/4 data contracts in parallel)
```

The team is growing. The table below maps the work streams; agree on who takes which stream at kickoff. A native Bangla speaker on the team reviews all Bangla copy and the coach prompt.

| Work stream | Phase 0–1 | Phase 2 | Phase 3 | Phase 4 | Phase 5–6 |
|---|---|---|---|---|---|
| Frontend lead | shell, i18n, login UI | dashboard, add/edit form | budget/goal/score screens | chat UI, forecast chart | PWA, learn, polish |
| Backend/DB lead | migrations, RLS, auth | adapter, ingestion, realtime | RPCs, triggers, cron | nudges cron, rate limits | admin views, hardening |
| Intelligence lead | pure-function scaffolding | categorizer + tests | health score + tests | forecast, coach, guardrails | coach test set, tuning |
| Product/pitch lead | Bangla copy, onboarding text | persona definitions | score copy, actions | coach prompts review | learn content, demo script, slides |

**If time runs short, cut:** gamification, admin panel, cached offline read. Never cut Phases 1–4. (Push and offline queue are already deferred.)

---

## 12. Resilience Matrix

| Condition | Fallback |
|---|---|
| LLM unavailable | Rule-based tips and template explanations |
| AI categorization fails | Mark `Other`, queue for user review |
| Insufficient data for coach/forecast | Say so, ask for more history, no guessing |
| Supabase/network down | Serve cached dashboard (PWA), show offline banner, disable writes with a clear message |
| Invalid transaction from adapter | Reject, log to `audit_log`, skip without crashing |
| OTP/SMS unavailable | Email magic link fallback (not built yet) |

---

## 13. Security & Privacy

- RLS everywhere; secrets only in Edge Functions; zod validation on inputs.
- Consent screen explains what is sent to the AI coach.
- Phone numbers and identifiers never included in LLM prompts.
- User can export and delete their data.
- Audit log for sensitive actions (auth events, data export/delete, admin access).

---

## 14. Success Metrics (for the pitch)

- Time to first insight after signup under 60 seconds
- Auto-categorization accuracy above 85% on the seed set
- Health score improvement demonstrated across a simulated 3 months
- Savings goals created and round-up savings accumulated in the demo
- Coach answers that cite the user's actual numbers

---

## 15. Deployment Plan

**Status: deferred.** Deployment happens after the core build (Phases 1–4). Until then the web app runs locally (`pnpm dev`) against the shared Supabase cloud project.

Planned for later:
- Client on Vercel, backend on the Supabase cloud project; migrations committed.
- Optional: preview deploys and automated `db push` on merge, once secrets are stored in GitHub.
- All config via env vars; `.env.example` committed; no secrets in repo.
- One documented command sequence to go from clone to running demo (the README already covers local setup).
- Edge Function secrets set via Supabase CLI.

---

## 16. Demo Script (rehearse exactly)

1. Sign in with phone OTP, set PIN
2. Onboard as a gig-worker persona
3. Dashboard shows categorized spending
4. Correct one category, show it sticks
5. Set a budget, see an alert fire
6. Create a savings goal, enable round-ups
7. Open the Health Score and explain its breakdown
8. Forecast shows an upcoming low-balance risk
9. Ask the Coach in Bangla: "Can I afford ৳5,000 for a phone?"
10. Coach answers with the user's real numbers and safe guidance
11. Show the in-app nudge, then install the PWA
12. Go offline, dashboard still loads
13. Admin view: anonymized aggregate impact for upay

---

## 17. Developer Guide

Everything a new teammate needs to get running and contribute. If something here is wrong or missing, fix this section in the same PR that exposes the gap.

### 17.1 Prerequisites

- Node.js 20+ (22 recommended), Git
- pnpm 11 (`corepack enable` or `npm i -g pnpm`)
- Docker Desktop is **optional**. It is only needed for the local Supabase stack, which you use to try risky migrations or to run the RLS test without touching shared data (first start pulls several images and can take 10+ minutes).
- Windows, macOS and Linux all work. On Windows use PowerShell or Git Bash.

You do **not** install the Supabase CLI globally. It is a dev dependency, run as `pnpm sb <command>`.

### 17.2 First-time setup

```bash
git clone <repo-url> upay-compass
cd upay-compass
pnpm install
```

**Connect to the shared cloud project (primary database)**

1. Ask whoever created the Supabase project to invite you with the Developer role.
2. From the dashboard (Project Settings → API) copy the project URL and the anon key into `apps/web/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

The anon key is public by design but is still not committed.

3. Link the CLI once per machine, in your own terminal (see Section 17.6): `pnpm sb login`, then `pnpm sb link --project-ref <project-ref>`.

Login uses **test phone numbers only** (no real SMS). They are configured once in the dashboard (Authentication → Providers → Phone, dummy Twilio credentials, test numbers with fixed OTPs). The numbers and OTP are whatever is listed under that dashboard page (keep them in sync with `supabase/config.toml`, which defines `+8801700000001` to `…03` with OTP `123456` for the local stack). Cloud OTP resends are rate limited, so wait a minute if you see HTTP 429.

Because the database is shared, every test login creates real rows (auth user, profile, goals) that teammates can see. Use the test numbers, and clean up in the dashboard if needed. There is no database reset.

**Optional: local stack (for risky migrations and the RLS test)**

```bash
cp supabase/.env.example supabase/.env   # dummy Twilio token, no real SMS is ever sent
pnpm sb start      # Postgres, Auth, REST in Docker; applies all migrations
pnpm sb status     # local API URL and anon key
pnpm sb db reset   # rebuild the local DB from migrations
pnpm sb stop       # stop it when you are done
```

To point the web app at it, use `http://127.0.0.1:54321` and the anon key from `pnpm sb status` in `.env.local` (keep a copy of your cloud values so you can switch back). Local test numbers and OTP are the same, set in `supabase/config.toml`. Restart `pnpm dev` after changing env files.

**Run the app**

```bash
pnpm dev           # http://localhost:3000
```

### 17.3 Daily commands

| Command | What it does |
|---|---|
| `pnpm dev` | Start the web app |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Checks across all workspaces |
| `pnpm format` | Prettier write (the pre-commit hook also does this for staged files) |
| `pnpm sb start` / `pnpm sb stop` | Start or stop the optional local Supabase stack |
| `pnpm sb migration new <name>` | Create a new timestamped migration file |
| `pnpm sb db reset` | Rebuild the local DB from migrations (local stack only) |
| `pnpm sb migration list` | Compare local migration files with the cloud project |
| `pnpm sb db push --dry-run` | Preview what would be applied to the linked cloud project |
| `pnpm sb db push` | Apply pending migrations to the cloud project (Section 17.6) |

The Husky pre-commit hook runs Prettier on staged files and then lint. Do not bypass it.

### 17.4 Contribution workflow

1. Pick a feature ID from Section 8 (or a task from the current phase) and tell the team you are on it.
2. Branch from an up-to-date `main`: `git switch -c feat/<id>-<slug>`.
3. Build vertically (migration, shared pure logic with unit tests, API call, UI, test), in both languages.
4. Before pushing: `pnpm lint && pnpm typecheck && pnpm test`.
5. Open a PR with: what changed, how you verified it, screenshots for UI. One review required. Squash merge.
6. If the PR contains a migration, say so in the PR title and apply it to the cloud project following Section 17.6.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and the Prettier check on every push and PR once the repo is on GitHub. A red CI blocks merge.

**Definition of done** (every feature): works in Bangla and English, RLS verified for any new table, empty and error states handled, unit tests for new logic, demo-able.

### 17.5 Conventions and rules that are easy to break

- **Next.js 16.** It differs from older versions. Read `apps/web/AGENTS.md` and the guides in `apps/web/node_modules/next/dist/docs/` before writing app code. Layout and page props use the generated `LayoutProps` / `PageProps` types (run `pnpm typecheck` to regenerate them).
- **No hardcoded UI text.** All strings go through `t()` with keys in both `src/i18n/en.json` and `bn.json`. Bangla copy is reviewed by the native-speaker teammate before it ships.
- **Numbers come from code, never the LLM.** Score, forecast, categorization rules and "can I afford X" are pure functions in `packages/shared` with unit tests. Edge Functions wrap them. The LLM only explains results.
- **Migrations are append-only once merged.** Fix mistakes with a new migration. Every new table gets RLS enabled and policies keyed on `auth.uid()`. Reference data (categories, learn modules) is inserted by migrations, not `seed.sql`.
- **Secrets.** Never commit `.env*` files other than `.env.example`. The service-role key, the DB password and `OPENAI_API_KEY` never go in the repo, in chat, in screenshots or in client code. Share them through a password manager. Edge Function secrets live in `supabase/.env.functions` (gitignored) locally and are set in the cloud with `pnpm sb secrets set`.
- **Privacy.** No phone numbers or raw identifiers in LLM prompts. Simulated data is labelled as simulated in the UI.
- **Windows login quirk.** `pnpm sb login` and `pnpm sb link` need an interactive terminal. Run them in your own terminal window, not through a tool that runs without a TTY.
- **Ports.** The web app uses 3000. The optional local Supabase stack uses 54321 (API) and 54322 (DB); stop other local Supabase stacks first.
- **Stop what you start.** Stop dev servers and the local stack when you are done (`pnpm sb stop`).

### 17.6 Shared cloud project and migrations

Teammates get the Supabase **Developer** role on the project, so everyone can run migrations. Because the cloud database is shared, follow these rules to avoid clobbering each other:

- The cloud project is the shared development database, so you apply your migration to it while the feature is still on its branch. Keep it small and **additive** (new tables, new columns, new policies).
- Always: `pnpm sb migration list` (local files and remote should differ only by your new migration), then `pnpm sb db push --dry-run`, then `pnpm sb db push`. If the dry run lists a migration you did not write, stop and ask the team.
- Say in the team chat before and after you push, so two people never push at once and everyone pulls your migration file.
- **Destructive or hard-to-reverse changes** (dropping or renaming columns or tables, rewriting data, changing existing policies) are tried on the local stack first (`pnpm sb start`, `pnpm sb db reset`) and pushed only after the PR is approved.
- A pushed migration is never edited. A mistake is fixed with a new migration. Merge the PR promptly so `main` always matches the cloud database.
- Link the CLI once per machine: `pnpm sb login` (your own access token), then `pnpm sb link --project-ref <ref>`. The link step may ask for the database password; get it from the team password manager, never from chat.
- Edge Function secrets (`pnpm sb secrets set ...`) are set the same way, by whoever needs them changed; tell the team.

### 17.7 Current status

Phases 0 and 1 are complete (scaffold, migrations for `profiles`, `categories` and `goals`, app shell with i18n, phone OTP login, server-side PIN lock, route guard, onboarding). Phase 1 was merged in PR #1; the move of the PIN to the server is the `fix/server-side-pin` branch. The web app now runs against the shared cloud project by default. Next up: Phase 2 (transactions and dashboard). Deployment is deferred until after Phases 1 to 4.

---
