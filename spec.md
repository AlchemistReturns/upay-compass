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
4. User sets a 4–6 digit **app PIN once**. It is stored **on the server** (bcrypt hash plus a failed-attempt counter in `user_pins`) and verified by the server, so it survives logout and follows the user to any device. The Supabase JWT stays the real session; the PIN is a UI lock on top of it. The OTP proves the phone; a returning user with a PIN must still enter it after every login, so the PIN is the last step of signing in.
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
         income_type text, monthly_income numeric, opening_balance numeric default 0,
         roundup_enabled boolean default false, roundup_goal_id uuid,  -- set only through set_roundup()
         voice_consent_at timestamptz,  -- consent to send voice recordings and spoken-command text to OpenAI (Phase 10)
         coach_consent_at timestamptz,  -- consent to share a compact summary of the user's numbers with the AI coach  -- wallet balance = opening_balance + income - spend - savings balance
         onboarded boolean default false, role text default 'user')

categories(id serial pk, key text unique, name_en text, name_bn text, icon text, is_essential boolean)

transactions(id uuid pk, user_id uuid, external_id text,  -- id from the upstream feed
             amount numeric, direction text, channel text,
             counterparty text, note text, category_id int, category_source text,  -- rule|ai|user
             needs_review boolean,   -- AI unavailable or unsure: filed under Other, flagged for the user
             is_simulated boolean,   -- labelled "simulated" in the UI
             occurred_at timestamptz, created_at)
  -- index (user_id, occurred_at desc); unique (user_id, external_id) makes re-ingesting idempotent

category_rules(id uuid pk, user_id uuid, keyword text, category_id int, unique (user_id, keyword))
  -- learned from user corrections; keyword = lower-cased counterparty. Global rules live in code, not in the table.

budgets(id uuid pk, user_id uuid, category_id int, limit_amount numeric,
        period text default 'monthly', alert_threshold numeric default 0.8,
        unique (user_id, category_id))

goals(id uuid pk, user_id uuid, title text, target_amount numeric, saved_amount numeric default 0,
      target_date date, status text default 'active')
savings_entries(id uuid pk, user_id uuid, kind text,  -- deposit|withdrawal
                amount numeric, created_at)
  -- free savings (money held without a goal). RLS select own; written only by deposit_to_savings /
  -- withdraw_from_savings, which check the balance. savings balance = goal contributions + free savings.

goal_contributions(id uuid pk, goal_id uuid, user_id uuid, amount numeric, source text,  -- manual|roundup
                    transaction_id uuid,  -- set for round-ups; deleting the transaction removes its round-up
                    created_at)
  -- clients can read their own rows only. Rows are written by RPCs/triggers, and triggers keep goals.saved_amount
  -- (and the active/completed status) in step on insert and delete, so the total can never drift.

health_scores(id uuid pk, user_id uuid, score int, breakdown jsonb, computed_at)
  -- history of snapshots; readable by the owner, written only by the compute-health-score function (service role)
transactions index (Phase 8): (user_id, category_id, occurred_at desc), for the unusual-payment lookups.
transaction_explain(id) -> jsonb  -- security invoker: category_source, needs_review, category_key, the saved correction that applies,
  -- and the unusual-payment alert raised for the payment (rule, bucket, amount, typical, z, observations)
readiness_scores(id uuid pk, user_id uuid, score int, breakdown jsonb, computed_at)
  -- credit readiness (informational only); same pattern as health_scores: owner reads, written only by
  -- the compute-readiness-score function (service role); history of snapshots
forecasts(id uuid pk, user_id uuid, horizon_days int, projected_balance jsonb, risk_flags jsonb,
          details jsonb,  -- safety buffer, confidence, recurring items, backtest figures
          computed_at)
  -- history of snapshots; readable by the owner, written only by the forecast-cashflow function (service role)
coach_messages(id uuid pk, user_id uuid, role text, content text, created_at)  -- role: user|assistant
  -- readable by the owner, who can also delete (clear chat); written only by the coach-chat function
nudges(id uuid pk, user_id uuid, type text, data jsonb, dedupe_key text, read boolean default false, created_at)
  -- unique (user_id, dedupe_key). Text is rendered in the client from type + data so it follows the UI language.
  -- Created only by triggers/functions; users can read them and set read = true, nothing else.
  -- types: budget_threshold, budget_exceeded (triggers); goal_behind, bill_due, forecast_risk,
  -- unusual_transaction (generate-nudges; dedupe_key unusual:<transaction id>). overspend rows from before Phase 8 still render.

learn_modules(id serial pk, slug text unique, position int, level int 1-3, minutes int,
              title_en, title_bn, summary_en, summary_bn, body_md_en, body_md_bn)
  -- read-only reference content, written only by migrations
user_progress(user_id uuid, module_id int, completed_at timestamptz, primary key (user_id, module_id))
  -- own rows readable; written only by complete_module(slug)
gamification(user_id uuid pk, streak_days int default 0, last_active date, badges jsonb default '[]')
  -- own row readable; written only by touch_activity() and complete_module(). badges: [{id, earned_at}]

user_pins(user_id uuid pk → auth.users, pin_hash text, failed_attempts int, updated_at)
  -- RLS on, NO policies, NO grants: reachable only via security definer functions has_pin(), set_pin(pin), verify_pin(pin)
personalized_modules(id uuid pk, user_id uuid, topic_id text, language text, content jsonb, facts jsonb, reason_id text,
                     generated_at timestamptz, expires_at timestamptz, completed_at timestamptz,
                     quick_check_score int 0-3, feedback smallint -1|1, dismissed_at timestamptz, unique (user_id, topic_id, language))
  -- Phase 12. Owner reads; inserted only by generate-learn-modules (service role) after validation; users change only
  -- completed_at, quick_check_score, feedback, dismissed_at through update_personalized_module() (security definer).
  -- Not in the realtime publication, like the other learn tables. Finishing one does not touch user_progress or badges.
audit_log(id bigserial pk, user_id uuid, action text, entity text, entity_id text, detail jsonb, created_at)
  -- append-only for users: they can insert and read their own rows, never update or delete
