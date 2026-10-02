# upay Compass — Specification

Event: DIU CPC × upay AI Hackathon 2026
Track: 03 — Customer Innovation & Financial Independence
Document type: Self-contained team specification (problem + decisions + features + roadmap)
Stack decided: Responsive web app (Next.js, installable PWA), Supabase (Postgres + Auth + Realtime + RLS + Edge Functions), LLM-powered coach via OpenAI API

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
7. Reproducible deployment
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
4. User sets a 4–6 digit **app PIN** (salted hash, verified locally). The Supabase JWT stays the real session.
5. Session persisted and auto-refreshed; PIN lock after 2 minutes in background.

**Roles**

| Role | Can do |
|---|---|
| `user` | read/write own data only |
| `admin` | read anonymized aggregates, manage learn content, run demo seeding |

**Rules**
- RLS on every table, policies keyed on `auth.uid() = user_id`.
- No service-role key in the client or the repo; `.env.example` only.
- OTP rate limiting; PIN locks after 5 failed attempts.
- Logout clears local cache and IndexedDB.

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

audit_log(id bigserial pk, user_id uuid, action text, entity text, entity_id text, detail jsonb, created_at)
```

**RLS pattern**
```sql
alter table transactions enable row level security;
create policy "own rows" on transactions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```
`categories` and `learn_modules` are read-only to authenticated users.

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
| CI/CD | GitHub Actions | Lint, test, deploy previews |
| Deployment | Vercel (client) + Supabase cloud | Fast, reproducible |

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
│  ├─ seed.sql                   # categories, learn modules
│  └─ config.toml
├─ packages/shared/              # shared types, zod schemas, score/forecast pure functions
├─ adapters/upay-sim/            # simulated transaction feed + persona generator
├─ docs/{architecture.png,demo-script.md}
└─ .env.example
```

**Working rules**
- Git: `main` always deployable; feature branches `feat/<feature-id>`; PR + one review; squash merge. Every PR gets a preview deploy.
- Schema changes only through `supabase/migrations` (never edit tables in the dashboard).
- Business logic (score, forecast, categorization rules) lives as **pure TypeScript functions in `packages/shared`**, unit-tested, then wrapped by Edge Functions. This keeps AI/LLM out of anything numeric.
- Each feature is built **vertically**: migration → function/logic → API call → UI → test, in that order.
- Definition of done per feature: works in both languages, RLS verified, empty/error state handled, demo-able.

---

### 11.2 Phases

### Phase 0 — Foundations

**Build process**
1. **Bootstrap repo:** create monorepo (`pnpm` workspaces), Next.js App Router TS app, Tailwind, shadcn/ui, ESLint + Prettier, Husky pre-commit.
2. **Supabase setup:** `supabase init`, link to cloud project, run local stack (`supabase start`) for dev. Store keys in `.env` (`.env.example` committed).
3. **First migration:** `profiles`, `categories`, enable RLS, add `handle_new_user` trigger. Seed 12 categories (en/bn) in `seed.sql`.
4. **Client wiring:** `lib/supabase.ts` creates the browser client from `NEXT_PUBLIC_*` env vars; TanStack Query provider; App Router route groups `(public)` and `(protected)`.
5. **UI shell:** mobile-first layout, bottom navigation (Home, Budgets, Goals, Coach, Learn), theme tokens, Noto Sans Bengali font.
6. **i18n:** `i18next` with `en.json`/`bn.json`; language stored in `profiles.language` and localStorage; all strings via `t()` from day one (no hardcoded text).
7. **CI/CD:** GitHub Actions runs lint + typecheck + unit tests; Vercel preview on every PR; `supabase db push` on merge to main.

**Verify:** blank app deploys, reads `categories` from Supabase, language toggle switches the shell, CI is green.

---

### Phase 1 — Auth & Onboarding (F1, F2)

**Build process**
1. **Enable phone auth** in Supabase; add **test phone numbers with fixed OTPs** for the team/demo; configure email magic link as fallback; set OTP rate limits.
2. **Login screen:** phone input with `+8801XXXXXXXXX` regex (zod), calls `supabase.auth.signInWithOtp({ phone })`, then OTP screen calls `verifyOtp`.
3. **Profile creation:** the `handle_new_user` trigger inserts the `profiles` row; client then redirects to onboarding if `onboarded = false`.
4. **PIN lock:**
   - On first login, user sets a 4–6 digit PIN; derive a hash with Web Crypto (PBKDF2 + random salt), store hash+salt in IndexedDB (never the raw PIN).
   - `useAppLock` hook tracks `visibilitychange`; after 2 minutes hidden, show the PIN screen.
   - 5 failed attempts → force full OTP re-login.
5. **Route guard:** `<ProtectedRoute>` checks session + unlocked state; `onAuthStateChange` keeps session in sync; logout wipes IndexedDB and the Query cache.
6. **Onboarding wizard (3 steps):** language → income type & monthly income → first goal (optional). Writes to `profiles` and `goals`, then sets `onboarded = true`.
7. **RLS policies:** `profiles` select/update only where `id = auth.uid()`.

**Verify:** sign up → onboard → background app 2 min → PIN prompt → relogin works; with two test accounts, account A cannot read account B's rows (automated RLS test using two JWTs).

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
4. **Performance pass:** route-level code splitting, image/icon optimization, skeleton loaders, font subsetting; run Lighthouse CI and fix until mobile score ≥ 90.

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

| Role | Phase 0–1 | Phase 2 | Phase 3 | Phase 4 | Phase 5–6 |
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
| OTP/SMS unavailable | Email magic link fallback |

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

- Client on Vercel, backend on Supabase; migrations and seed scripts committed.
- All config via env vars; `.env.example` committed; no secrets in repo.
- One documented command sequence to go from clone to running demo.
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
