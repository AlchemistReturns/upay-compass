# upay Compass

A financial companion for everyday upay users, built for the **DIU CPC × upay AI Hackathon 2026, Track 03 (Customer Innovation & Financial Independence)**.

**Live deployment: https://upay-compass.vercel.app/**

For the full design (decisions, data model, security, evaluation results) see [spec.md](spec.md). This README is enough to understand, set up, run and test the project.

## 1. Project overview

**Problem.** Many people who use a mobile wallet (students, gig and informal workers, first-time savers) can see their transactions but cannot easily tell where their money goes, whether they can afford something next week, or how to start saving. Advice is usually in English, generic, and not tied to their own numbers.

**Solution.** upay Compass turns wallet transactions into plain-language insight and guidance, in **Bangla and English**:

```
Connect → Understand → Plan → Save → Get guided → Improve
```

**Purpose.** Help a person understand their money, build a saving habit and move toward financial independence, while keeping every number auditable and the person in control. There is no live upay system, so the app runs on **simulated or user-entered data** behind a swappable adapter (`adapters/upay-sim`); a real upay feed could replace it later. No real money moves, and simulated data is labelled as simulated.

**Guiding rule: AI for language, code for numbers.** Language models write explanations and understand speech. Every figure (balance, scores, forecast, "can I afford this?", amounts from a spoken command) is computed or checked by deterministic, unit-tested code.

## 2. Features

| Area | What it does |
|---|---|
| **Sign-in and lock** | Phone number + OTP, then a 4 to 6 digit app PIN (stored hashed on the server, 5 wrong tries clear it). Auto-lock after 2 minutes in the background. |
| **Dashboard and transactions** | Wallet balance, income and spending by period, category breakdown, weekly chart, searchable payment list, add/edit/delete with Undo, "repeat a recent payment". |
| **Auto-categorization** | Rules first (your own corrections, then a channel and keyword map), an LLM only for merchants the rules cannot place. Corrections teach the app. |
| **Budgets and goals** | Monthly category budgets with alerts at your chosen level, savings goals with projected finish dates, optional round-up saving. |
| **Financial health score** | 0 to 100 from savings rate, budget adherence, cash buffer and income stability, with plain "what to improve" actions. |
| **Credit readiness** | An informational scorecard (not a credit decision) with the steps that would raise it. |
| **30-day forecast** | Detects recurring income and bills, projects the balance, flags days it may go below a safety buffer. Backtested against a naive baseline. |
| **Unusual-payment alerts** | Flags payments far above a merchant's normal amount, with a plain explanation of why. |
| **AI coach** | Chat in Bangla or English grounded in your own numbers. Answers "Can I afford ৳5,000 for a phone?" using a verdict computed in code. Works without the AI (template answer). |
| **Voice** | Speak to the coach and give **voice commands**: add or remove a payment, set a budget, create a goal, add to a goal, or ask the coach. Every command is shown on an editable card and runs only after you confirm. Works in any browser. Coach answers can be read aloud. |
| **Learn** | Short financial-literacy modules in Bangla and English, ranked by your own situation. |
| **Alerts, streaks, badges** | In-app inbox of budget and unusual-payment alerts, a saving streak and badges. |
| **PWA** | Installable, works offline for reading the last-saved data, light and dark themes. |
| **Admin view** | Aggregate-only insights across groups of people (small groups are hidden), for the admin role only. |

### How the AI components are used