```

**RLS pattern**
```sql
alter table transactions enable row level security;
create policy "own rows" on transactions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```
`categories` is public read-only reference data (readable by `anon` and `authenticated`, so the pre-login shell can render it); `learn_modules` is read-only to authenticated users. Writes to both happen only through migrations.

**Column-level grants on `profiles`:** authenticated users may update only `full_name`, `language`, `income_type`, `monthly_income`, `onboarded`. `id`, `phone` and `role` are server-controlled, so users cannot grant themselves admin.

**Realtime-enabled:** `transactions, budgets, goals, goal_contributions, nudges, health_scores, forecasts, readiness_scores`.

**RPCs (security invoker, so RLS applies):** `set_transaction_category(id, category_id)`, `dashboard_summary(from, to)`, `spend_by_category(from, to)`, `weekly_trend(weeks)` (weeks start Monday, Bangladesh time), `wallet_balance()`, `budget_progress()`, `health_inputs()`. Security definer (they move money-like state, so they check `auth.uid()` ownership themselves): `contribute_to_goal(goal, amount)`, `undo_goal_contribution(id)`, `set_roundup(enabled, goal)`.

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
| F12 | Smart nudges (unusual payment, goal behind, bill due, forecast dip, budget alerts) | 4, 8 |
| F13 | Learn hub: short financial literacy modules | 5 |
| F14 | Gamification: streaks and badges | 5 |
| F15 | PWA: installable, cached offline read | 5 |
| F16 | Admin aggregate insights (anonymized) | 6 |
| F17 | Demo mode: one-click personas and seeded data | 6 |
| F18 | Persona fairness check (does the system treat the personas alike where it should?) | 7 |
| F19 | Unit-economics model (measured vs assumed, reproducible) | 7 |
| F20 | Financial literacy personalizer (recommended learn modules) | 7 |
| F21 | Responsible credit readiness scorecard (informational only) | 7 |
| F22 | Unusual-payment detection (robust statistics, replaces the flat overspend rule) | 8 |
| F23 | "Why this decision" explanations (category and unusual-payment reasons) | 8 |
| F24 | Voice for the coach (listen to answers, speak a question) using the browser's own speech tools | 9 |
| F25 | Server speech-to-text: record in any browser, transcribe with OpenAI (Bangla, English, mixed) | 10 |
| F26 | Voice commands: add or remove income and expenses, create budgets and goals, add to a goal, by voice with a confirmation card | 10 |
| F27 | Voice for the coach everywhere: ask by voice in any browser, answers read aloud with OpenAI text-to-speech where the device has no voice | 10 |
| F28 | Personalized "Made for you" learn modules: code picks topics from the person's signals, the model writes them from a small facts object, a validator checks every number and claim | 12 |

---

## 9. Intelligence Design

**Categorization (F4).** 1) user override rules, 2) channel + keyword map, 3) Edge Function LLM fallback for unknowns, returning a category key only (the key is validated against the allowed list; phone numbers and long digit runs are redacted before anything is sent; with no `OPENAI_API_KEY` the fallback is skipped and the transaction is filed under Other with `needs_review`). Overrides are stored as `category_rules` so the same merchant is right next time. Recharge and bill channels map directly; otherwise the longest matching keyword wins (very short Bangla keywords such as the word for mother only match as whole words); `send_money` and `cash_out` have weak defaults (Family & Transfers, Other) applied after keywords.

**Health Score (F9), 0–100, transparent formula**

| Component | Weight |
|---|---|
| Savings rate | 30% |
| Budget adherence | 25% |
| Emergency buffer (months of essentials) | 25% |
| Income stability | 20% |

Each component is normalized to 0-100 over the last 90 days, then weighted. The rules (all in `packages/shared/src/health.ts`, tested with hand-computed values):

- **Savings rate:** explicit saving divided by income over the window. **Savings is its own balance**: money moved into the savings account (a deposit, a goal contribution or a round-up) leaves the wallet, and payments filed under the Savings category (for example a DPS) count as saving too; saving is measured from these, not from whatever was left unspent. 20% of income put aside scores 100, linear from 0%. Withdrawals reduce it, never below zero.
- **Budget adherence:** average over this month's budgets; within the limit scores 100, 50% over scores 0.
- **Emergency buffer:** (wallet balance + savings balance) divided by a month of essential spending, measured on a **monthly basis from what was logged, with no scaling**: the average of the complete calendar months (Bangladesh time, up to three), or, until one has completed, this month's essentials so far, marked "this month so far" on the screen. A short history is never multiplied up to a month (a day of essentials used to be multiplied by 30 and scored the buffer near zero). 3 months scores 100.
- **Income stability:** coefficient of variation of income across the last three **complete calendar months** (Bangladesh time; months from the first transaction's month onward are skipped); 0% variation scores 100, 50% or more scores 0. (Rolling 30-day windows were used until Phase 7 and mis-scored steady monthly income; see F18.)
- A component that cannot be measured yet (no income, no budgets, under two complete months) counts as a neutral 50 and is labelled as such. Confidence is "low" under 15 transactions or 28 days of history, and the screen says so.

The screen shows "what moved your score" (change per component against the previous snapshot) and the top 3 improvement actions, ranked by how many score points each could win. Actions are data (`id` + numbers) rendered through i18n templates, never free text from a model.

**Credit readiness (F21), 0-100, informational only.** A second transparent score in the same style, answering the brief's "responsible credit readiness" idea without ever acting as a lending decision. It is not a credit decision, is not shared with any lender, and does not affect the upay account; the screen says so in a persistent banner rendered before any data loads. Components (`packages/shared/src/readiness.ts`, tested with hand-computed values), each normalized to 0-100:

| Component | Weight | Basis |
|---|---|---|
| Income consistency | 30% | the health score's income stability |
| Bill punctuality | 30% | recurring bills from the Phase 4 detector, each payment against the expected date; within 1 day scores 100, falling in a straight line to 0 at 7 days off |
| Savings consistency | 25% | months, of the last six that the user was present for, with any goal contribution or round-up (needs 2 observed months) |
| Budget adherence | 15% | the health score's budget adherence |

A component without enough history counts as a neutral 50 and is labelled. **Assumption, shown on the screen:** punctuality is measured against the date the detector expects each bill from the user's own pattern, because the simulated feed has no real due dates. Weekly and fortnightly bills anchor on the occurrence the others fit best, so one late payment does not make the rest look late. The screen also shows "what moved your score". Snapshots are stored only when something changed, like the health score.

**Learn personalizer (F20).** `rankModules` (pure, `packages/shared/src/learn-rank.ts`, no model): unread alerts point at a module (budget alerts to budgeting, a low-balance forecast to the emergency buffer, a goal behind schedule to goal setting, overspending to needs vs wants); the weakest health components (below 70 and measurable) point at theirs (savings to saving small, buffer to the emergency fund, stability to irregular income, budget to budgeting); unfinished modules always rank above finished ones; the rest follow course order. The reason is a template key rendered through i18n.

**Voice commands (F26).** Same rule as the rest of the app: the model only turns a sentence into a typed command; code validates it, the user confirms, and the existing code writes the data. See Phase 10 for the design.

**Forecast (F10).** Detect recurring income and bills by interval and amount similarity, project 30-day balance, flag days where balance dips under a safety buffer. Seasonal-naive baseline first; model upgrade only if it measurably improves error.

**Round-up (F8).** Each outgoing transaction rounds up to the next ৳10; the difference is credited to the chosen goal (simulated, opt-in, reversible). It is done by a database trigger, so ingested and manual payments behave the same; a payment already on a multiple of 10 sets nothing aside. Round-ups move money from the wallet into the savings account (the wallet balance is reduced), like every other contribution.

**AI Coach (F11).**
- Edge Function builds a compact context: profile, 30-day summary, budgets, goals, score. No raw PII.
- The model explains and advises using the user's own numbers; code computes all figures.
- Guardrails: educational only, no product promises, no investment/loan advice, declines out-of-scope questions politely.
- Suggested prompts: "Why did I overspend this week?", "Can I afford ৳5,000 for a phone?"
- Confidence rule: if data is too thin (few transactions), the coach says so and asks for more history instead of guessing.

**Nudges (F12).** Rule-driven, not LLM-driven: budget at 80% and over the limit, an unusual payment, goal behind schedule, bill due in 3 days, a forecast dip. (The Phase 4 rule "a category's week at 2x its usual week" was replaced in Phase 8 by the unusual-payment detector below.)

**Unusual-payment detection (F22).** Statistics in TypeScript, not machine learning (Edge Functions run Deno, so there is no scikit-learn): say so plainly when presenting it. `packages/shared/src/anomaly.ts`. A payment is flagged when it is far above what this user normally pays:

1. **Robust z-score against the closest relevant history.** Take the user's earlier payments from the trailing 90 days: first those to the **same merchant**; if there are fewer than 5, those in the same **category and weekday** bucket. With at least 5, compute the median and the MAD (median absolute deviation) and the modified z-score `(amount - median) / (1.4826 x MAD)`, which equals the textbook `0.6745 x (amount - median) / MAD`. The scale has a floor of Rs 20 so a bucket where the person always pays almost the same amount cannot blow up. Flag **z above 3.5** (the Iglewicz-Hoaglin threshold).
2. **Sparse history** (fewer than 5 in either bucket): flag a **first-time merchant** whose amount is more than twice the category median and at least Rs 300 above it (needs 3 earlier payments in the category). New or rare categories are blind spots for rule 1.

Only **upward** outliers are flagged (an unusually small payment is nothing to warn about). Money in, transfers into savings and recurring payments (rent, bills, subscriptions) are never flagged. Each alert is raised once per payment (`dedupe_key = unusual:<id>`) and carries the amount, the typical amount, the score and which history it was compared with. Two departures from the first plan, both found by the evaluation below: the bucket is the merchant first (a category such as food mixes a Rs 100 canteen lunch with a Rs 400 delivery order, so a category bucket alone rang the alarm on every delivery order and missed a Rs 1,100 canteen lunch on a grocery day), and the plan's formula divided by 1.4826 twice (0.6745 and 1.4826 are the same conversion), so the standard form is used.

**Explainability (F23).** Explanations are data, never model text: `explainTransaction` (pure, `packages/shared/src/explain.ts`) turns the facts into a kind (saved correction, income by direction, recharge or bill channel, keyword with the keyword named, channel default, AI suggestion, unmatched and sent for review) and the unusual-payment numbers; the app renders sentences from translation templates. The database side (`transaction_explain`) only supplies what the browser cannot know: how the category was decided and the alert, if any.

---

## 10. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (App Router) + React + TypeScript, Tailwind, shadcn/ui | Team standard, mobile-first |
| Data fetching | TanStack Query + `@supabase/supabase-js` | Caching, realtime |
| Charts | Recharts | Dashboard visuals |
| i18n | `i18next` (en/bn) | Bangla-first UX |
| PWA | Web manifest (`app/manifest.ts`) + a small hand-written service worker (`public/sw.js`) + TanStack Query persistence in IndexedDB | Install, cached offline read. Serwist was dropped: it needs the webpack build, and our needs fit in about 100 lines |
| Backend platform | **Supabase** | Postgres, Auth, Realtime, RLS, Edge Functions |
| Edge Functions | Deno/TypeScript | Categorize, score, forecast, coach, nudges |
| LLM | OpenAI API (from Edge Functions only; models set by `OPENAI_COACH_MODEL` / `OPENAI_CATEGORIZE_MODEL` / `OPENAI_LEARN_MODEL` secrets; the last falls back to the coach model) | Coach, categorization fallback, personalized learn modules |
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

**Status:** Phases 0 to 9 complete and merged; Phase 10 (voice commands) complete on its own branch, awaiting review and cloud deploy. Remaining: native-speaker Bangla review, backup video, a dry run on the real phone (including the voice checklist).

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
   - A user without a PIN is sent to `/set-pin` after login and sets a 4–6 digit PIN through the `set_pin` RPC (bcrypt via pgcrypto, set once; the raw PIN is never stored). A user who already has one enters it after the OTP on every login (the OTP does not unlock the session).
   - `verify_pin` returns `{ok, attempts_left, reset}`; it counts failures per user in the database and, on the 5th wrong attempt, deletes the PIN (`reset: true`). The client then signs the user out, so the next login sets a new PIN.
   - `LockProvider` tracks `visibilitychange`; after 2 minutes hidden, show the PIN screen. A brand-new browser session (new tab or restart) also asks for the PIN; a plain reload does not (flag kept in `sessionStorage`).
5. **Route guard:** a single `useAuthStatus` hook derives `signed-out | needs-pin | locked | needs-onboarding | ready`, and `<Guard own="…">` redirects each route group to where that state belongs (a locked app shows the PIN screen on every route); `onAuthStateChange` keeps session in sync; logout clears the session, the Query cache and the unlock flag (the PIN stays on the server).
6. **Onboarding wizard (3 steps):** language → income type & monthly income → first goal (optional). Writes to `goals` (if filled in) and `profiles`, then sets `onboarded = true`. The `goals` table is created in Phase 1 (migration `20260102000000_goals.sql`) with column-level grants so clients cannot write `saved_amount`; Phase 3 adds contributions and the RPCs. The saved language on `profiles.language` is adopted on login and kept in sync by the language toggle.
7. **RLS policies:** `profiles` select/update only where `id = auth.uid()`.

**Verify:** sign up → onboard → background app 2 min → PIN prompt → relogin works; with two test accounts, account A cannot read account B's rows (automated test using real users: `packages/shared/src/rls.integration.test.ts`, covering profile and goal RLS and the PIN functions; it runs only when `RLS_TEST_URL` and `RLS_TEST_ANON_KEY` are set and the test phone numbers exist on that project).

**Verified so far:** unit tests for phone and OTP validation; the integration test against the local stack (25 tests); and browser smoke runs against the local stack covering login → PIN → onboarding → home → logout → login again (PIN kept; since the PIN-after-login change the PIN screen now follows the OTP) → new browser session shows the lock → wrong PIN counts down on the server → 5 wrong PINs sign the user out and the next login asks for a new PIN. Not yet verified: the 2-minute background lock timing, and the PIN flow end to end against the cloud project with the cloud test numbers.

---

### Phase 2 — Transactions & Dashboard (F3, F4, F5)

**Build process**
1. **Migration** (`20261002155900_phase2_transactions.sql`): `transactions` (with `(user_id, occurred_at desc)` index and a unique `(user_id, external_id)` index; not partial, because PostgREST upserts cannot infer a partial index), `category_rules`, `audit_log`, `profiles.opening_balance`, RLS "own rows" policies, Realtime on `transactions`, and the dashboard RPCs listed in Section 7.
2. **Adapter + generator (`adapters/upay-sim`):**
   - Define `Transaction` type and `getTransactions(userId, since)`.
   - Persona configs (Student, Gig worker, Salaried) define income cadence, typical merchants, amount distributions; a seeded PRNG makes output deterministic.
   - Generator produces 120 days of history with weekly/monthly patterns (salary day, bills, recharges). 120 rather than 90 so that a monthly payment early in the month still has three occurrences in the forecaster's look-back window (see Phase 4). The gig persona carries a fixed monthly bike instalment that its irregular income barely covers, which is what makes its forecast show a real low-balance warning.
3. **Ingestion:** Edge Function `ingest-transactions` (POST `{persona}`) takes the adapter output, validates each record with zod (rejects go to `audit_log`), categorizes (step 4), and upserts in batches of 200 with `ignoreDuplicates` on `(user_id, external_id)`, so running it twice inserts nothing new. It also sets `opening_balance` and writes a summary row to `audit_log`. `categorize-transaction` categorizes specific existing transactions (used after a manual add the rules could not place). Functions verify the caller themselves (`verify_jwt = false` in `config.toml`, then `auth.getUser`), which works with the project's ES256 JWTs, and act as the caller so RLS applies.
4. **Categorizer pipeline (pure function + Edge Function):**
   1. Check user `category_rules` (exact merchant/keyword match) → `category_source = 'user'`.
   2. Channel map (`recharge` → Recharge & Data, `bill` → Bills & Utilities).
   3. Keyword dictionary (en + bn terms, e.g. "bkash" "pathao", "tuition").
   4. Remaining unknowns → batch call to LLM with a strict prompt returning only a category key from the allowed list (JSON, validated; invalid → `Other`) → `category_source = 'ai'`.
5. **Manual add/edit UI:** form with amount, direction, channel, note, date. The client runs the same pure categorizer; unknown merchants are filed under Other with `needs_review` and sent to `categorize-transaction`. Editing a category calls `set_transaction_category`, which saves a `category_rules` row and re-applies it to the user's other transactions from that merchant, so the next similar transaction is right.
6. **Dashboard:** wallet balance, income / spent / net tiles, period tabs (week = since Monday, month, 3 months = current month plus two), a grouped weekly income-vs-spend column chart (Recharts), and category spend as sorted horizontal bars. Both charts have a table view, a legend, and use the validated blue/orange pair. Period boundaries are computed in Bangladesh time by `getPeriodRange` in `packages/shared`. Empty accounts see a one-tap loader for the simulated feed (Student, Gig worker, Salaried).
7. **Realtime:** subscribe to `transactions` inserts for the user, invalidate dashboard queries on event.

**Edge Function plumbing:** each function folder has a `deno.json` import map pointing `@compass/shared` and `@compass/upay-sim` at the workspace sources (so there is one copy of the logic), and relative imports inside those packages carry `.ts` extensions because Deno requires them (`allowImportingTsExtensions` is on in the tsconfigs). Deploy with `pnpm sb functions deploy <name> --use-api` (bundles server-side, no Docker needed). Optional secrets: `pnpm sb secrets set OPENAI_API_KEY=... OPENAI_CATEGORIZE_MODEL=...`.

**Verify:** unit tests for categorizer (golden set of 50 labelled transactions, 94% correct with the 3 unknowable merchants counted as misses); adapter determinism tests; seeded persona shows correct totals vs a SQL check; correcting a category persists and applies to the next matching transaction.

**Verified so far (local stack):** 49 unit and integration tests; the ingest function (401 without a token, 400 on bad input, 228 rows for the gig persona, 0 new rows on a second run); and a browser run in which the income, spent and balance figures on screen equalled SQL totals, a corrected category was saved as a rule and applied to the next matching transaction, an unknown merchant was filed under Other with a review badge, and the dashboard rendered in Bangla. Not yet verified: realtime refresh (the realtime service is not part of the local stack we run), the AI fallback with a real `OPENAI_API_KEY`, and the full flow against the cloud project with its test phone numbers. The migration and both functions are deployed to the cloud project.

---

### Phase 3 — Budgets, Goals, Health Score (F6, F7, F8, F9)

**Build process**
1. **Migration** (`20261002165340_phase3_budgets_goals_score.sql`): `budgets`, `goal_contributions`, `health_scores`, and `nudges` (moved up from Phase 4, because budget alerts need it), round-up columns on `profiles`; RLS; Realtime on `budgets, goals, goal_contributions, nudges, health_scores`. `goals` already exists from Phase 1.
2. **Budgets:**
   - UI to set monthly limit per category with alert threshold slider.
   - Progress = `spent_this_month / limit`, computed by an RPC; progress bar turns amber at threshold, red at 100%.
   - A DB trigger on transaction insert/update and on budget insert/update checks thresholds and inserts a `nudges` row once per budget per month per level (`budget_threshold`, then `budget_exceeded`), using `dedupe_key`. Only spending from the current Bangladesh-time month raises alerts, so back-filled history never does. Setting a budget below what is already spent alerts immediately.
3. **Goals:** create with target amount/date; projected completion = remaining / average monthly contribution (pure function in `packages/shared`); manual contribution creates a `goal_contributions` row and updates `saved_amount` in one transaction (RPC).
4. **Round-up:**
   - Per-user setting (on/off, target goal).
   - On each outgoing transaction, compute `roundup = ceil(amount/10)*10 - amount`; insert a `goal_contributions` row with `source = 'roundup'`.
   - Fully reversible: toggle off stops it, history shows each round-up, user can undo. The target goal is validated server-side by `set_roundup`; clients cannot write the setting or `saved_amount` directly.
5. **Health score:**
   - Implement `computeHealthScore(inputs)` as a pure function: savings rate (30), budget adherence (25), emergency buffer in months (25), income stability via coefficient of variation (20); each normalized to 0–100.
   - Edge Function `compute-health-score` reads last 90 days, calls the function, stores score + `breakdown` JSON.
   - Triggered after ingestion (the ingest function calls the same helper), after budget changes (the client invokes the function), and when the score screen opens with a snapshot older than 6 hours. A snapshot is stored only when the score or breakdown changed; otherwise only its timestamp is refreshed. The **daily cron is deferred** to Phase 4, where the other scheduled jobs (forecast, nudges) need `pg_cron` anyway.
6. **Score screen** (`/score`, with a card on the dashboard): gauge, four component bars with a plain-language line each, "what moved your score" (diff vs previous snapshot), top 3 actions from templates with links to the right screen, low-confidence note.
7. **Alerts:** a bell with an unread count in every header and an inbox (`/nudges`); tapping an alert opens the budget and marks it read. Phase 4 adds more nudge types to the same table.

**Verify:** unit tests with fixed inputs → fixed scores; changing a transaction visibly changes the score and the explanation; round-up totals reconcile with transaction math.

**Verified so far (local stack):** 118 unit and integration tests (hand-computed scores and projections, alert dedupe, past-month handling, forged-write attempts on nudges, contributions, saved_amount and scores, round-up reconciliation including undo and transaction deletion); `compute-health-score` (401 without a token, no-op on an empty account, unchanged recompute stores nothing, a budget change stores a new snapshot); and a browser run covering a budget alert firing once, the inbox marking it read, a goal with contribution and projection, a round-up of 123 setting aside 7 and undoing cleanly, the score screen equalling the stored score, the score changing after a real transaction, and the Bangla view. Not yet verified: realtime refresh of these screens (the realtime service is not part of the local stack), and the flow against the cloud project. Not done: the daily score cron (see step 5).

---

### Phase 4 — Intelligence Layer (F10, F11, F12)

**Build process**
1. **Migration** (`20261002173126_phase4_forecasts_coach.sql`): `forecasts`, `coach_messages`, `profiles.coach_consent_at`; RLS own-rows; both tables are written only by Edge Functions with the service role. (`nudges` already exists from Phase 3.)
2. **Recurring detection (pure function, `packages/shared/src/recurring.ts`):**
   - Group transactions by normalized counterparty + channel + direction.
   - A group is recurring if there are at least 3 occurrences (one amount per day), at least 80% of the gaps fit weekly (7 ±1 days), fortnightly (14 ±2) or monthly (30 ±3), and its next date is not more than one cycle overdue.
   - Amounts within ±15% of the median are "stable" and used as is. Varying amounts are still recurring, but planned **conservatively**: the 25th percentile for income and the 75th for payments out. (A strict ±15% rule would discard a gig worker's payouts altogether.)
   - Detection looks back **120 days**, not 90: with 90, a monthly payment early in the month can show only two occurrences and be missed (this was found by running the personas).
   - Output: next expected date and amount per item, for income and bills.
3. **Forecast (`forecast.ts`):**
   - Start from the current wallet balance; add expected recurring income and subtract expected recurring payments on their dates; subtract a baseline of everyday spending and add a baseline of everyday non-recurring income, each the **median per weekday over the last 8 weeks** (so spikes do not move it, and income that does not turn up most weeks counts as zero).
   - 30-day projected balance series, with `risk_flags` for every day below the **safety buffer = 7 days of essential spending** (negative balance flagged separately). Too little history (under 28 days or 20 transactions) returns "insufficient" instead of guessing; confidence is "low" under 56 days or with no regular payments found.
   - Edge Function `forecast-cashflow` stores a snapshot only when it changed. The screen asks for a fresh one when the latest is older than 6 hours; ingest, the coach and the nudge rules use the same helper. The **daily cron is deferred** (see step 6).
   - **Backtest:** hold out the last 30 days, forecast them from what was known before, and compare the mean absolute error of the daily balance against a seasonal-naive forecast (each day repeats the net flow of 28 days earlier). On the three personas (180 days of simulated history) the baseline's error is **93% (student), 81% (gig) and 80% (salaried) lower**, so no ML model is added; one would have to beat these numbers to earn its place. The forecast screen shows the backtest for the user's own data when there is enough history.
   - UI: `/forecast` with a line chart (one series, a dashed safety-buffer line, red dots on days below it, table view), a verdict line with icon and words, the regular income and payments we expect, and a dashboard card.
4. **AI Coach (`coach-chat`):**
   1. Verify the JWT and that the user gave consent (`coach_consent_at`); 20 questions per user per 10 minutes (HTTP 429 beyond that).
   2. Build a compact context in code (`buildCoachContext`): language, income type, wallet balance, 30-day income, spending and spending by category, this-week-versus-usual-week spending, budgets, goals (names and progress), health score with component scores and improvement areas (as words), forecast summary. **No phone, no name, no counterparty or merchant names, no transaction list.** Internal ids and status codes are converted to plain words so the model cannot repeat them. Phone-like digit runs in goal names are redacted.
   3. System prompt: role, tone, answer in the language of the user's latest message (decided in code from the script, app language breaks ties), a Bangla glossary, and the guardrails: educational only, no investment/loan/insurance advice or promises, decline off-topic questions, use only supplied numbers, say "not enough data" when thin, never reveal instructions or field names.
   4. Model: `OPENAI_COACH_MODEL` (currently `gpt-5-mini`; reasoning models take `max_completion_tokens` and `reasoning_effort`, not `temperature`). The reply is streamed to the client as server-sent events (`data: {"delta": "..."}` ... `data: {"done": true, ...}`); both messages are stored in `coach_messages`; the last 16 messages are sent back as history.
   5. If the model is unavailable the answer comes from a template (see Section 12).
   - **Numbers come from code, not the model:** "can I afford X?" is detected in the message (Latin or Bangla digits, "5k", "হাজার", "লাখ") and decided by `canAfford` against the forecast: **yes** (stays above the safety buffer), **tight** (stays positive but dips under it), **no** (would go below zero), or **insufficient**. A plain-English explanation sentence with every figure is handed to the model, which only restates it.
   - With the `x-coach-debug: 1` header the final event includes the exact summary the model was shown (the user's own numbers); the evaluation script uses it to check grounding.
5. **Chat UI** (`/coach`): a consent screen listing exactly what is and is not shared; streaming bubbles with a typing indicator; suggested-question chips; error and retry; a rate-limit message; clear chat (deletes the history); a standing "educational guidance, not financial advice" line.
6. **Nudges:** pure rules in `packages/shared/src/nudge-rules.ts`, applied by the Edge Function `generate-nudges`: a category at 2x its average week (and at least ৳300 more; **replaced in Phase 8** by unusual-payment detection), a goal behind schedule (or with a target date and no savings after 14 days), a recurring payment due within 3 days, a forecast dip within 14 days. Each has a dedupe key (per week, per month or per due date), so calling the function repeatedly never repeats an alert. Budget alerts (80%, over limit) are raised by database triggers as spending happens. The inbox, bell and unread badge render all types in the user's language.
   - **Scheduling is deferred:** the app evaluates the rules at most once an hour while it is open (`useAutoNudges`) and recomputes the forecast and score when their screens open stale. Real `pg_cron` jobs (hourly nudges, daily forecast and score for every user) need `pg_cron`, `pg_net` and a shared secret in Vault; that is left for when the app is deployed.

**Verify:** coach test set of ~15 questions checked for grounded numbers and guardrail behavior; forecast backtest on seeded personas; the demo gig-worker account shows a visible low-balance warning.

**Verified so far (local stack):**
- 175 unit and integration tests, including hand-computed forecasts (for example a synthetic user whose 29-31 October dip below a ৳2,100 buffer is worked out on paper), recurring detection, backtest, affordability verdicts, nudge rules, the coach context (no identifying fields, numbers add up, thin data flagged), the template fallback and the table permissions.
- `pnpm coach:eval` runs 16 questions through the real function and model: **16/16 passed** (every figure in an answer is in the data the model was shown or a sum/difference of two such figures; stock-tip, loan-advice and off-topic questions are declined; the system prompt and field names are not leaked; phone numbers are not echoed; thin data gets "not enough data"; affordability answers agree with the code's verdict). Run it with the local functions server up; it spends a few cents of OpenAI usage.
- Persona forecasts: the gig worker gets a clear warning (balance may go below zero around 21 October, first below the buffer on 5 October), the student has none, the salaried worker dips just under the buffer shortly before payday.
- A browser run of 19 checks: forecast card and screen (verdict, chart with 25 flagged days, starting point equal to the real wallet balance, table view), alerts generated on open and shown in the inbox, consent screen, a streamed coach answer that quotes the computed balance after the purchase and follows the verdict, history surviving a reload, clear chat, and the Bangla view.
- Not yet verified: realtime refresh (not part of the local stack), the flow against the cloud project, and the scheduled jobs (not built).

---

### Phase 5 — Engagement & PWA (F13, F14, F15)

> Push notifications and the offline write queue are deferred (see Section 2). Nudges are in-app only.

**Build process**
1. **Learn hub (F13):** migrations `20261003090000_phase5_learn_gamification.sql` (tables, RLS, functions) and `20261003090100_phase5_learn_content.sql` (content). Eight short modules in English and Bangla (budget basics, needs vs wants, emergency buffer, saving small, mobile money safety, irregular income, goals that stick, borrowing basics), in a small Markdown subset (`##` headings, paragraphs, `-` bullets, `**bold**`) rendered by a 60-line component in the app (no HTML injected). The hub shows a progress ring and the module list; `/learn/[slug]` shows a module with "Mark as finished" and "Next module". The content is educational only and every page says so. `LEARN_SLUGS` in `packages/shared/src/learn.ts` lists the slugs so the pages are built ahead of time (and kept for offline use); a unit test checks the list against the migration and that every module has both languages.
   - Seeding is done in a migration, not `seed.sql`, because the shared cloud project only receives migrations. Changing a module later is a new migration.