| Component | Model (default, configurable) | What it may do | What it may not do |
|---|---|---|---|
| **Coach** (`coach-chat`) | `gpt-5-mini` (`OPENAI_COACH_MODEL`) | Explain a summary of your numbers in your language. | Invent figures; it gets no phone, name, merchant names or transaction list. The "can I afford" verdict comes from code. |
| **Categorization fallback** (`categorize-transaction`) | `gpt-4o-mini` (`OPENAI_CATEGORIZE_MODEL`) | Return one category key for a merchant the rules could not place. | Return anything outside the allowed category list (validated; unknown becomes "Other, needs review"). |
| **Voice command parsing** (`voice-command`) | `gpt-4.1-mini` (`OPENAI_VOICE_MODEL`) | Turn one sentence into a typed command (strict JSON schema). | Choose the amount: code checks the amount appears in what was said, resolves dates, matches goals and categories. Nothing is written until you confirm. |
| **Speech to text** (`voice-transcribe`) | `gpt-4o-transcribe` (`OPENAI_TRANSCRIBE_MODEL`) | Transcribe a short recording, only when the browser's own speech recognition is missing or blocked. | Store audio. |
| **Text to speech** (`voice-speak`) | `tts-1` (`OPENAI_TTS_MODEL`) | Read a stored coach answer aloud, only when the device has no voice for the language. | Speak text sent by the client. |

Not AI (deterministic, tested code): health score, readiness, forecast, unusual-payment detection, nudges, learn ranking. All model calls are made from Supabase Edge Functions; the OpenAI key never reaches the browser. Sending data to OpenAI needs the person's consent (separate for the coach and for voice), and every call is rate limited and audited without storing what was said.

## 3. Technology stack

- **Language and tooling:** TypeScript, Node.js, pnpm workspaces, ESLint, Prettier, Husky, Vitest.
- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS 4, Base UI, TanStack Query, i18next (English and Bangla), Recharts, zod, installable PWA with a service worker.
- **Backend:** Supabase (Postgres with row level security on every table, Auth with phone OTP, Realtime, Edge Functions on Deno).
- **AI and APIs:** OpenAI API (chat, structured output, speech-to-text, text-to-speech) called only from Edge Functions; the browser's Web Speech API where available.
- **Hosting:** Vercel (web app), Supabase cloud (database, auth, functions).
- **Shared logic:** `packages/shared` (pure, unit-tested TypeScript used by both the app and the functions).

## 4. Requirements

- **Node.js 22 or newer** (20 works for the app; the evaluation scripts use `--experimental-transform-types`, which needs 22.6+).
- **pnpm 11** (`corepack enable` picks the version pinned in `package.json`).
- A modern browser (Chrome, Edge, Firefox, Safari, Brave). Microphone use needs HTTPS or `localhost`.
- **To run your own backend** you need one of:
  - **Docker Desktop** for the self-contained local Supabase stack (no cloud account), or
  - a **Supabase project** (free tier is enough).
- An **OpenAI API key** for the AI features. Without it everything still runs: the coach answers from a template, uncategorizable payments go to "Other, needs review", and voice is unavailable.
- No special hardware. A microphone is only needed to try voice.

The easiest way to evaluate the project is the **live deployment** above; you do not need to install anything for that (see Testing).

## 5. Installation and setup

```bash
git clone https://github.com/AlchemistReturns/upay-compass.git
cd upay-compass
corepack enable
pnpm install
```

Pick **one** backend.

### Option A: local Supabase stack (no cloud account)

```bash
cp supabase/.env.example supabase/.env     # dummy SMS token; no SMS is ever sent
pnpm sb start                              # Postgres, Auth, REST, Edge runtime in Docker; applies all migrations
pnpm sb status                             # prints the API URL and the anon key
```

Create `apps/web/.env.local` with the values from `pnpm sb status`:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon / publishable key from pnpm sb status>
```

For the AI features, create `supabase/.env.functions` (gitignored) and serve the functions:

```
OPENAI_API_KEY=<your OpenAI key>
```

```bash
pnpm sb functions serve --env-file supabase/.env.functions   # keep this running in a second terminal
```

Local test logins (from `supabase/config.toml`): `01700000001` to `01700000004`, OTP `123456`.

### Option B: your own Supabase cloud project

1. Create a project at supabase.com. Copy the project URL, the anon key, and the project ref.
2. In **Authentication → Providers → Phone**, enable the provider (dummy Twilio credentials are fine for test numbers) and add test phone numbers with a fixed OTP (for example `8801700000010` with `123456`).
3. Link, migrate and deploy:

```bash
pnpm sb login
pnpm sb link --project-ref <project-ref>
pnpm sb db push                      # applies every migration in supabase/migrations
for f in categorize-transaction coach-chat compute-health-score compute-readiness-score \
         forecast-cashflow generate-nudges ingest-transactions reset-demo seed-demo \
         voice-command voice-speak voice-transcribe; do
  pnpm sb functions deploy $f --use-api