2. **Gamification (F14):** all state changes happen in security definer functions, so a streak or badge cannot be forged from the browser.
   - `touch_activity()` is called when the signed-in app opens (and after creating a goal). It adds a streak day once per Bangladesh calendar day (yesterday: +1, longer gap: back to 1), then evaluates badges and returns the new ones.
   - `complete_module(slug)` records a module as finished (idempotent) and evaluates badges.
   - Badge rules, evaluated in SQL from the user's own rows: **First Goal** (created a goal), **7-Day Streak** (7 days in a row), **Budget Master** (has a budget at least a week old and none is over its limit this month), **Module Graduate** (finished every module). Awarded once, with the date.
   - UI: a streak chip on the dashboard, a badge toast when one is earned, a badge shelf on the Learn page (locked badges say how to earn them).
3. **PWA (F15):**
   - `app/manifest.ts` (standalone, icons 192/512 and a maskable 512, theme colors) and an Apple touch icon; icons are generated PNGs in `public/icons/`.
   - **Service worker** (`public/sw.js`, registered in production builds only): precaches the app's pages (9 screens and the 8 module pages) when installed; static build assets cache-first; page navigations network-first with the saved copy as the fallback, and a small bilingual "you are offline" page for anything never saved. It never touches Supabase or other cross-origin requests.
   - **Offline data:** TanStack Query persists the last results of read queries (dashboard, transactions, goals, budgets, score, forecast, learn) in IndexedDB for up to 7 days, so the screens show the last data when offline. Coach conversations are never persisted. The saved data is cleared on sign out. This replaces "stale-while-revalidate in the service worker": the query cache already behaves that way.
   - **Offline behavior:** a banner says "You are offline. Showing your last saved data. Changes are paused." Every write button (add or edit transaction, budgets, goals, contributions, round-ups, demo load, coach send, mark module finished) is disabled with a short explanation. There is no offline queue.
   - **PIN while offline:** the PIN is only ever checked by the server. If the phone is offline, the browser remembers that this user has a PIN and keeps an already unlocked session open; a browser session that has not been unlocked stays locked until the phone is back online.
   - **Install:** a dismissible install card on the dashboard (from `beforeinstallprompt`).
4. **Performance pass:** charts (Recharts) load on demand with skeleton placeholders; `@compass/shared` is marked side-effect free so unused schemas are dropped from the bundle; the login page renders without waiting for the session check; the Bangla font uses `display: optional` so it cannot hold up the first paint (the first visit uses the phone's own Bangla font). Lighthouse mobile on the production build of the login page: **performance 98 with real network throttling, 87 to 91 with Lighthouse's default simulated throttling** (it varies by a few points between runs), accessibility 100, best practices 100. The signed-in screens cannot be audited from the command line (the session lives in the browser), so they are checked by hand.

**Verify:** a browser run (production build, local stack) of 22 checks: the streak counts on open; the hub lists 8 modules; a module renders its headings, bullets and bold text; finishing all 8 shows 8/8 and the Module Graduate toast; creating a goal earns First Goal; the hub renders in Bangla; the manifest and every icon load; the service worker activates and caches the pages; with the network cut, a reload still shows the last dashboard with the same balance, the banner appears, Goals opens from the saved data, "Create goal" is disabled with an explanation, and a learn module opens and reads; the banner clears when the network returns. 7 integration tests cover the RPCs (no direct writes, idempotence, badge awarding, helper functions not callable) and the streak rules were checked with simulated dates (consecutive day +1, gap resets to 1, seventh day awards the badge).
- Not yet verified: installing to a real phone's home screen (the install prompt needs HTTPS and a deployed URL), and the cloud project (the migration is applied there only after review).

---

### Phase 6 — Admin, Polish & Demo (F16, F17)

**Build process**
1. **Admin insights (F16):** migration `20261003120000_phase6_admin_demo.sql`.
   - `admin_insights()` is a security definer function that only a profile with `role = 'admin'` can call (anyone else gets "forbidden"). It returns **aggregates over groups of people only** and hides any figure computed from **fewer than 5 people** (`min_group_size`); each call is written to `audit_log`. Contents: spending share by category over the last 30 days (a category is listed only if 5 or more people spent in it), average health score (overall and per income type), goal completion rate, round-up savings total, learning progress (average modules finished, number who finished all). No phone, name, id or per-person row ever leaves the function.
   - `/admin` page: privacy line, bars and tiles, "hidden: fewer than 5 people" for suppressed figures, a table-free layout that reads on a phone. Non-admins are told the page is not for them. The link appears in the Demo tools card for admins only.
   - **Becoming an admin** is a deliberate manual step, because `role` is server-controlled: run `update public.profiles set role = 'admin' where phone = '<digits without +>';` in the Supabase SQL editor (or `docker exec ... psql` locally).
2. **Demo mode (F17):**
   - **Reset demo:** The Home "Demo tools" card and the empty-state demo loader were removed from the UI (existing accounts keep the data they have; new accounts start empty and add transactions themselves). The `reset-demo` function and the persona loader code remain for tests and evaluation scripts, but nothing in the app calls them. Choosing a persona calls the `reset-demo` Edge Function, which runs `reset_demo()` (deletes the caller's transactions, rules, budgets, goals, nudges, scores, forecasts, coach messages, learning progress, streak and coach consent; keeps the account, phone, PIN and onboarding), loads the persona's 120 days again through the shared ingest pipeline, and adds a "Phone fund" goal with some savings. It only ever touches the caller's own rows.
   - **Demo cohort:** the admin-only `seed-demo` function creates (or refreshes) 15 clearly synthetic people (3 personas x 5, phones `+88019900000NN`, throwaway passwords nobody keeps), each with their own simulated history, a goal at a different stage, a budget, round-ups and learning progress, so the admin figures have enough people to show. The ingest pipeline moved to `supabase/functions/_shared/ingest.ts` so `ingest-transactions`, `reset-demo` and `seed-demo` share it.
   - **The demo storyline holds on any day.** The simulated histories are generated for "today", so the starting wallet balance now follows the history (the persona's usual figure, raised if needed so the wallet never goes below zero at any point). A test sweeps 45 consecutive days and checks that the gig worker's forecast shows a low-balance warning on every one. (Before this, the warning appeared on 87 of 90 days and not on the day of the first rehearsal.)
3. **Quality pass:**
   - Accessibility, checked with axe-core on 12 screens in English and Bangla (WCAG 2.0/2.1 A and AA plus best practices): fixed low-contrast muted text (darker token), unnamed progress bars, and every button, input, tab and link now has a tap target of at least 44 px (the shared Button and Input sizes were raised). Result: no violations, no targets under 44 px except two links 39 to 40 px wide that were then widened.
   - Empty, loading and error states exist on every screen; offline and "not saved yet" states were added in Phase 5.
   - Simulated data is labelled in the app. **Still needed from the team:** a native-speaker review of all Bangla copy (including the 8 learn modules and the coach prompt).
4. **Hardening** (`pnpm audit:rls`, `pnpm audit:bundle`, `pnpm audit --prod`):
   - `scripts/audit-rls.mjs` checks the local database: RLS on every public table (16), table privileges for `anon`, security definer functions (fixed `search_path`, not callable by `anon`) and which profile columns users can update.
   - It found real problems, fixed by `20261003130000_phase6_hardening.sql`: users could update their own `opening_balance` (their wallet balance) from the browser, `anon` had default table privileges (blocked by RLS, but now removed except for the public category list), and trigger functions were executable. The loading function now writes `opening_balance` with the service role.
   - `scripts/audit-bundle.mjs` scans the built client bundle: no service-role key, secret key or server env var name (only the public anon key). `pnpm audit --prod`: no known vulnerabilities.
5. **Pitch assets** in `docs/pitch/`: `architecture.md` (diagram and talking points), `impact-metrics.md` (every claim with how to reproduce it), `demo-script.md` (3 minutes with timings and recovery steps), `fallback-plan.md` (bad venue Wi-Fi, backup recording). **Still to do by hand:** record the backup video and take the screenshots.
6. **Rehearsal:** the Section 16 script was run by a browser script on a brand-new account (steps 3 to 12), then again after pressing Reset demo, then the admin step: **23 checks, all passing, twice in a row**, with no manual database edits. The checks include a corrected category saved as a rule, a budget alert firing, a goal with round-ups, the score breakdown, the forecast warning, a Bangla coach answer that quotes the user's real number, nudges in the inbox, the dashboard loading offline, a clean account after reset (310 transactions, one goal, no budgets, no chat), the admin aggregates with no personal data, and a regular user being refused the admin page.

**Verify:** the full demo runs end to end and repeats from a reset with no manual database changes (done, above). Remaining before the pitch: the Bangla copy review, the backup video, and one dry run on the real phone against the cloud project.

---

### Phase 7 — Score Parity & Quick Wins (F18, F19, F20, F21)

**Build process**
1. **Credit readiness (F21):** migration `20261004090000_phase7_readiness.sql` (`readiness_scores`, RLS, Realtime, the `savings_activity()` function, and `reset_demo()` now clears the history); pure scoring in `packages/shared/src/readiness.ts`; Edge Function `compute-readiness-score` (and the ingest pipeline refreshes it after loading data); `/readiness` screen (hero ring, four component cards each with a sentence from counts, the punctuality assumption, "what moved your score", the standing banner) and a dashboard card. The "what moved" card was extracted into a shared component used by both scores.
2. **Personalizer (F20):** `rankModules` with tests; on `/learn` the lime card is now the top recommendation with its reason and an "Also for you" rail shows the next two; the dashboard has a one-line "Next: ..." card.
3. **Unit economics (F19):** `pnpm impact:model` prints a deterministic model over the 120-day persona data (fixed end day). Section A is **measured** (payments, cash-outs, auto-categorized share, bill reminders and low-balance days per persona); section B is **modelled** with every assumption in one table (8 seconds per manual entry, 5/10/20% prompt-to-behaviour change, 20% baseline 30-day retention with 5/10/15% relative uplift, a hypothetical real cash-out frequency). The simulated personas barely cash out, so the cash-out table is a sensitivity analysis and says so. `pnpm impact:model --update` writes it into `docs/pitch/impact-metrics.md` between markers and `--check` fails if the document drifts.
4. **Fairness (F18):** `pnpm audit:fairness` signs in to the local stack, loads each persona through the real `reset-demo` function, calls the health and readiness functions and compares them with hand-labelled categorization ground truth for every merchant the personas produce. It writes `docs/pitch/fairness-report.md`. Each gap above its threshold must be explained as by design (income pattern, buffer, no budgets in the demo data) or the script fails.
   - **It found a real bug.** Income stability used rolling 30-day windows; a student with perfectly regular monthly income (Rs 8,000 on the 5th, Rs 3,000 on the 25th) scored **9.5 / 100** because the windows split the payments unevenly, while the irregular gig worker scored 91.3. Migration `20261004100000_phase7_income_months.sql` now sums income per complete calendar month: the student scores 100 and the gig worker 61.5. This also feeds the readiness scorecard's income consistency.

**Verify:** unit tests (readiness with hand-computed scores, ranking order); a browser run on a production build; the fairness script under a minute with every gap explained; the model deterministic.

**Verified so far (local stack):**
- 189 shared and 33 simulator tests, including 6 integration tests for the readiness table, the savings function and the stability fix. Typecheck, lint and format are clean; axe found no violations on the new screens.
- Readiness browser run (10 checks): dashboard card; the "informational only" banner is on screen while the snapshot request is still delayed by 3 seconds; the four components with their sentences; the score on screen equals the stored snapshot; "what moved" lists a changed component; Bangla.
- Personalizer browser run (7 checks): a low savings rate puts the saving module first with its reason (English and Bangla); the dashboard card agrees; an unread budget alert outranks the score-driven pick; finished modules drop out.
- Fairness: categorization accuracy 100% for all three personas and coverage 95.9 to 98.7% (spread under 5 points); the score gaps are explained by persona design. Impact model: identical output on repeated runs.
- Not verified: the cloud project (the new migrations are applied there only after review), and the Section 16 browser rehearsal script needs updating for the UI revamp (its sign-up steps use the old screens).

---

### Phase 8 — AI/ML Depth & Explainability (F22, F23)

**Build process**
1. **Unusual-payment detection (F22):** `anomaly.ts` (rules in Section 9), tested against hand-computed buckets (a tight bucket held at the Rs 20 floor, a wide bucket using 1.4826 x MAD, the 3.5 boundary, four earlier payments not being enough, weekday and category buckets staying separate, the 90-day window, recurring payments and savings never flagged, order independence, the merchant-first behaviour and the sparse-history rule). Migration `20261005090000_phase8_anomaly_index.sql` adds the category index. `generate-nudges` now loads 125 days of payments, raises `unusual_transaction` nudges for the last 7 days and no longer raises the flat overspend alert; adding a payment in the app triggers a check, so the alert shows up straight away. The inbox renders it in both languages and opens the payment.
2. **Evaluation, like the categorizer and the forecast** (`pnpm eval:anomaly`, `adapters/upay-sim/src/anomaly-eval.ts`, asserted by a test): one food payment at 8x, 9x and 10x the typical one is injected per persona per month, across 5 fixed seeds (45 injected payments); false alarms are counted on the unmodified data. On the same data:

| | Finds the injected payments | False alarms per persona per month |
|---|---|---|
| Old flat rule (category's week at 2x) | 31 of 45 (69%) | 9.40 |
| Category and weekday bucket only (first plan) | 36 of 45 (80%) | 2.78 |
| **Shipped (merchant first, then category and weekday)** | **43 of 45 (96%)** | **1.76** |

   The category-only version also missed most injected payments for the salaried persona (6 of 15), whose food category mixes canteen lunches with a weekly grocery shop; comparing with the merchant first fixes both the misses and the false alarms. Many remaining "false alarms" are payments that really were higher than usual (for example a Rs 200 tea in the simulator's second tea-stall price band). The sample is small and simulated: a sanity check, not a measurement of real users.
3. **Explainability (F23):** migration `20261005100000_phase8_explain.sql` (`transaction_explain`); `explain.ts` with tests for every categorization source; `categorize()` now also returns the keyword that matched; an "Why this decision" card on the payment page names the rule (or the merchant the user taught the app, or that the AI suggested it, or that nothing matched and it awaits review) and, for a flagged payment, the amount, the typical amount, the score and the threshold. The readiness screen already has the "what moved your score" treatment (built in Phase 7 as a shared component).
4. **Accessibility follow-up:** the payment page and alerts inbox now pass axe in both languages (the destructive colour was darkened for contrast, the unread alert date uses the normal muted colour, the Spent and Received toggle is 44 px tall).

**Verify:** unit tests for the MAD and z-score math; the injected-anomaly evaluation compared with the old rule; a 10x payment added in the app produces exactly one alert; explanations checked for every categorization source in both languages.

**Verified so far (local stack):**
- 222 shared tests (new: 16 anomaly, 12 explain, and 5 integration tests: an alert for a 10x payment, exactly once, with the numbers; no more flat overspend alerts; an ordinary payment raises nothing; `transaction_explain` returns the facts for the owner only) and 38 simulator tests (5 of them the evaluation).
- Browser run on a production build (10 checks): keyword, channel, income, AI and saved-correction explanations; a payment of Rs 1,800 at a place that normally costs about Rs 135, added in the app, produced exactly one alert, readable in the inbox, which opens the payment with the flagged explanation (score 44.9 against the 3.5 threshold); English and Bangla.
- Not verified: the cloud project (the new migrations and the changed `generate-nudges` function go there after review).

---

### Phase 9 — Accessibility & Voice (F24)

**Decision: no external voice API.** The browser's Web Speech API does both jobs (speaking answers, listening to questions), so there is no key, no server code, no cost and no extra place the user's words are sent for reading aloud. A cloud voice (ElevenLabs, Google Cloud text-to-speech) would sound better and would cover Bangla on every device, but it needs a key kept on a server, costs per character, sends every answer to a third party and does not work offline. It is a sensible later upgrade for Bangla only.

**Build process**
1. **Pure helpers** (`packages/shared/src/speech.ts`, 14 tests): `pickVoice` (an exact locale first, then another locale of the same language, then none; a voice on the device beats an online one), `prepareSpeech` (turns an answer into speakable text: the taka sign said as the word "taka" or "টাকা", markdown marks removed, sentence-sized pieces never above 180 characters because some browsers stop a long passage part-way), and `recognitionProblem` (names a recognition error, quiet when we stopped it ourselves).
2. **Listen** (`useSpeechSynthesis`, a Listen/Stop control under each coach answer): uses an installed voice for the answer's language, taken from the answer's script (the app language breaks a tie; the plan said `profiles.language`, but an answer follows the language of the question). **Hidden where there is no voice for that language**, rather than a dead button. Stops when a new question starts, when the person leaves the screen or when the app is hidden.
3. **Speak a question** (`useSpeechRecognition`, a microphone button in the text box): asks the browser for `bn-BD` or `en-US` by the app language; the words appear in the box while you speak and stay there for you to read and send, nothing is sent automatically. Hidden where the browser has no speech recognition. A note under the box says voice input uses the browser's speech service, which may send the voice to its maker. Plain-language messages for a blocked microphone, no microphone, no speech heard, an unsupported language, no network.
4. **A real bug found on the way:** `detectReplyLanguage` treated the taka sign (U+09F3, in the Bangla Unicode block but not a letter) as Bangla script, so an English question such as the app's own suggestion chip "Can I afford ৳5,000 for a phone?" was answered in Bangla and its answer was read with a Bangla voice. It now looks for Bangla letters only (tests added). This function also runs inside the `coach-chat` Edge Function, which needs redeploying to the cloud project.

**Verify:** a manual checklist on two real browsers (desktop Chrome, Android Chrome), written down in `docs/pitch/voice-checklist.md`, with the results recorded honestly. This is a browser-API feature; a unit test cannot cover the engines.

**Verified so far:**
- 14 unit tests for the helpers and 2 more for the language fix.
- A browser run with **fake** speech APIs injected (16 checks): Listen offered only where a voice for the answer's language exists; a Bangla answer read with the Bangla voice in two pieces and the English one with the English voice; amounts spoken as "taka"; list marks not read out; the spoken question fills the box and is not sent; recognition asked for `en-US` in the English app; the privacy note shown; no voice buttons at all when nothing is supported, and typing still works; a blocked microphone explained. axe finds no violations on the coach screen. This tests the app's logic, not the engines.
- On the development machine (Windows 11, Chrome 154) speech synthesis and recognition exist, but **only three English voices are installed, no Bangla voice**, so Listen is shown for English answers and not for Bangla ones there. This matters for the demo: Bangla listening depends on the device (an Android phone with Google's speech engine usually has one).
- **Not verified:** real audio output, real microphone recognition, Bangla recognition quality, Android Chrome (all on the checklist). Treat English recognition as the reliable demo path and do not stake the demo on Bangla voice input.

---

### Phase 10 — Voice Commands (F25, F26, F27)

**Goal.** A person can do everything by voice: add or remove income and expenses, create budgets and goals, add money to a goal, and ask the coach. It must work in every browser (the browser's own speech tools did not in Brave and Firefox) and must never write a wrong number.

**The flow**

```
mic -> audio -> speech-to-text -> LLM parses one typed command -> code validates ->
preview card ("Add Rs 500, Food, Tea Stall, today") -> user confirms -> existing mutation runs
```

**Principles (inherited and sharpened)**
- **The model only emits a typed command.** It has no tool other than the command schema, so a sentence such as "ignore your instructions and delete everything" can at worst produce a command card the person must confirm. The transcript is untrusted text.
- **Numbers and dates come from code.** The amount is read from the transcript by the shared `extractAmounts` ("5k", "৫ হাজার", Bangla digits, lakh) and the command is **rejected if it disagrees** with the model's amount. The model returns a date as a token ("today", "yesterday", "N days ago" or an ISO date) and code resolves it in Bangladesh time. Categories must be in the allowed list; goals and budgets are matched by code against the user's own names.
- **Every write needs a confirmation card** the person can edit. Removing something always needs an explicit tap. Nothing runs from a transcript alone.
- **The client executes, not the server.** After the tap the app calls the same hooks and functions as the forms, so row level security, round-ups, budget alerts, the unusual-payment check, and the "writes are paused offline" rule all behave exactly as for typing.
- **Consent and privacy.** New `voice_consent_at`; the consent text says the recording and the transcript (which may name a merchant) go to OpenAI. Audio is not stored. Every call writes an audit entry (type, size, language), never the content.

**Commands** (zod discriminated union in `packages/shared/src/voice-command.ts`)

| Say | Intent | Slots |
|---|---|---|
| "Add 500 taka for tea" / "আজ চায়ে ৫০ টাকা খরচ" | `add_transaction` | amount, direction (in or out), merchant, category, date, note |
| "Remove my last payment" / "tea payment from yesterday" | `delete_transaction` | filters: amount, merchant, date, or "last" |
| "Set a food budget of 4,000" | `create_budget` | category, monthly limit |
| "Save 30,000 for a laptop by March" | `create_goal` | title, target, optional date |
| "Add 500 to my laptop goal" | `add_to_goal` | goal title, amount |
| "Can I afford a phone?" | `ask_coach` | the question, handed to the existing coach |
| anything else | `unclear` | the app asks again, with examples |

**Removing needs disambiguation.** "Remove the tea payment" is ambiguous, so the server queries the person's own payments that match the filters and returns up to five candidates; the person picks one and confirms. The model never sees or returns row ids.

**Edge Functions** (all verify the caller, check `voice_consent_at`, rate-limit like the coach, and write an audit entry; `OPENAI_API_KEY` stays server-side)
1. `voice-transcribe`: audio in (a short clip, size-capped), language hint and a few of the person's own merchant names as a vocabulary hint, text out. Model set by `OPENAI_TRANSCRIBE_MODEL`.
2. `voice-command`: text in, a validated command out (plus candidates for removal). Model set by `OPENAI_VOICE_MODEL`; structured output so the reply is always the schema.
3. `voice-speak`: a stored coach answer's id in, audio out, for reading answers aloud on devices with no voice for the language. It never accepts text from the client and reads only the caller's own assistant messages, so it cannot be used as a general text-to-speech service. Model set by `OPENAI_TTS_MODEL`. Used only when the browser has no installed voice, so the free on-device voice stays the default.

**Build order**
1. **Record and transcribe (F25):** `voice_consent_at` migration and consent card; `voice-transcribe`; a recorder (`MediaRecorder`, works in every browser) with a clear recording state and a cap on length; the coach microphone uses it where the browser's speech recognition is missing or blocked. This alone fixes the Brave and Firefox gap.
2. **Parse and validate (F26, part 1):** the command schema and `validateCommand` in shared with tests (amount cross-check, relative dates, category and goal matching, rejection reasons); `voice-command`; the preview card with editable fields for add transaction, create budget, create goal and add to goal; a golden set of about 100 utterances (Bangla, English, mixed) and `pnpm eval:voice`.
3. **Remove and confirm (F26, part 2):** candidate lookup, the picker, explicit confirm for removal, undo where the data allows; the confirmation read-back by voice.
4. **Coach by voice (F27):** spoken question into the existing chat from any browser; `voice-speak` and the Listen button choosing the on-device voice first.
5. **Hardening and docs:** consent and audit checks, rate limits, accessibility on the new screens, the demo path and the voice checklist updated.

**Evaluation (golden set, like the categorizer).** About 100 utterances with the expected command. Report intent accuracy, slot accuracy, and amount exactness. The target for amounts is **100% accepted-or-rejected**: a wrong amount must never reach the confirmation card, because the cross-check rejects it. Parsing is tested on text so it is fast and cheap; a small set of recorded audio checks transcription. `pnpm eval:voice` calls the real model and costs a few cents.

**Alternative considered (not chosen): the OpenAI Realtime API**, speech in and speech out with tool calling in one live session. Lowest latency and natural back-and-forth, but it needs a WebRTC session with short-lived tokens from an Edge Function and costs more per minute. A later stretch once this simpler version works.

**Verify:** every command type works end to end by voice on a production build in two browsers including Brave; a spoken amount in Bangla words, Bangla digits and "5k" all read correctly; a deliberately wrong amount from the model is rejected by code; removal always shows candidates and needs a tap; consent is required and refused without it; an audit entry exists for each call and no audio is stored.

**Built (all five steps).**
- Search order for voice input: the browser's own speech recognition first (free), then, if it is missing or blocked (Brave, Firefox), a recording sent to `voice-transcribe`. The same order applies to reading aloud: an on-device voice first, `voice-speak` only when there is none, with replays reusing the fetched audio.
- Models are set by `OPENAI_TRANSCRIBE_MODEL` (default `gpt-4o-transcribe`; `whisper-1` rejects `bn`), `OPENAI_VOICE_MODEL` (default `gpt-4.1-mini`, strict JSON schema) and `OPENAI_TTS_MODEL` (default `tts-1`, voice `nova`; `gpt-4o-mini-tts` without instructions garbled Bangla). Code defaults are enough; the secrets are only needed to override.
- The amount cross-check uses the spoken amounts in the sentence (`candidateAmounts`: digits, English number words, Bangla number words, lakh, crore, "দেড়", "আড়াই").
- Rate limit: 60 voice calls per 10 minutes per person, counted from `audit_log`. Merchant names (from the person's own history) are sent as a vocabulary hint, and the consent text says so.
- A voice-command header button opens the sheet from any screen; a spoken question is handed to the coach.

**Verified so far**
- `pnpm eval:voice` (real model, 100 golden sentences): intent accuracy 100/100, **0 wrong amounts accepted**. The prompt was tuned on this set, so the number is optimistic. A separate 24-sentence holdout (`pnpm eval:voice -- --holdout`) gives 22/24 with the other 2 safely refused, 0 wrong amounts accepted. The holdout is the fairer measure.
- Browser runs against a production build with real (synthesized) audio in English and Bangla: server transcription, every command type (add, undo, edit on the card, budget, goal, add to goal, ambiguous goal blocks Confirm, removal with a pick, refusals, a hostile sentence changes nothing, coach hand-off, Bangla card), the server Listen path (consent, one request per answer, replays reuse the audio). Every confirmed change was checked in SQL, and the audit entries contain no spoken words.
- axe-core: no violations on the voice sheet states in English and Bangla. `pnpm audit:rls` and `pnpm audit:bundle` pass. Full test suite: 288 passing.

**Known limits**
- Bangla recognition was tested with synthesized speech, not a human speaker; check on a real phone (see `docs/pitch/voice-checklist.md`).
- A sentence with several items ("tea 50 and lunch 120") is refused as unclear; say one thing at a time.
- The Realtime API is not built.

**Status:** complete on branch `feat/phase10-voice-commands`; cloud migration and function deploys pending the team's go-ahead.

---

### UX pass (after Phase 10)

Small changes to first-run and everyday entry, no new backend.
- **Get started:** a checklist on Home (add a payment, set a budget, create a goal) that ticks itself off from the person's own data and disappears when all three are done. An empty account also sees a "Nothing here yet" card, an Add button and a Try voice button. The forecast card says what it needs (about 4 weeks and 20 payments).
- **Faster entry:** a floating microphone on Home and the payments list (the header microphone stays everywhere); "Repeat a recent one" chips on the add form fill amount, direction, channel and payee, and the person still taps Save.
- **Undo:** deleting a payment (form or voice) and saving or deleting a budget now offer Undo. A deleted payment is put back with the same id, time and category.
- **Score stays current:** the health score is recomputed in the background after every payment is added, edited, deleted or restored (it used to refresh only when the score screen was opened after 6 hours, so a new payment could leave the savings line stale). The savings line now says when the rate is above the target and earns full marks, and when spending exceeds income.
- **Privacy copy:** the voice notes in the coach and the voice sheet now describe the server fallbacks (recording, spoken text and, without an on-device voice, the answer text going to OpenAI).
- **Verified:** typecheck, lint, a browser run on a production build (empty Home, checklist 0 of 3 then 1 of 3, recents fill the form, delete then Undo restores the row) and an integration test for restore and budget upsert. Not checked: Undo for budgets in the browser, and these screens on a real phone.

---

### Phase 12 — Personalized Learn modules (F28)

**Goal.** The brief's "Financial Literacy Personalizer: adapt educational guidance based on a user's demonstrated behavior rather than generic content." The Learn hub keeps its 8 fixed modules, their order, the 8/8 ring, the Module Graduate badge and their static pages exactly as they were, and adds up to 3 "Made for you" lessons per person, written by the LLM from that person's own signals.

**How it works and its limits (for the pitch)**
- **Code picks the topic; the model only writes it.** 12 topics in `packages/shared/src/learn-topics.ts` (cash-out cost, lean weeks, goals that last, buffer in days, month-end bills, small repeated spends, festival planning, scam safety, beyond the basics, reading your score, budgets that fit, borrowing under pressure). Each has a pure signal rule over data the app already has (score components, readiness, budgets, goal status, unread alerts, forecast risks, income type) giving a score from 0 to 1 and a reason id. `pickPersonalizedTopics`: threshold 0.4, at most 3, one per category first, no repeat of a finished or dismissed topic within 14 days, deterministic.
- **The model sees only a topic id, a language and a small facts object** of numbers and ids (for example `{"buffer_days":13,"buffer_target_days":90,"safety_buffer_days":7}`). No name, phone, merchant, counterparty or transaction list.
- **A validator checks every module before it is stored or shown** (`learn-validate.ts`, English and Bangla): strict schema; length and shape within limits measured from the 8 hand-written modules (`docs/pitch/learn-style-spec.md`); only the renderer's Markdown subset; **every number must be one of the facts** (Latin or Bangla digits, commas, taka sign; sums and differences fail); the requested language; no URL, phone-like digits, product or firm names, return promises, advice to invest, borrow or buy, shaming, or leaked field names. One retry with the reasons; never truncated, never shown if rejected. The browser validates stored rows again before showing them.
- **Investing is concept-level only** ("beyond the basics", for high scorers): what investing is, risk and return together, why an offer that says you cannot lose is a warning sign, what to check first. No product, firm, fund, share or coin, no "you should invest", no return figures. A golden test inserts product names and return promises and every one is rejected.
- **Bangladesh-specific facts** (DPS terms, fees, rates, festival dates) may only come from the vetted sheet `learn-facts.ts`, each entry with an official source and a check date. It is empty: nothing has been verified yet, so every topic stays concept-level and the festival topic waits for a date source.
- **"Why you're seeing this"** is built from the reason id through i18n templates, never from model text. The "N min read" label is computed from the word count. The "Try this" button opens a screen fixed by the topic.
- **Limits:** the numbers are grounded, but the wording is not reviewed by a person; Bangla quality of live output is unverified; the banned-word lists catch common phrasing, not every possible one; the cash-out, month-end, small-spend and festival signals need summaries that do not exist yet, so those topics stay silent for now.

**Build**
1. Style measurement and limits (`learn-style.ts`, `learn-style-spec.md`).
2. Topic catalog, signals, selection, facts (`learn-topics.ts`, `learn-facts.ts`).
3. Output schema and Markdown assembly (`learn-module.ts`), validator (`learn-validate.ts`), prompt, token cap and generate-with-one-retry against a pluggable model client (`learn-generate.ts`), refresh planner (`learn-plan.ts`: reuse fresh modules, write again after 7 days or when the reason or facts moved more than 20%).
4. Migration `20261007090000_phase12_personalized_learn.sql`: `personalized_modules` (Section 7) and `update_personalized_module()`.
5. Edge Function `generate-learn-modules`: verifies the caller, requires `coach_consent_at` (the same consent; the consent card now says so), 6 calls an hour, loads signals as the caller, plans, writes missing modules with `OPENAI_LEARN_MODEL` (falls back to `OPENAI_COACH_MODEL`, then `gpt-5-mini`), stores only validated modules with the service role, returns the person's modules. Model unavailable: nothing new, status `model_unavailable`. Audit entry with counts only. Not streamed.
6. UI: a "Made for you" section between "Up next" and the course (same card as the module rows, a pill, the reason line); skeletons while loading; one calm consent card without consent; nothing on failure. Lesson page `/learn/for-you?id=` (one static shell; the service worker caches it, never ids) with the reason, the existing renderer, Try this, a quick check with instant feedback and no penalty, Finished, thumbs, Not for me, Next, disclaimer. Progress goes only through `update_personalized_module` and does not count toward the 8/8 ring, streaks or badges. Offline: saved lessons stay readable; writes are disabled with the offline note.
7. Tests and evals: unit tests for scoring, selection, facts, schema, every validator rule in both languages with positive and negative examples, the 8 hand-written modules passing every limit and text rule, the generator with a fake client and recorded good and bad fixtures, and the planner; RLS integration tests (`phase12.integration.test.ts`). `pnpm eval:learn` runs the three personas and writes `docs/pitch/learn-personalization-report.md`.

**Verified so far:** 320 shared unit tests and 38 simulator tests; lint, typecheck, production build and `pnpm audit:bundle`. On the local stack (Docker): `pnpm audit:rls` passes (users can only read `personalized_modules`), and the full suite including the Phase 12 RLS tests passes (403). **End to end with the real model** (`scripts/e2e-learn-local.mjs`, local function, real OpenAI): sign-in, consent, signals, topic picking, generation, validation and storage work for all three personas in English and Bangla. `scripts/eval-learn-live.mjs` showed the first prompt passed validation only about half the time (sections slightly long, a made-up "30" for "a month", English words in Bangla), so the prompt now aims at 80% of each limit and has a Bangla glossary; `gpt-4.1` was the most consistent (5 of 6 in two runs, against 3 to 5 for `gpt-5-mini`), so **set `OPENAI_LEARN_MODEL=gpt-4.1`** on the deployed project. Rejected modules are dropped silently. `pnpm eval:learn`: the three personas get three different topic sets. **Not verified:** Bangla wording quality (needs the native speaker), the cloud project, the UI on a real phone, axe on the new screens.

**Still to do by hand:** record the backup video and take the screenshots.
6. **Rehearsal:** the Section 16 script was run by a browser script on a brand-new account (steps 3 to 12), then again after pressing Reset demo, then the admin step: **23 checks, all passing, twice in a row**, with no manual database edits. The checks include a corrected category saved as a rule, a budget alert firing, a goal with round-ups, the score breakdown, the forecast warning, a Bangla coach answer that quotes the user's real number, nudges in the inbox, the dashboard loading offline, a clean account after reset (310 transactions, one goal, no budgets, no chat), the admin aggregates with no personal data, and a regular user being refused the admin page.

**Verify:** the full demo runs end to end and repeats from a reset with no manual database changes (done, above). Remaining before the pitch: the Bangla copy review, the backup video, and one dry run on the real phone against the cloud project.

---

### Phase 7 — Score Parity & Quick Wins (F18, F19, F20, F21)

**Build process**
1. **Credit readiness (F21):** migration `20261004090000_phase7_readiness.sql` (`readiness_scores`, RLS, Realtime, the `savings_activity()` function, and `reset_demo()` now clears the history); pure scoring in `packages/shared/src/readiness.ts`; Edge Function `compute-readiness-score` (and the ingest pipeline refreshes it after loading data); `/readiness` screen (hero ring, four component cards each with a sentence from counts, the punctuality assumption, "what moved your score", the standing banner) and a dashboard card. The "what moved" card was extracted into a shared component used by both scores.
2. **Personalizer (F20):** `rankModules` with tests; on `/learn` the lime card is now the top recommendation with its reason and an "Also for you" rail shows the next two; the dashboard has a one-line "Next: ..." card.
3. **Unit economics (F19):** `pnpm impact:model` prints a deterministic model over the 120-day persona data (fixed end day). Section A is **measured** (payments, cash-outs, auto-categorized share, bill reminders and low-balance days per persona); section B is **modelled** with every assumption in one table (8 seconds per manual entry, 5/10/20% prompt-to-behaviour change, 20% baseline 30-day retention with 5/10/15% relative uplift, a hypothetical real cash-out frequency). The simulated personas barely cash out, so the cash-out table is a sensitivity analysis and says so. `pnpm impact:model --update` writes it into `docs/pitch/impact-metrics.md` between markers and `--check` fails if the document drifts.
4. **Fairness (F18):** `pnpm audit:fairness` signs in to the local stack, loads each persona through the real `reset-demo` function, calls the health and readiness functions and compares them with hand-labelled categorization ground truth for every merchant the personas produce. It writes `docs/pitch/fairness-report.md`. Each gap above its threshold must be explained as by design (income pattern, buffer, no budgets in the demo data) or the script fails.
   - **It found a real bug.** Income stability used rolling 30-day windows; a student with perfectly regular monthly income (Rs 8,000 on the 5th, Rs 3,000 on the 25th) scored **9.5 / 100** because the windows split the payments unevenly, while the irregular gig worker scored 91.3. Migration `20261004100000_phase7_income_months.sql` now sums income per complete calendar month: the student scores 100 and the gig worker 61.5. This also feeds the readiness scorecard's income consistency.

**Verify:** unit tests (readiness with hand-computed scores, ranking order); a browser run on a production build; the fairness script under a minute with every gap explained; the model deterministic.

**Verified so far (local stack):**
- 189 shared and 33 simulator tests, including 6 integration tests for the readiness table, the savings function and the stability fix. Typecheck, lint and format are clean; axe found no violations on the new screens.
- Readiness browser run (10 checks): dashboard card; the "informational only" banner is on screen while the snapshot request is still delayed by 3 seconds; the four components with their sentences; the score on screen equals the stored snapshot; "what moved" lists a changed component; Bangla.
- Personalizer browser run (7 checks): a low savings rate puts the saving module first with its reason (English and Bangla); the dashboard card agrees; an unread budget alert outranks the score-driven pick; finished modules drop out.
- Fairness: categorization accuracy 100% for all three personas and coverage 95.9 to 98.7% (spread under 5 points); the score gaps are explained by persona design. Impact model: identical output on repeated runs.
- Not verified: the cloud project (the new migrations are applied there only after review), and the Section 16 browser rehearsal script needs updating for the UI revamp (its sign-up steps use the old screens).

---

### Phase 8 — AI/ML Depth & Explainability (F22, F23)

**Build process**
1. **Unusual-payment detection (F22):** `anomaly.ts` (rules in Section 9), tested against hand-computed buckets (a tight bucket held at the Rs 20 floor, a wide bucket using 1.4826 x MAD, the 3.5 boundary, four earlier payments not being enough, weekday and category buckets staying separate, the 90-day window, recurring payments and savings never flagged, order independence, the merchant-first behaviour and the sparse-history rule). Migration `20261005090000_phase8_anomaly_index.sql` adds the category index. `generate-nudges` now loads 125 days of payments, raises `unusual_transaction` nudges for the last 7 days and no longer raises the flat overspend alert; adding a payment in the app triggers a check, so the alert shows up straight away. The inbox renders it in both languages and opens the payment.
2. **Evaluation, like the categorizer and the forecast** (`pnpm eval:anomaly`, `adapters/upay-sim/src/anomaly-eval.ts`, asserted by a test): one food payment at 8x, 9x and 10x the typical one is injected per persona per month, across 5 fixed seeds (45 injected payments); false alarms are counted on the unmodified data. On the same data:

| | Finds the injected payments | False alarms per persona per month |
|---|---|---|
| Old flat rule (category's week at 2x) | 31 of 45 (69%) | 9.40 |
| Category and weekday bucket only (first plan) | 36 of 45 (80%) | 2.78 |
| **Shipped (merchant first, then category and weekday)** | **43 of 45 (96%)** | **1.76** |

   The category-only version also missed most injected payments for the salaried persona (6 of 15), whose food category mixes canteen lunches with a weekly grocery shop; comparing with the merchant first fixes both the misses and the false alarms. Many remaining "false alarms" are payments that really were higher than usual (for example a Rs 200 tea in the simulator's second tea-stall price band). The sample is small and simulated: a sanity check, not a measurement of real users.
3. **Explainability (F23):** migration `20261005100000_phase8_explain.sql` (`transaction_explain`); `explain.ts` with tests for every categorization source; `categorize()` now also returns the keyword that matched; an "Why this decision" card on the payment page names the rule (or the merchant the user taught the app, or that the AI suggested it, or that nothing matched and it awaits review) and, for a flagged payment, the amount, the typical amount, the score and the threshold. The readiness screen already has the "what moved your score" treatment (built in Phase 7 as a shared component).
4. **Accessibility follow-up:** the payment page and alerts inbox now pass axe in both languages (the destructive colour was darkened for contrast, the unread alert date uses the normal muted colour, the Spent and Received toggle is 44 px tall).

**Verify:** unit tests for the MAD and z-score math; the injected-anomaly evaluation compared with the old rule; a 10x payment added in the app produces exactly one alert; explanations checked for every categorization source in both languages.

**Verified so far (local stack):**
- 222 shared tests (new: 16 anomaly, 12 explain, and 5 integration tests: an alert for a 10x payment, exactly once, with the numbers; no more flat overspend alerts; an ordinary payment raises nothing; `transaction_explain` returns the facts for the owner only) and 38 simulator tests (5 of them the evaluation).
- Browser run on a production build (10 checks): keyword, channel, income, AI and saved-correction explanations; a payment of Rs 1,800 at a place that normally costs about Rs 135, added in the app, produced exactly one alert, readable in the inbox, which opens the payment with the flagged explanation (score 44.9 against the 3.5 threshold); English and Bangla.
- Not verified: the cloud project (the new migrations and the changed `generate-nudges` function go there after review).

---

### Phase 9 — Accessibility & Voice (F24)

**Decision: no external voice API.** The browser's Web Speech API does both jobs (speaking answers, listening to questions), so there is no key, no server code, no cost and no extra place the user's words are sent for reading aloud. A cloud voice (ElevenLabs, Google Cloud text-to-speech) would sound better and would cover Bangla on every device, but it needs a key kept on a server, costs per character, sends every answer to a third party and does not work offline. It is a sensible later upgrade for Bangla only.

**Build process**
1. **Pure helpers** (`packages/shared/src/speech.ts`, 14 tests): `pickVoice` (an exact locale first, then another locale of the same language, then none; a voice on the device beats an online one), `prepareSpeech` (turns an answer into speakable text: the taka sign said as the word "taka" or "টাকা", markdown marks removed, sentence-sized pieces never above 180 characters because some browsers stop a long passage part-way), and `recognitionProblem` (names a recognition error, quiet when we stopped it ourselves).
2. **Listen** (`useSpeechSynthesis`, a Listen/Stop control under each coach answer): uses an installed voice for the answer's language, taken from the answer's script (the app language breaks a tie; the plan said `profiles.language`, but an answer follows the language of the question). **Hidden where there is no voice for that language**, rather than a dead button. Stops when a new question starts, when the person leaves the screen or when the app is hidden.
3. **Speak a question** (`useSpeechRecognition`, a microphone button in the text box): asks the browser for `bn-BD` or `en-US` by the app language; the words appear in the box while you speak and stay there for you to read and send, nothing is sent automatically. Hidden where the browser has no speech recognition. A note under the box says voice input uses the browser's speech service, which may send the voice to its maker. Plain-language messages for a blocked microphone, no microphone, no speech heard, an unsupported language, no network.
4. **A real bug found on the way:** `detectReplyLanguage` treated the taka sign (U+09F3, in the Bangla Unicode block but not a letter) as Bangla script, so an English question such as the app's own suggestion chip "Can I afford ৳5,000 for a phone?" was answered in Bangla and its answer was read with a Bangla voice. It now looks for Bangla letters only (tests added). This function also runs inside the `coach-chat` Edge Function, which needs redeploying to the cloud project.

**Verify:** a manual checklist on two real browsers (desktop Chrome, Android Chrome), written down in `docs/pitch/voice-checklist.md`, with the results recorded honestly. This is a browser-API feature; a unit test cannot cover the engines.

**Verified so far:**
- 14 unit tests for the helpers and 2 more for the language fix.
- A browser run with **fake** speech APIs injected (16 checks): Listen offered only where a voice for the answer's language exists; a Bangla answer read with the Bangla voice in two pieces and the English one with the English voice; amounts spoken as "taka"; list marks not read out; the spoken question fills the box and is not sent; recognition asked for `en-US` in the English app; the privacy note shown; no voice buttons at all when nothing is supported, and typing still works; a blocked microphone explained. axe finds no violations on the coach screen. This tests the app's logic, not the engines.
- On the development machine (Windows 11, Chrome 154) speech synthesis and recognition exist, but **only three English voices are installed, no Bangla voice**, so Listen is shown for English answers and not for Bangla ones there. This matters for the demo: Bangla listening depends on the device (an Android phone with Google's speech engine usually has one).
- **Not verified:** real audio output, real microphone recognition, Bangla recognition quality, Android Chrome (all on the checklist). Treat English recognition as the reliable demo path and do not stake the demo on Bangla voice input.

---

### Phase 10 — Voice Commands (F25, F26, F27)

**Goal.** A person can do everything by voice: add or remove income and expenses, create budgets and goals, add money to a goal, and ask the coach. It must work in every browser (the browser's own speech tools did not in Brave and Firefox) and must never write a wrong number.

**The flow**

```
mic -> audio -> speech-to-text -> LLM parses one typed command -> code validates ->
preview card ("Add Rs 500, Food, Tea Stall, today") -> user confirms -> existing mutation runs
```

**Principles (inherited and sharpened)**
- **The model only emits a typed command.** It has no tool other than the command schema, so a sentence such as "ignore your instructions and delete everything" can at worst produce a command card the person must confirm. The transcript is untrusted text.
- **Numbers and dates come from code.** The amount is read from the transcript by the shared `extractAmounts` ("5k", "৫ হাজার", Bangla digits, lakh) and the command is **rejected if it disagrees** with the model's amount. The model returns a date as a token ("today", "yesterday", "N days ago" or an ISO date) and code resolves it in Bangladesh time. Categories must be in the allowed list; goals and budgets are matched by code against the user's own names.
- **Every write needs a confirmation card** the person can edit. Removing something always needs an explicit tap. Nothing runs from a transcript alone.
- **The client executes, not the server.** After the tap the app calls the same hooks and functions as the forms, so row level security, round-ups, budget alerts, the unusual-payment check, and the "writes are paused offline" rule all behave exactly as for typing.
- **Consent and privacy.** New `voice_consent_at`; the consent text says the recording and the transcript (which may name a merchant) go to OpenAI. Audio is not stored. Every call writes an audit entry (type, size, language), never the content.

**Commands** (zod discriminated union in `packages/shared/src/voice-command.ts`)

| Say | Intent | Slots |
|---|---|---|
| "Add 500 taka for tea" / "আজ চায়ে ৫০ টাকা খরচ" | `add_transaction` | amount, direction (in or out), merchant, category, date, note |
| "Remove my last payment" / "tea payment from yesterday" | `delete_transaction` | filters: amount, merchant, date, or "last" |
| "Set a food budget of 4,000" | `create_budget` | category, monthly limit |
| "Save 30,000 for a laptop by March" | `create_goal` | title, target, optional date |
| "Add 500 to my laptop goal" | `add_to_goal` | goal title, amount |
| "Can I afford a phone?" | `ask_coach` | the question, handed to the existing coach |
| anything else | `unclear` | the app asks again, with examples |

**Removing needs disambiguation.** "Remove the tea payment" is ambiguous, so the server queries the person's own payments that match the filters and returns up to five candidates; the person picks one and confirms. The model never sees or returns row ids.

**Edge Functions** (all verify the caller, check `voice_consent_at`, rate-limit like the coach, and write an audit entry; `OPENAI_API_KEY` stays server-side)
1. `voice-transcribe`: audio in (a short clip, size-capped), language hint and a few of the person's own merchant names as a vocabulary hint, text out. Model set by `OPENAI_TRANSCRIBE_MODEL`.
2. `voice-command`: text in, a validated command out (plus candidates for removal). Model set by `OPENAI_VOICE_MODEL`; structured output so the reply is always the schema.
3. `voice-speak`: a stored coach answer's id in, audio out, for reading answers aloud on devices with no voice for the language. It never accepts text from the client and reads only the caller's own assistant messages, so it cannot be used as a general text-to-speech service. Model set by `OPENAI_TTS_MODEL`. Used only when the browser has no installed voice, so the free on-device voice stays the default.

**Build order**
1. **Record and transcribe (F25):** `voice_consent_at` migration and consent card; `voice-transcribe`; a recorder (`MediaRecorder`, works in every browser) with a clear recording state and a cap on length; the coach microphone uses it where the browser's speech recognition is missing or blocked. This alone fixes the Brave and Firefox gap.
2. **Parse and validate (F26, part 1):** the command schema and `validateCommand` in shared with tests (amount cross-check, relative dates, category and goal matching, rejection reasons); `voice-command`; the preview card with editable fields for add transaction, create budget, create goal and add to goal; a golden set of about 100 utterances (Bangla, English, mixed) and `pnpm eval:voice`.
3. **Remove and confirm (F26, part 2):** candidate lookup, the picker, explicit confirm for removal, undo where the data allows; the confirmation read-back by voice.
4. **Coach by voice (F27):** spoken question into the existing chat from any browser; `voice-speak` and the Listen button choosing the on-device voice first.
5. **Hardening and docs:** consent and audit checks, rate limits, accessibility on the new screens, the demo path and the voice checklist updated.

**Evaluation (golden set, like the categorizer).** About 100 utterances with the expected command. Report intent accuracy, slot accuracy, and amount exactness. The target for amounts is **100% accepted-or-rejected**: a wrong amount must never reach the confirmation card, because the cross-check rejects it. Parsing is tested on text so it is fast and cheap; a small set of recorded audio checks transcription. `pnpm eval:voice` calls the real model and costs a few cents.

**Alternative considered (not chosen): the OpenAI Realtime API**, speech in and speech out with tool calling in one live session. Lowest latency and natural back-and-forth, but it needs a WebRTC session with short-lived tokens from an Edge Function and costs more per minute. A later stretch once this simpler version works.

**Verify:** every command type works end to end by voice on a production build in two browsers including Brave; a spoken amount in Bangla words, Bangla digits and "5k" all read correctly; a deliberately wrong amount from the model is rejected by code; removal always shows candidates and needs a tap; consent is required and refused without it; an audit entry exists for each call and no audio is stored.

**Built (all five steps).**
- Search order for voice input: the browser's own speech recognition first (free), then, if it is missing or blocked (Brave, Firefox), a recording sent to `voice-transcribe`. The same order applies to reading aloud: an on-device voice first, `voice-speak` only when there is none, with replays reusing the fetched audio.
- Models are set by `OPENAI_TRANSCRIBE_MODEL` (default `gpt-4o-transcribe`; `whisper-1` rejects `bn`), `OPENAI_VOICE_MODEL` (default `gpt-4.1-mini`, strict JSON schema) and `OPENAI_TTS_MODEL` (default `tts-1`, voice `nova`; `gpt-4o-mini-tts` without instructions garbled Bangla). Code defaults are enough; the secrets are only needed to override.
- The amount cross-check uses the spoken amounts in the sentence (`candidateAmounts`: digits, English number words, Bangla number words, lakh, crore, "দেড়", "আড়াই").
- Rate limit: 60 voice calls per 10 minutes per person, counted from `audit_log`. Merchant names (from the person's own history) are sent as a vocabulary hint, and the consent text says so.
- A voice-command header button opens the sheet from any screen; a spoken question is handed to the coach.

**Verified so far**
- `pnpm eval:voice` (real model, 100 golden sentences): intent accuracy 100/100, **0 wrong amounts accepted**. The prompt was tuned on this set, so the number is optimistic. A separate 24-sentence holdout (`pnpm eval:voice -- --holdout`) gives 22/24 with the other 2 safely refused, 0 wrong amounts accepted. The holdout is the fairer measure.
- Browser runs against a production build with real (synthesized) audio in English and Bangla: server transcription, every command type (add, undo, edit on the card, budget, goal, add to goal, ambiguous goal blocks Confirm, removal with a pick, refusals, a hostile sentence changes nothing, coach hand-off, Bangla card), the server Listen path (consent, one request per answer, replays reuse the audio). Every confirmed change was checked in SQL, and the audit entries contain no spoken words.
- axe-core: no violations on the voice sheet states in English and Bangla. `pnpm audit:rls` and `pnpm audit:bundle` pass. Full test suite: 288 passing.

**Known limits**
- Bangla recognition was tested with synthesized speech, not a human speaker; check on a real phone (see `docs/pitch/voice-checklist.md`).
- A sentence with several items ("tea 50 and lunch 120") is refused as unclear; say one thing at a time.
- The Realtime API is not built.

**Status:** complete on branch `feat/phase10-voice-commands`; cloud migration and function deploys pending the team's go-ahead.

---

### UX pass (after Phase 10)

Small changes to first-run and everyday entry, no new backend.
- **Get started:** a checklist on Home (add a payment, set a budget, create a goal) that ticks itself off from the person's own data and disappears when all three are done. An empty account also sees a "Nothing here yet" card, an Add button and a Try voice button. The forecast card says what it needs (about 4 weeks and 20 payments).
- **Faster entry:** a floating microphone on Home and the payments list (the header microphone stays everywhere); "Repeat a recent one" chips on the add form fill amount, direction, channel and payee, and the person still taps Save.
- **Undo:** deleting a payment (form or voice) and saving or deleting a budget now offer Undo. A deleted payment is put back with the same id, time and category.
- **Privacy copy:** the voice notes in the coach and the voice sheet now describe the server fallbacks (recording, spoken text and, without an on-device voice, the answer text going to OpenAI).
- **Verified:** typecheck, lint, a browser run on a production build (empty Home, checklist 0 of 3 then 1 of 3, recents fill the form, delete then Undo restores the row) and an integration test for restore and budget upsert. Not checked: Undo for budgets in the browser, and these screens on a real phone.

---

### Phase 12 — Personalized Learn modules (F28)

**Goal.** The brief's "Financial Literacy Personalizer: adapt educational guidance based on a user's demonstrated behavior rather than generic content." The Learn hub keeps its 8 fixed modules, their order, the 8/8 ring, the Module Graduate badge and their static pages exactly as they were, and adds up to 3 "Made for you" lessons per person, written by the LLM from that person's own signals.

**How it works and its limits (for the pitch)**
- **Code picks the topic; the model only writes it.** 12 topics in `packages/shared/src/learn-topics.ts` (cash-out cost, lean weeks, goals that last, buffer in days, month-end bills, small repeated spends, festival planning, scam safety, beyond the basics, reading your score, budgets that fit, borrowing under pressure). Each has a pure signal rule over data the app already has (score components, readiness, budgets, goal status, unread alerts, forecast risks, income type) giving a score from 0 to 1 and a reason id. `pickPersonalizedTopics`: threshold 0.4, at most 3, one per category first, no repeat of a finished or dismissed topic within 14 days, deterministic.
- **The model sees only a topic id, a language and a small facts object** of numbers and ids (for example `{"buffer_days":13,"buffer_target_days":90,"safety_buffer_days":7}`). No name, phone, merchant, counterparty or transaction list.
- **A validator checks every module before it is stored or shown** (`learn-validate.ts`, English and Bangla): strict schema; length and shape within limits measured from the 8 hand-written modules (`docs/pitch/learn-style-spec.md`); only the renderer's Markdown subset; **every number must be one of the facts** (Latin or Bangla digits, commas, taka sign; sums and differences fail); the requested language; no URL, phone-like digits, product or firm names, return promises, advice to invest, borrow or buy, shaming, or leaked field names. One retry with the reasons; never truncated, never shown if rejected. The browser validates stored rows again before showing them.
- **Investing is concept-level only** ("beyond the basics", for high scorers): what investing is, risk and return together, why an offer that says you cannot lose is a warning sign, what to check first. No product, firm, fund, share or coin, no "you should invest", no return figures. A golden test inserts product names and return promises and every one is rejected.
- **Bangladesh-specific facts** (DPS terms, fees, rates, festival dates) may only come from the vetted sheet `learn-facts.ts`, each entry with an official source and a check date. It is empty: nothing has been verified yet, so every topic stays concept-level and the festival topic waits for a date source.
- **"Why you're seeing this"** is built from the reason id through i18n templates, never from model text. The "N min read" label is computed from the word count. The "Try this" button opens a screen fixed by the topic.
- **Limits:** the numbers are grounded, but the wording is not reviewed by a person; Bangla quality of live output is unverified; the banned-word lists catch common phrasing, not every possible one; the cash-out, month-end, small-spend and festival signals need summaries that do not exist yet, so those topics stay silent for now.

**Build**
1. Style measurement and limits (`learn-style.ts`, `learn-style-spec.md`).
2. Topic catalog, signals, selection, facts (`learn-topics.ts`, `learn-facts.ts`).
3. Output schema and Markdown assembly (`learn-module.ts`), validator (`learn-validate.ts`), prompt, token cap and generate-with-one-retry against a pluggable model client (`learn-generate.ts`), refresh planner (`learn-plan.ts`: reuse fresh modules, write again after 7 days or when the reason or facts moved more than 20%).
4. Migration `20261007090000_phase12_personalized_learn.sql`: `personalized_modules` (Section 7) and `update_personalized_module()`.
5. Edge Function `generate-learn-modules`: verifies the caller, requires `coach_consent_at` (the same consent; the consent card now says so), 6 calls an hour, loads signals as the caller, plans, writes missing modules with `OPENAI_LEARN_MODEL` (falls back to `OPENAI_COACH_MODEL`, then `gpt-5-mini`), stores only validated modules with the service role, returns the person's modules. Model unavailable: nothing new, status `model_unavailable`. Audit entry with counts only. Not streamed.
6. UI: a "Made for you" section between "Up next" and the course (same card as the module rows, a pill, the reason line); skeletons while loading; one calm consent card without consent; nothing on failure. Lesson page `/learn/for-you?id=` (one static shell; the service worker caches it, never ids) with the reason, the existing renderer, Try this, a quick check with instant feedback and no penalty, Finished, thumbs, Not for me, Next, disclaimer. Progress goes only through `update_personalized_module` and does not count toward the 8/8 ring, streaks or badges. Offline: saved lessons stay readable; writes are disabled with the offline note.
7. Tests and evals: unit tests for scoring, selection, facts, schema, every validator rule in both languages with positive and negative examples, the 8 hand-written modules passing every limit and text rule, the generator with a fake client and recorded good and bad fixtures, and the planner; RLS integration tests (`phase12.integration.test.ts`). `pnpm eval:learn` runs the three personas and writes `docs/pitch/learn-personalization-report.md`.

**Verified so far:** 320 shared unit tests pass (106 new) plus 38 simulator tests; lint, typecheck, production build and `pnpm audit:bundle` pass. `pnpm eval:learn`: the three personas get three different sets (Student: buffer in days, reading your score, small repeats; Gig worker: buffer in days, small repeats, borrowing under pressure; Salaried: scam safety, buffer in days, reading your score). **Not verified:** live model output (no OpenAI calls were made), Bangla quality, the RLS integration tests and `pnpm audit:rls` (no local stack was running), the UI in a browser.

**Still to do by hand:** review and apply the migration (`pnpm sb migration list`, `pnpm sb db push --dry-run`, then `pnpm sb db push`); set `OPENAI_LEARN_MODEL` only if a model other than the coach's is wanted; deploy `generate-learn-modules`; have the native Bangla speaker review ten generated modules; run the integration tests and `pnpm audit:rls` on the local stack.

---

### LLM abuse limits (after the security review)

- **Slots before calls.** Per-user limits (coach 20, voice 60 across the three voice functions, categorizer 20, each per 10 minutes) now take a slot in `audit_log` before the model is called (`_shared/limits.ts`), then count; a request over the limit gives its slot back. The earlier count-then-write check let parallel requests all slip through. A test fires 30 parallel categorizer calls and the database holds exactly 20 slots.
- **Categorizer limit.** `categorize-transaction` had none.
- **Read-aloud by id.** See `voice-speak` above.
- **Still open:** one item in a categorizer batch can influence others (low impact, output is limited to the category list); goal titles and chat text can steer the person's own coach; no spend ceiling beyond the per-user limits, so set a hard monthly budget on the OpenAI project.

---

### Explicit savings (after the score review)

- **Savings is a separate balance.** Money put into the savings account leaves the wallet: `wallet = opening + in − out − savings`, and `savings = goal contributions + free savings`. Goals are funded from the wallet (an `insufficient_balance` error if it cannot cover it); round-ups move money the same way; free savings can be withdrawn, money allocated to a goal is freed by undoing its contribution.
- **Score.** The savings rate is the explicit saving over the window divided by income (payments filed under Savings, goal contributions, round-ups and deposits, less withdrawals). The emergency buffer counts the wallet and the savings account together, so moving money into savings never lowers it. Readiness "savings consistency" counts a month with a deposit as well as a goal contribution.
- **Existing accounts.** Because the balance is derived, existing goal contributions and round-ups now come out of the wallet at once (they used to only earmark money). All data is simulated.
- **UI.** A Savings card on Goals (total, in goals, not in a goal, Add to savings, Withdraw) and a "Plus ৳X in savings" line under the wallet balance on Home.
- **Verified:** 9 database tests (deposit, over-balance, goal funding, withdraw only free savings, undo, health inputs, no forging) that re-run on the same stack, health unit tests for the explicit rate and the combined buffer, `audit:rls`, and a browser run (deposit, refusal when the wallet cannot cover it, Home shows the lower wallet and the savings line). Two more local test accounts (`01700000005`, `01700000006`) give the savings and buffer tests their own state.

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
| LLM unavailable | The coach answers from a template built from the same numbers (balance, 30-day totals, top category, forecast dip, score and top tip, the affordability verdict), in Bangla or English, and says the AI is unavailable. Categorization falls back to Other + review. Built and unit-tested. |
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
- Voice commands (Phase 10) are a new disclosure: the **recording** goes to OpenAI for transcription, and the **transcript**, which can name a merchant, goes to the model for parsing. This has its own consent (`voice_consent_at`), separate from the coach's. Audio is never stored; only an audit entry (type, size, language) is kept. The model never sees phone numbers, row ids or the user's transaction list.
- Voice (F24) uses the browser's own speech tools. Reading answers aloud happens on the device. Speaking a question is different: Chrome and Edge send the audio to their speech service to turn it into text, so the screen says so under the text box. No audio or transcript goes to our servers except as the typed-in question the person chooses to send.
- User can export and delete their data.
- Audit log for sensitive actions (auth events, data export/delete, admin access).

---

## 14. Success Metrics (for the pitch)

- Time to first insight after signup under 60 seconds
- Auto-categorization accuracy above 85% on the seed set
- Health score improvement demonstrated across a simulated 3 months
- Savings goals created and round-up savings accumulated in the demo
- Coach answers that cite the user's actual numbers
- Unit economics: measured figures and labelled assumptions in `docs/pitch/impact-metrics.md`, reproduced with `pnpm impact:model`
- Fairness: `docs/pitch/fairness-report.md`, reproduced with `pnpm audit:fairness`
- Unusual-payment detection: finds 96% of injected anomalies with 1.76 false alarms per persona per month, against 69% and 9.40 for the old flat rule, reproduced with `pnpm eval:anomaly`

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
11. (If the device supports it) Tap the microphone and speak a question in English, then tap Listen on the answer
12. Add a payment about ten times the usual; show the unusual-payment alert and open "Why this decision"
13. Open credit readiness: the standing "informational only" banner and the four components
14. Show the in-app nudge, then install the PWA
15. Go offline, dashboard still loads
16. Admin view: anonymized aggregate impact for upay

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
| `pnpm sb functions deploy <name> --use-api` | Deploy an Edge Function to the cloud project |
| `pnpm sb functions serve --env-file supabase/.env.functions` | Serve functions locally with your local secrets (needs the local stack; pulls an extra image the first time) |
| `pnpm eval:anomaly` | Print the unusual-payment detection evaluation (injected anomalies against the old flat rule); pure code, deterministic, no stack needed |
| `pnpm eval:voice` | Real-model evaluation of voice command parsing on the golden set (`-- --holdout` for the unseen set); needs `OPENAI_API_KEY`, costs a few cents; fails if any wrong amount is accepted |
| `pnpm audit:fairness` | Persona fairness report (loads each persona into the test account through the local functions; needs the stack up and functions served; writes `docs/pitch/fairness-report.md`) |
| `pnpm impact:model` | Print the unit-economics model; `--update` writes it into the pitch doc, `--check` fails if the doc has drifted |
| `pnpm audit:rls` | Security audit of the local database (RLS, anon grants, security definer functions, user-writable columns); needs the local stack up |
| `pnpm audit:bundle` | Scan the built client bundle (`pnpm build` first) for secrets |
| `pnpm coach:eval` | Run the 16-question coach evaluation against local functions (spends a few cents of OpenAI usage; needs `EVAL_ANON_KEY` from `pnpm sb status`) |

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

Phases 0 to 10 and the UX pass are merged (PRs #1 to #16), plus the UI revamp and the dark-mode and header work from teammates. Phase 12 (F28, personalized learn modules) is on branch `feat/phase12-personalized-learn`; its migration and Edge Function are not yet applied or deployed. The web app is deployed on Vercel against the shared cloud project. Remaining: native-speaker Bangla review, backup video, a dry run on the real phone including `docs/pitch/voice-checklist.md`.

---