done
pnpm sb secrets set OPENAI_API_KEY=<your OpenAI key>
```

4. Create `apps/web/.env.local` with the project URL and anon key (see below).

The functions are configured with `verify_jwt = false` in `supabase/config.toml` and verify the caller themselves, so keep that file as it is.

## 6. Environment variables

**Web app** (`apps/web/.env.local`, never committed; on Vercel set them in Project Settings → Environment Variables):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL, e.g. `https://<project-ref>.supabase.co` or `http://127.0.0.1:54321` locally. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (publishable) key. Public by design; row level security protects the data. |

**Edge Functions** (secrets on the Supabase project via `pnpm sb secrets set`, or `supabase/.env.functions` locally). `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided to functions by Supabase automatically.

| Variable | Required | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | For AI features | Key used by every OpenAI call. Server-side only. |
| `OPENAI_COACH_MODEL` | No (`gpt-5-mini`) | Model for the coach. |
| `OPENAI_CATEGORIZE_MODEL` | No (`gpt-4o-mini`) | Model for the categorization fallback. |
| `OPENAI_VOICE_MODEL` | No (`gpt-4.1-mini`) | Model that parses voice commands. |
| `OPENAI_TRANSCRIBE_MODEL` | No (`gpt-4o-transcribe`) | Speech-to-text model. |
| `OPENAI_TTS_MODEL` | No (`tts-1`) | Text-to-speech model. |

**Local stack only** (`supabase/.env`): `SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=dummy`, so Auth accepts test OTPs (copy from `supabase/.env.example`).

Use placeholders in anything you commit. `.env*` files are gitignored.

## 7. Run and build

```bash
pnpm dev                          # development server at http://localhost:3000
pnpm build                        # production build
pnpm --filter web start           # serve the production build at http://localhost:3000
pnpm lint                         # ESLint
pnpm typecheck                    # TypeScript across all workspaces
pnpm format:check                 # Prettier
```

Restart the server after changing `.env.local`. The web app is deployed from `main` on Vercel with the two `NEXT_PUBLIC_*` variables set.

## 8. Live deployment

**https://upay-compass.vercel.app/**

Open it on a phone or desktop. It is a PWA, so it can be installed from the browser menu. Use the language button in the header to switch between English and Bangla.

## 9. Testing

### Try the live app

Sign in with a **test phone number** (no SMS is sent; the code is fixed):

| Phone number | OTP |
|---|---|
| `01700000010` | `123456` |
| `01700000011` | `123456` |

What to expect and what to try:

1. Enter the number, then the OTP. A first-time number goes through **set a PIN (4 to 6 digits)** and a short onboarding. On later logins you enter the OTP and then your PIN. If someone else already set the PIN on a shared test number, the next person needs that PIN; five wrong PIN tries clear it and you can set a new one after the next OTP login. If you see HTTP 429 or "try again", wait a minute and retry (OTP sends are rate limited).
2. A new account starts **empty** (there is no demo data to load). Add data in any of these ways:
   - **+ Add transaction** on Home (or "Repeat a recent one" once you have some);
   - the **microphone** button: say or type "Add 500 taka for tea at Rahim stall", check the card, then Confirm (Undo appears afterwards);
   - at least about 4 weeks and 20 payments are needed before the forecast is available; the score, budgets, goals and coach work with less.
3. Try: set a budget ("Set a food budget of 4000"), create a goal ("Save 30000 for a laptop"), add to it ("Add 500 to my laptop goal"), remove a payment ("Remove my last payment", which needs a pick and a tap), and ask the coach ("Can I afford a 5000 taka phone?", or in Bangla). The coach and voice ask for consent once before sending anything to OpenAI.
4. Check the **Financial health** and **Credit readiness** cards, the alerts bell, Learn, and the dark theme.
5. Voice works in every browser: if the browser's own speech recognition is unavailable (for example Brave or Firefox) a short recording is sent to the server for transcription after you agree.

### Automated tests

```bash
pnpm test                          # unit tests for all workspaces (no backend needed)
```

The integration tests (row level security, PIN functions, voice and coach function guards, undo, rate limits) need a running stack with the functions served, because they sign in as real test users. Start the local stack as in Option A, then:

```bash
RLS_TEST_URL=http://127.0.0.1:54321 \
RLS_TEST_ANON_KEY=<anon key from pnpm sb status> \
pnpm test
```

Without those two variables the integration tests are skipped. Add `RLS_TEST_SEED=1` to also run the one test that loads the demo cohort through the admin path. They use the local test numbers `01700000001` to `01700000004`. Some of them call OpenAI and need `OPENAI_API_KEY` in `supabase/.env.functions`.

### Evaluations and audits

| Command | What it checks |
|---|---|
| `pnpm eval:voice` | Voice command parsing on a golden set (`-- --holdout` for unseen sentences). Calls OpenAI. Fails if any wrong amount is accepted. |
| `pnpm coach:eval` | 16-question coach evaluation (grounded figures, guardrails, prompt secrecy). Calls OpenAI; needs `EVAL_ANON_KEY` from `pnpm sb status`. |
| `pnpm eval:anomaly` | Unusual-payment detection against the old flat rule (deterministic, no backend). |
| `pnpm audit:rls` | Security audit of the local database (RLS, anon grants, security-definer functions). |
| `pnpm audit:bundle` | Scans the production build for secrets (`pnpm build` first). |
| `pnpm audit:fairness` | Score fairness across the three simulated personas. |
| `pnpm impact:model` | Prints the unit-economics model. |

## 10. Other configuration

- **Phone login and test numbers.** Real SMS is not used. Test numbers and their fixed OTPs are defined for the local stack in `supabase/config.toml` (`[auth.sms.test_otp]`) and for a cloud project in the dashboard (Authentication → Providers → Phone). The live deployment's test numbers are the two listed above.
- **Database.** Schema and policies are the migrations in `supabase/migrations`, applied in order by `pnpm sb start` (local) or `pnpm sb db push` (cloud). Row level security is on for every table; there is no way to read another person's rows from the client.
- **Edge Functions** live in `supabase/functions`; shared server code is in `supabase/functions/_shared`.
- **Data.** All transaction data is simulated or entered by the user. `adapters/upay-sim` generates the simulated personas (student, gig worker, salaried) used by the evaluations and tests.
- **Access roles.** Everyone signs in with a phone number. The admin view needs the `admin` role on the profile, set directly in the database.
- **Costs and limits.** AI calls are rate limited per person (coach 20, voice 60, categorizer 20, each per 10 minutes). Set a spending cap on your OpenAI project.
- **Browser support for voice.** Microphone access needs HTTPS or `localhost`. Bangla read-aloud uses an on-device voice when the device has one, otherwise the server voice.

## 11. Repository layout

- `apps/web`: Next.js (App Router) PWA
- `packages/shared`: types, zod schemas and pure logic (score, forecast, categorizer, voice command validation)
- `adapters/upay-sim`: simulated upay transaction feed
- `supabase/`: migrations, Edge Functions, config
- `scripts/`: evaluations and audits
- `docs/pitch/`: architecture, demo script, fairness report, impact model, fallback plan, voice checklist
- `spec.md`: the full specification and developer guide (Section 17)

## 12. Known limits

- Simulated data only; no real upay integration or real money movement.
- Educational guidance only, not financial, investment, credit or insurance advice. The readiness score is informational.
- Bangla speech recognition and read-aloud were tested with synthesized speech; check on a real device (see `docs/pitch/voice-checklist.md`).
- A voice sentence with several items ("tea 50 and lunch 120") is asked again as one at a time.
