# upay Compass: Project Report

**DIU CPC × upay AI Hackathon 2026, Track 03: Customer Innovation & Financial Independence**

Live app: https://upay-compass.vercel.app/ · Source: https://github.com/AlchemistReturns/upay-compass

> **How to read this report.** It is written to stand on its own. Sections 1 to 3 explain the problem and the idea. Sections 4 to 7 describe what was built and how the AI works. Section 8 shows how it was tested. Sections 9 to 11 cover responsible AI, intended real-life impact, and limits. Every number quoted from the project was measured in the repository and can be reproduced with the command named next to it. Figures that are assumptions are labelled as assumptions.

---

## Contents

1. [Executive summary](#1-executive-summary)
2. [The problem](#2-the-problem)
3. [The proposed idea](#3-the-proposed-idea)
4. [The implemented solution](#4-the-implemented-solution)
5. [Key features](#5-key-features)
6. [The AI approach](#6-the-ai-approach)
7. [Data, security and privacy](#7-data-security-and-privacy)
8. [Evaluation and quality](#8-evaluation-and-quality)
9. [Responsible AI](#9-responsible-ai)
10. [Intended real-life impact](#10-intended-real-life-impact)
11. [Limitations and honest scope](#11-limitations-and-honest-scope)
12. [Future work and path to production](#12-future-work-and-path-to-production)
13. [How the project was built](#13-how-the-project-was-built)
14. [Appendix: running and testing](#14-appendix-running-and-testing)

---

## 1. Executive summary

Millions of people use a mobile wallet every day, yet the wallet shows them a **list of payments, not an understanding of their money**. Students, gig workers and first-time savers in particular cannot easily tell where their money goes, whether they can afford something next week, or how to begin saving. Advice, when it exists, is generic and usually in English.

**upay Compass** is a financial companion that sits on top of a wallet's transaction feed. It turns raw payments into plain-language insight and guidance in **Bangla and English**:

```
Connect  →  Understand  →  Plan  →  Save  →  Get guided  →  Improve
```

It categorizes payments automatically, sets budgets and savings goals, scores financial health, forecasts the next 30 days, warns about unusual payments, coaches the person through an AI chat, teaches short financial-literacy lessons, and lets the person do all of this **by voice** in any browser.

The central design rule is **"AI for language, code for numbers."** Language models write explanations and understand speech. Every figure (a balance, a score, a forecast, an affordability verdict, an amount in a spoken command) is computed or verified by an explainable analytics engine of unit-tested code. A model can never put a wrong number on a screen or in the database, because it is never the source of one.

| Fact | Value |
|---|---|
| Delivered as | Installable web app (PWA), Bangla and English, light and dark |
| Backend | Supabase (Postgres with row level security, Auth, Realtime, Edge Functions) |
| AI | OpenAI models, called only from server-side functions, always optional |
| Data | Simulated or user-entered; no real money moves |
| Automated tests | 464 (369 unit tests run anywhere, 95 integration tests against a running stack) |
| Database migrations | 19 |
| Server functions | 13 |

---

## 2. The problem

### 2.1 Who is affected

The product targets three kinds of people, each modelled as a persona in the project:

| Persona | Typical situation |
|---|---|
| **Student** | Small, steady allowance or tuition income; frequent small spending on food, transport and data; little or no saving; spends close to what arrives. |
| **Gig worker** | Irregular, lumpy income; bills fall due whether or not income arrived; the main risk is the balance dipping below zero between payouts. |
| **Salaried worker** | Regular monthly salary; recurring bills; the opportunity is to turn a stable income into savings and a safety buffer. |

All three use a mobile wallet for send-money, cash-out, merchant payments, mobile recharge and bill payments.

### 2.2 What goes wrong today

1. **A list is not insight.** A statement lists payments in time order. It does not say "you spent most on food this month" or "your balance will run low around the 21st."
2. **No plan, no feedback loop.** Without budgets and goals, saving is accidental. Without alerts, overspending is noticed only afterwards.
3. **Cash-flow surprises.** People with irregular income are hurt most by *timing*: a recurring bill lands before the next payout. A balance number alone does not warn them.
4. **Generic, English-only advice.** Financial guidance is rarely personal, and rarely in the person's own language and everyday words.
5. **Low trust in automated advice.** An assistant that invents numbers, or recommends products, is worse than none. People need explanations they can check.
6. **Typing is a barrier.** Entering transactions and questions by keyboard is slow, and speech tools that work in one browser fail in another.

### 2.3 The challenge posed

> Build an intelligent customer-facing product for the upay ecosystem that helps everyday users understand their money, build savings habits, and move toward financial independence.

### 2.4 Constraints the solution had to respect

- No live upay system or real credentials are available, so the product must run on **simulated or user-entered data** behind a swappable adapter, and label simulated data as such.
- **Never move real money.**
- **Educational guidance only**: no regulated investment, loan or insurance advice.
- **Send minimal data to a language model**: never phone numbers or raw identifiers.
- **Keep the person in control**: every automated saving or rule is opt-in and reversible.
- Work in **Bangla and English**.

---

## 3. The proposed idea

### 3.1 The product

A financial companion that connects to a wallet's transaction feed and closes a loop of six steps:

```mermaid
flowchart LR
  A[Connect<br/>transaction feed] --> B[Understand<br/>categories, balance,<br/>unusual payments]
  B --> C[Plan<br/>budgets, goals,<br/>30-day forecast]
  C --> D[Save<br/>goals, round-ups,<br/>streaks]
  D --> E[Get guided<br/>coach, alerts,<br/>learn modules]
  E --> F[Improve<br/>health score,<br/>what moved it]
  F --> B
```

### 3.2 Design principles

| Principle | What it means in practice |
|---|---|
| **AI for language, code for numbers** | The model explains and understands speech; code computes every figure and checks every extracted number. |
| **Explainable by construction** | The health score is a published formula. The category of a payment can be explained ("matched the keyword *bkash*"). An alert says how unusual the payment was and compared with what. |
| **Rules first, AI as fallback** | Cheap, fast, auditable rules handle the common cases; a model only handles what rules cannot place, and its output is validated. |
| **Works without the AI** | If the model is unavailable, the coach answers from a template built from the same numbers, and categorization falls back to "Other, needs review". |
| **Person in control** | Every write from a voice command needs a confirmation on an editable card. Removing something needs an explicit pick and tap. Most changes offer Undo. |
| **Privacy by design** | Row level security on every table, consent before any data goes to a model, no names or phone numbers in prompts, no audio stored. |
| **Real-ready** | A simulated feed implements the same interface a real upay API would, so the rest of the app does not change. |
| **Inclusive** | Bangla and English everywhere, large tap targets, screen-reader support, works on a mid-range phone and offline for reading. |

### 3.3 Why this fits upay and Track 03

Track 03 asks for financial health, savings goals, spending intelligence, financial coaching and inclusive UX. Compass implements each directly (see section 5) and adds responsible-credit readiness as an *informational* scorecard, never a lending decision. For a wallet provider, the same features deepen engagement, move people from cash-out toward digital payments, and create a differentiated value beyond basic payments (section 10).

---

## 4. The implemented solution

### 4.1 System architecture

```mermaid
flowchart TB
  subgraph Client["Phone or desktop: installable PWA (Next.js 16, React 19)"]
    UI["Screens: Home, Payments, Budgets, Goals,<br/>Score, Forecast, Coach, Learn, Alerts, Admin"]
    VOICE["Voice layer<br/>browser speech or recorder"]
    CACHE[("Offline cache<br/>last saved data")]
    UI <--> CACHE
    UI <--> VOICE
  end

  subgraph SB["Supabase cloud project"]
    AUTH["Auth: phone OTP<br/>+ server-side PIN"]
    DB[("Postgres<br/>row level security on every table")]
    RPC["Security definer functions<br/>PIN, goals, round-ups, badges, admin aggregates"]
    RT["Realtime<br/>live refresh"]
    subgraph FN["Edge Functions (Deno)"]
      F1["ingest-transactions<br/>categorize-transaction"]
      F2["compute-health-score<br/>compute-readiness-score<br/>forecast-cashflow<br/>generate-nudges"]
      F3["coach-chat"]
      F4["voice-command<br/>voice-transcribe<br/>voice-speak"]
    end
  end

  SIM["Simulated upay feed<br/>(swappable adapter)"] --> F1
  OAI["OpenAI API<br/>chat, structured output,<br/>speech-to-text, text-to-speech"]
  F1 -. "unknown merchants only" .-> OAI
  F3 -. "numbers summary only" .-> OAI
  F4 -. "spoken text, recording, answer text" .-> OAI

  UI -- "JWT" --> AUTH
  UI -- "reads, RLS applies" --> DB
  UI -- "writes via hooks and RPC" --> RPC
  UI -- "invoke with JWT" --> FN
  FN --> DB
  RPC --> DB
  DB --> RT --> UI

  SHARED["packages/shared<br/>pure TypeScript: score, forecast,<br/>categorizer, anomaly, voice validation"]
  SHARED -. "same code runs in browser<br/>and in Edge Functions" .-> UI
  SHARED -.-> FN
```

**Key architectural decisions**

| Decision | Reason |
|---|---|
| One web client plus Supabase, no separate server | Auth, database, row level security and realtime in one place; nothing extra to operate. |
| Intelligence in Edge Functions | The OpenAI key and all prompts stay on the server; the browser never holds a secret. |
| Business logic as pure TypeScript in `packages/shared` | The same tested code runs in the browser and on the server, and keeps the language model out of anything numeric. |
| Functions use `verify_jwt = false` and verify the caller in code | Works with the project's asymmetric JWTs, and every function then acts *as the caller* so row level security still applies. |
| Adapter pattern for the data source | The demo is honest (simulated, labelled), and a real upay API can replace it later. |

### 4.2 Technology stack

| Layer | Technology |
|---|---|
| Language and tooling | TypeScript, Node.js, pnpm workspaces, ESLint, Prettier, Husky, Vitest |
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4, Base UI, TanStack Query, i18next, Recharts, zod, service-worker PWA |
| Backend | Supabase: Postgres, Auth (phone OTP), Realtime, Edge Functions on Deno |
| AI and APIs | OpenAI API (chat, structured output, transcription, text-to-speech); browser Web Speech API |
| Hosting | Vercel (web app), Supabase cloud (database, auth, functions) |

### 4.3 Repository structure

| Path | Contents |
|---|---|
| `apps/web` | The Next.js PWA |
| `packages/shared` | Types, zod schemas, and the pure logic (health, readiness, forecast, categorizer, anomaly, explain, voice validation) |
| `adapters/upay-sim` | The simulated upay feed and its three personas |
| `supabase/` | 19 migrations, 13 Edge Functions, configuration |
| `scripts/` | Evaluations and audits |
| `docs/` | Pitch material, this report |
| `spec.md` | The full specification and developer guide |

### 4.4 Data model

```mermaid
erDiagram
  AUTH_USERS ||--|| PROFILES : has
  AUTH_USERS ||--o| USER_PINS : "server-side PIN"
  PROFILES ||--o{ TRANSACTIONS : owns
  PROFILES ||--o{ CATEGORY_RULES : "own corrections"
  PROFILES ||--o{ BUDGETS : sets
  PROFILES ||--o{ GOALS : sets
  GOALS ||--o{ GOAL_CONTRIBUTIONS : receives
  PROFILES ||--o{ SAVINGS_ENTRIES : "free savings"
  CATEGORIES ||--o{ TRANSACTIONS : classifies
  CATEGORIES ||--o{ BUDGETS : limits
  PROFILES ||--o{ HEALTH_SCORES : snapshots
  PROFILES ||--o{ READINESS_SCORES : snapshots
  PROFILES ||--o{ FORECASTS : snapshots
  PROFILES ||--o{ NUDGES : receives
  PROFILES ||--o{ COACH_MESSAGES : chats
  PROFILES ||--|| GAMIFICATION : "streak, badges"
  PROFILES ||--o{ USER_PROGRESS : completes
  LEARN_MODULES ||--o{ USER_PROGRESS : tracked
  PROFILES ||--o{ AUDIT_LOG : "sensitive actions"
```

Raw transactions are the source of truth; every score, forecast and alert is *derived* and can be recomputed. Every user-data table has row level security, so a person can only ever read or write their own rows.

### 4.5 Request flow: from feed to insight

```mermaid
sequenceDiagram
  participant Feed as Simulated upay feed
  participant Ing as ingest-transactions
  participant Cat as Categorizer (rules, then AI)
  participant DB as Postgres (RLS)
  participant Fn as score / forecast / nudges
  participant App as PWA

  Feed->>Ing: transactions for a persona
  Ing->>Ing: validate each record (zod); rejects go to audit log
  Ing->>Cat: categorize
  Cat-->>Ing: category and how it was decided
  Ing->>DB: upsert in batches, ignore duplicates
  DB-->>App: Realtime change event
  App->>Fn: refresh score, forecast, alerts
  Fn->>DB: read own rows, write snapshots
  DB-->>App: Dashboard, score, forecast, alerts
```

---

## 5. Key features

### 5.1 Overview

| # | Feature | What the person gets |
|---|---|---|
| F1 | **Sign-in and lock** | Phone number and OTP, then a 4 to 6 digit PIN checked only on the server. Auto-lock after 2 minutes in the background. Two steps on every login. |
| F2 | **Bilingual onboarding** | Language, income type, then straight to the app. Language switch in the header at any time. |
| F3-F5 | **Dashboard and transactions** | Wallet balance, income and spending by period, category breakdown, weekly chart, searchable payment list, add, edit, delete with Undo, and one-tap "repeat a recent payment". |
| F4 | **Auto-categorization** | Most payments are filed automatically; corrections teach the app and are never overridden. |
| F6-F8 | **Budgets, goals, savings account, round-ups** | Monthly budgets with alerts, savings goals with projected finish dates, optional round-up of each payment to the next Rs 10 into a goal. |
| F9 | **Financial health score** | A 0 to 100 score from four published components, with "what moved your score" and the top 3 improvement actions. |
| F21 | **Credit readiness (informational)** | A second transparent scorecard that shows what would improve readiness. It is not a credit decision and is not shared with anyone. |
| F10 | **30-day forecast** | Detects recurring income and bills, projects the balance, flags days it may fall below a safety buffer. |
| F22 | **Unusual-payment alerts** | Flags a payment far above what that person normally pays that merchant, and explains why. |
| F23 | **Explain a payment** | "Why this decision": how the category was chosen and why a payment was flagged, in plain sentences. |
| F11 | **AI coach** | Chat in Bangla or English grounded in the person's own numbers, including "Can I afford ৳5,000 for a phone?" |
| F12 | **Alerts** | Budget at 80% and over the limit, unusual payment, goal behind schedule, bill due soon, forecast dip. Rule-driven, not model-driven. |
| F13-F14 | **Learn, streaks, badges** | Short literacy modules in both languages, ranked by what the person's own data suggests, with a saving streak and badges. |
| F15 | **PWA and offline reading** | Installable; opens without a connection and shows the last saved data. |
| F16-F17 | **Admin insights** | Aggregates across groups only; groups smaller than 5 are hidden. |
| F24-F27 | **Voice** | Speak to the coach, give **voice commands**, hear answers read aloud, in any browser. |
| UX pass | **Get started and quick entry** | Checklist for a new account, floating microphone, recent-payment chips, Undo for deletes and budget changes. |

### 5.2 Financial health score

A transparent 0 to 100 score. Each of four components is normalized to 0-100 and then weighted. The rules live in one tested file (`packages/shared/src/health.ts`) and each is measured on the basis that suits it:

| Component | Weight | How it is measured | Full marks |
|---|---|---|---|
| Savings rate | 30% | **Explicit saving** ÷ income over the last 90 days (or since the first transaction). Saving is money the person put into the savings account (deposits, goal contributions, round-ups, less withdrawals) plus payments filed under Savings. | 20% of income put aside |
| Budget adherence | 25% | Average over this month's budgets: within the limit scores 100, falling to 0 at 50% over. | Every budget within its limit |
| Emergency buffer | 25% | (Wallet balance + savings balance) ÷ **a typical month of essential spending**, measured on a monthly basis (below). | 3 months of essentials in reserve |
| Income stability | 20% | Variation of income across the last three complete calendar months (Bangladesh time): steady scores 100, 50% variation or more scores 0. | Steady monthly income |

**Savings is its own balance.** Moving money into savings takes it out of the wallet, so the wallet always shows what is left to spend: `wallet = opening + money in − money out − savings`. Goals are funded from the wallet too (the app refuses a contribution the wallet cannot cover), and round-ups move money the same way. Free savings can be withdrawn back to the wallet; money allocated to a goal is freed by undoing its contribution. The Goals screen shows the savings total split into "in goals" and "not in a goal", and Home shows "Plus ৳X in savings" under the wallet balance.

**Savings rate in practice.** Saving is measured from what was put aside on purpose, not from whatever was left unspent. A person who receives 25,000, spends 4,000 and moves 5,000 into savings has saved 5,000, which is 20% of income, and scores full marks on this part; the screen says so ("You saved 20% of your income, above the 20% target, so this part earns full marks"). Someone who leaves 21,000 untouched in the wallet but moves nothing into savings scores 0 here, which is the nudge to save deliberately. Withdrawals reduce the figure, never below zero, and spending more than you earn is described as such.

**Emergency buffer on a monthly basis.** Whatever a person logs in a month is that month's spending, so the buffer adds up what was logged and never stretches a short history into a month. A payment made once (rent) counts once; a payment made three times counts three times.

- *Typical month of essentials* is the average of the complete calendar months in the data, up to the last three. Essential categories are Food, Transport, Recharge and Data, Bills and Utilities, Education and Health.
- *Until a month has completed*, the buffer uses this month's essentials so far, and the screen labels it "based on this month so far" and notes that it gets more accurate as the month goes on. Early in a month it can look generous, and it settles as spending is logged.
- If no essential spending is logged at all, the buffer cannot be measured and counts as a neutral 50.
- *Savings count toward the buffer.* An emergency fund is liquid reserves, so the buffer uses the wallet and the savings account together: moving money into savings never lowers it.
- *Worked example:* 25,000 in and 4,000 of essentials gives 21,000 in reserve, so the buffer is 21,000 ÷ 4,000 = 5.25 months and scores 100, whether it sits in the wallet or in savings. With rent of 12,000 plus 3,000 of other essentials in each of the last two months, the typical month is 15,000, so a 30,000 wallet is 2 months and scores 67.

If a component cannot be measured yet (no income, no budgets, no essentials), it counts as a neutral 50 and is **labelled as neutral**. Confidence is shown as low under 15 transactions or 28 days of history, and the screen says so. Improvement actions are *data* (an id and numbers) rendered through translation templates, never free text from a model. The score is recomputed in the background whenever a payment is added, edited, deleted or restored, so it never lags what the person just entered.

```mermaid
flowchart LR
  T[Transactions] --> S["Savings rate 30%<br/>explicit saving,<br/>last 90 days"]
  T --> B["Budget adherence 25%<br/>this month's budgets"]
  T --> E["Emergency buffer 25%<br/>(wallet + savings) ÷ typical<br/>month of essentials"]
  T --> I["Income stability 20%<br/>last 3 complete months"]
  S --> W[Weighted sum]
  B --> W
  E --> W
  I --> W
  W --> SC["Score 0-100<br/>+ confidence"]
  SC --> M["What moved<br/>vs previous snapshot"]
  SC --> A["Top 3 actions,<br/>ranked by points to win"]
```

### 5.3 Credit readiness (informational only)

A second, separate scorecard that answers the brief's "responsible credit readiness" idea **without ever acting as a lending decision**. A banner on the screen states it is not a credit decision, not shared with any lender, and does not affect the account.

| Component | Weight | Basis |
|---|---|---|
| Income consistency | 30% | The health score's income stability |
| Bill punctuality | 30% | Each recurring bill payment against the date expected from the person's own pattern |
| Savings consistency | 25% | Months with any goal contribution, round-up or savings deposit |
| Budget adherence | 15% | The health score's budget adherence |

An assumption is shown on the screen: because the simulated feed has no real due dates, punctuality is measured against the date the detector expects from the person's own history.

### 5.4 Forecast

The forecast detects recurring income and bills by interval and amount similarity, projects the balance 30 days ahead, and marks days the balance is below a safety buffer. It needs about four weeks and 20 payments before it claims anything, and otherwise says so.

It was chosen by **backtesting against a baseline**: forecast the last 30 days from what was known before, and compare the average error with "repeat the day from 28 days earlier". On the three personas the forecast's error is **93% (student), 81% (gig) and 80% (salaried) lower** than the baseline. This benchmark does two things. It shows an explainable, pattern-based method already forecasts well, and it gives the project a ready yardstick: any learned model dropped in later is accepted only if it beats these numbers.

### 5.5 Unusual-payment detection

This uses robust statistics, a proven approach for spotting outliers that adapts to each person's own spending pattern and can show exactly why it fired, which suits a financial product where every alert must be explainable. A payment is flagged when it is far above what this person normally pays:

1. Compare with the person's earlier payments to the **same merchant** over 90 days (or, with fewer than 5, the same category and weekday). Compute the median and the median absolute deviation, then a **robust z-score**; flag above **3.5**. The scale has a floor of Rs 20 so a merchant that always charges nearly the same amount cannot cause a false alarm.
2. With sparse history, flag a **first-time merchant** whose amount is more than twice the category median and at least Rs 300 above it.

Only upward outliers are flagged; money in, savings transfers and recurring payments are never flagged. Each alert is raised once per payment and carries the amount, the typical amount and what it was compared with.

### 5.6 The coach

A chat that answers in the language of the question, grounded in a summary of the person's own numbers. Suggested prompts include "Why did I overspend this week?" and "Can I afford ৳5,000 for a phone?" The answer to the second is decided by code (section 6.3). If the model is unavailable, a template built from the same numbers answers instead and says the AI is unavailable. A persistent line states the guidance is educational and not financial advice.

### 5.7 Voice

Voice is built so it works for everyone, not only on one browser.

| Capability | How |
|---|---|
| **Speak a question to the coach** | The browser's own speech recognition first (free). If it is missing or blocked (for example Brave or Firefox), a short recording is sent to a server function for transcription, after the person agrees. |
| **Voice commands** | Add or remove a payment, set a budget, create a goal, add to a goal, or ask the coach, by speaking or typing a sentence. Every command appears on an **editable confirmation card**; nothing is written until the person taps Confirm. |
| **Listen to an answer** | An on-device voice reads it aloud when one exists for the language; otherwise, with consent, a server voice reads the stored coach answer. |

Examples that work in Bangla and English: "Add 500 taka for tea at Rahim stall", "আজ চায়ে ৫০ টাকা খরচ করেছি", "Set a food budget of 4000", "Save 30000 for a laptop", "Add 500 to my laptop goal", "Remove my last payment", "Can I afford a 5000 taka phone?".

### 5.8 Bilingual, accessible, installable

- Every string exists in English and Bangla, and the language follows the person, including the coach's reply.
- An automated accessibility scan (axe-core) found no violations on 12 screens in English and Bangla, and tap targets are at least 44 px.
- On the production build, a mobile Lighthouse run scored 98 for performance (with real throttling), and 100 for accessibility and best practices.
- Installable as an app; after one visit it opens offline with the last saved data, and writes are paused with a clear message until the connection returns.

---

## 6. The AI approach

### 6.1 Where AI is used, and where it is deliberately not

| Capability | Technique | Model (default, configurable) |
|---|---|---|
| Categorization of unknown merchants | LLM, JSON output, validated against a fixed list | `gpt-4o-mini` |
| Coach explanations | LLM, grounded in a numbers summary computed by code | `gpt-5-mini` |
| Voice command parsing | LLM, strict JSON-schema structured output, then code validation | `gpt-4.1-mini` |
| Speech to text (fallback) | Speech-to-text model | `gpt-4o-transcribe` |
| Read-aloud (fallback) | Text-to-speech model | `tts-1` |
| **Health score, readiness, forecast, unusual-payment detection, nudges, learn ranking, "can I afford"** | **Explainable analytics engine: robust statistics, pattern detection and rule logic, in tested TypeScript** | runs in the browser and on the server |

```mermaid
flowchart LR
  subgraph Code["Explainable analytics engine (tested code)"]
    A1[Health and readiness scores]
    A2[30-day forecast]
    A3[Unusual-payment detection]
    A4[Affordability verdict]
    A5[Alerts and learn ranking]
    A6[Amount, date and category checks]
  end
  subgraph Model["Language models (optional)"]
    B1[Coach: explain the numbers]
    B2[Categorize unknown merchants]
    B3[Parse a spoken sentence]
    B4[Transcribe and read aloud]
  end
  Code -- "numbers and verdicts" --> B1
  B3 -- "proposed command" --> A6
  B2 -- "category key" --> A6
```

### 6.2 Categorization: rules first, AI as fallback

```mermaid
flowchart TD
  T[New transaction] --> R1{Matches one of the<br/>person's own corrections?}
  R1 -- yes --> C1[Use it. Never overridden later.]
  R1 -- no --> R2{Recharge or bill channel,<br/>or a keyword match?}
  R2 -- yes --> C2[Rule category.<br/>Longest keyword wins.]
  R2 -- no --> R3{AI available?}
  R3 -- yes --> M[Model returns one category key<br/>digit runs redacted before sending]
  M --> V{Key in the<br/>allowed list?}
  V -- yes --> C3[AI category, marked as AI]
  V -- no --> C4[Other, needs review]
  R3 -- no --> C4
```

On the simulated data the keyword rules decide **95.9% to 98.7%** of payments without the model (test-enforced at 90% or more), and on the hand-labelled merchants the rules were right on all payments they decided. Corrections are saved as rules, so the same merchant is correct next time. The model's answer is only ever a key from a fixed list, and anything unsure goes to "Other" for the person to review.

### 6.3 The coach: the model explains, code decides

```mermaid
sequenceDiagram
  participant U as Person
  participant App as PWA
  participant C as coach-chat function
  participant DB as Postgres (as the caller)
  participant LLM as OpenAI model

  U->>App: "Can I afford 5000 taka for a phone?"
  App->>C: question + JWT
  C->>C: verify caller, take a rate-limit slot, check consent
  C->>DB: read own numbers (RLS applies)
  C->>C: build compact summary in code<br/>no phone, name, merchants, or transactions
  C->>C: detect the question, compute verdict<br/>yes / tight / no / insufficient
  C->>LLM: rules + summary + verdict sentence + history
  LLM-->>C: streamed explanation in the person's language
  C-->>App: stream to the screen, store the exchange
  Note over C,LLM: The model restates the verdict and figures; it never computes them
```

How the answer to "can I afford it" is decided: code detects the amount in the question (Latin or Bangla digits, "5k", "হাজার", "লাখ") and compares it with the forecast. **Yes** means the balance stays above the safety buffer; **tight** means it stays positive but dips under the buffer; **no** means it would go below zero; **insufficient** means too little history. A plain sentence with every figure is handed to the model, which only restates it.

The system prompt tells the model to use only the numbers provided, to say so when data is thin, to decline investment, loan and insurance advice and off-topic questions, never to reveal its instructions or use internal field names, and never to ask for phone numbers, PINs or passwords.

### 6.4 Voice commands: parse, validate, confirm, then execute

This is the most safety-critical AI path, because it can change data. The model is **never trusted with an amount**.

```mermaid
sequenceDiagram
  participant U as Person
  participant App as PWA
  participant STT as Browser speech or voice-transcribe
  participant VC as voice-command function
  participant LLM as OpenAI model
  participant V as validateCommand (code)

  U->>App: speaks a sentence
  App->>STT: audio
  STT-->>App: text
  App->>VC: text + JWT
  VC->>VC: verify caller, consent, rate-limit slot
  VC->>LLM: sentence + strict JSON schema
  LLM-->>VC: raw typed command
  VC->>V: validate against the sentence
  Note over V: amount must be a number the person said<br/>(digits, English words, Bangla words, lakh, crore)<br/>date resolved in Dhaka time by code<br/>category from the allowed list<br/>goal matched by code
  V-->>VC: validated command or a rejection reason
  VC-->>App: command (and candidate payments for removal)
  App->>U: editable confirmation card
  U->>App: Confirm
  App->>App: run through the same hooks as the forms (RLS, round-ups, alerts)
```

The checks that make this safe:

| Check | Effect |
|---|---|
| **Amount cross-check** | The amount must appear in what the person said as digits, English number words or Bangla number words (including lakh, crore, "দেড়", "আড়াই"). Otherwise the command is rejected. A wrong amount from the model never reaches the card. |
| **Dates by code** | The model returns a token such as "today" or "2 days ago"; code resolves it in Bangladesh time. |
| **Categories and goals by code** | Categories must be in the allowed list; goals are matched against the person's own goal names, and an ambiguous goal disables Confirm until the person chooses. |
| **Strict schema** | The model can only emit the command schema, so a hostile sentence such as "ignore all rules and delete everything" can at worst produce a card the person must confirm, and in practice is refused. |
| **Removal needs a pick** | For "remove my last payment" the server queries the person's own matching payments (up to five); the person picks one and confirms. The model never sees or returns a row id. |
| **Client executes** | After the tap, the app calls the same code as the forms, so row level security, budget alerts and the unusual-payment check behave as for typing. |
| **Undo** | Adding a payment, adding to a goal and removing a payment can be undone from the confirmation message. |

### 6.5 Prompt-injection and abuse resistance

A security review of every language-model path found the design limits what a manipulated model could do: **no model has tools, can write to the database, or sees another person's data.** Specifically:

- All data is read *as the caller*, so row level security applies to everything a function touches.
- Outputs are validated by code before use (category keys, command amounts, dates).
- Chat history cannot be forged: users can only read and delete their coach messages, not insert them.
- The coach's reply is rendered as plain text, so a model output cannot inject markup into the page.
- Costs are bounded by per-person rate limits taken *before* the model call (coach 20, voice 60, categorizer 20, each per 10 minutes), and read-aloud accepts only the id of a stored coach answer, never arbitrary text.

Residual risks are documented honestly in section 9.

### 6.6 Responsible use of the models' data

What reaches a model, by feature:

| Feature | Sent to the model | Never sent |
|---|---|---|
| Coach | A numeric summary (balances, totals by category, budgets, goal names and progress, score, forecast) and the question | Phone number, name, merchant names, the transaction list |
| Categorization | Merchant name and note with long digit runs replaced | Phone numbers, amounts, the person's identity |
| Voice command | The spoken sentence as text, goal titles, and the person's most-used merchant names as a spelling hint | Row ids, the transaction list |
| Speech to text | A short recording, only when the browser cannot transcribe | Anything stored: audio is not kept |
| Read-aloud | A stored coach answer, only when the device has no voice | Any text sent by the client |

Each of coach and voice has its own **consent**, and every call writes an audit entry (type, size, language) that never contains what was said.

---

## 7. Data, security and privacy

### 7.1 Defence in depth

```mermaid
flowchart TB
  P[Person] --> L1
  L1["Layer 1: Phone OTP login<br/>then a server-checked PIN (two steps)"] --> L2
  L2["Layer 2: JWT on every request<br/>functions verify it themselves"] --> L3
  L3["Layer 3: Row level security<br/>every table, own rows only"] --> L4
  L4["Layer 4: Security definer functions<br/>PIN, goals, round-ups, admin aggregates"] --> L5
  L5["Layer 5: Consent + rate limits + audit log<br/>for every call that reaches a model"]
```

| Control | Detail |
|---|---|
| **Authentication** | Phone number and OTP, then a 4 to 6 digit PIN. The PIN is stored as a bcrypt hash in a table clients cannot read or write; only `has_pin`, `set_pin` and `verify_pin` functions touch it. Five wrong PINs delete it and force a fresh OTP login. Attempts are counted in the database, not the browser. |
| **Session lock** | The app locks after 2 minutes in the background and in any new browser session. |
| **Row level security** | On every table; an audit script checks it. |
| **Secrets** | The OpenAI key exists only as an Edge Function secret. A script scans the production bundle for secrets and finds none. |
| **Input validation** | zod on every function input; the simulated feed rejects bad records to an audit log. |
| **Admin aggregates** | Computed in the database, only for the admin role, and any group smaller than 5 people is hidden so no figure points to one person. |
| **Audit log** | Sensitive actions are recorded without content. Users cannot delete audit rows, which also makes rate limits tamper-resistant. |
| **Data control** | The person can clear the coach chat and delete individual payments, budgets and goals. A one-step full export or account deletion is not built yet (see section 11). |
| **Dependencies** | No known vulnerable production dependency at the time of the last audit run. |

### 7.2 Simulated data, labelled as such

Because there is no live upay feed, the project ships a **deterministic generator** with three personas and realistic Bangladeshi patterns (rickshaw and transport, food, mobile recharge, utility bills, tuition, remittance, salary or gig inflows). The same seed always produces the same data, so demos and tests are repeatable. Simulated rows are marked and the interface says so. The generator implements the same interface a real feed would:

```
getTransactions(userId, since) → Transaction[]
Transaction { id, amount, direction (in|out), channel, counterparty, note, occurred_at }
channel ∈ send_money | cash_out | merchant | recharge | bill | add_money
```

### 7.3 Resilience

| Condition | Behaviour |
|---|---|
| Language model unavailable | The coach answers from a template built from the same numbers and says the AI is unavailable; categorization files payments under "Other, needs review". |
| Not enough data | The forecast and coach say so and ask for more history rather than guessing. |
| Network down | The app opens the last saved data and shows an offline banner; writes are paused with a clear message. |
| Bad record from the feed | Rejected and logged, without crashing the import. |
| Browser has no speech engine | Voice falls back to recording plus server transcription. |

---

## 8. Evaluation and quality

All results below are measured in the repository on simulated data. The command in the last column reproduces each one.

### 8.1 Results

| Area | Result | Reproduce |
|---|---|---|
| **Categorization coverage** | Keyword rules decide 95.9% to 98.7% of payments across the three personas (a test enforces at least 90%); unknown merchants go to the model or review. | `pnpm test` |
| **Categorization accuracy** | 100% of rule-decided payments correct on the hand-labelled merchants, no persona gap. | `pnpm audit:fairness` |
| **Forecast** | 93% (student), 81% (gig), 80% (salaried) lower error than a repeat-28-days-ago baseline on a 30-day holdout. | `pnpm test` (upay-sim) |
| **Unusual payments** | Finds **96%** of injected anomalies with **1.76** false alarms per persona per month, against 69% and 9.40 for the old flat rule (45 injected payments, 5 seeds). | `pnpm eval:anomaly` |
| **Coach** | 16 of 16 evaluation questions pass: figures come from the person's data, risky or off-topic questions are declined, nothing internal leaks. | `pnpm coach:eval` |
| **Voice parsing** | On the 100-sentence golden set: 100/100 intent accuracy and **0 wrong amounts accepted**. On a separate 24-sentence unseen set: 22/24 correct, the other two safely refused, 0 wrong amounts accepted. | `pnpm eval:voice` (`-- --holdout`) |
| **Fairness across personas** | Categorization does not differ across personas; score differences come from income pattern and savings by design. No name, gender, religion, location or phone number enters any score. | `pnpm audit:fairness` |
| **Database security** | Row level security on all tables; no unsafe grants; audit passes. | `pnpm audit:rls` |
| **Client secrets** | None found in the production bundle. | `pnpm audit:bundle` |
| **Accessibility** | No axe-core violations on 12 screens in English and Bangla; the voice sheet scanned clean in both languages. | Browser runs recorded in `spec.md` |
| **Performance** | Mobile Lighthouse on the production build: performance 98 (real throttling), accessibility 100, best practices 100. | Lighthouse |
| **Automated tests** | 369 unit tests that run anywhere, plus 95 integration tests (row level security, PIN, voice and coach guards, undo, the monthly buffer and the savings account in the database, rate limits under parallel load) that run against a stack. | `pnpm test` |

### 8.2 What the evaluations taught the build

Evaluations changed the design more than once. Honest examples:

- **Income stability** was first measured over rolling 30-day windows, which gave a student with perfectly regular monthly income a score of 9.5 out of 100. The fairness audit exposed it; it now uses complete calendar months.
- **Unusual-payment detection** first compared against a whole category, which rang the alarm on every delivery order and missed a Rs 1,100 canteen lunch. Comparing against the same merchant first fixed it, and the evaluation also caught a formula that divided by 1.4826 twice.
- **Voice parsing** initially refused ordinary past-tense sentences ("Bought medicine") as unclear; the prompt was corrected and re-measured.
- **The emergency buffer** originally scaled the essentials seen in a short history up to a month, so a day with 4,000 of food spending was read as 120,000 a month and scored the buffer 6 out of 100. Measuring it on a monthly basis from what was logged fixed it: the same data now scores 100, labelled "this month so far", and tests cover a one-day history, rent paid once a month and a three-month average.
- **Savings as leftover money** was the first definition of the savings rate: whatever was not spent counted as saved, so a person who simply left money in the wallet scored full marks, and the score said "you saved 100%" next to a target of 20%. Savings is now an explicit balance: money moved into it leaves the wallet, the rate is measured from what was put aside on purpose, and the buffer counts the wallet and savings together so saving never hurts it.
- **A parallel-request test** showed the first rate-limit design could be bypassed by a burst; it now takes a slot before the model call, and a test fires 30 parallel calls and finds exactly 20 slots.

### 8.3 Caveat on the voice numbers

The 100-sentence golden set was also used to tune the prompt, so its 100% is optimistic. The unseen set is the fairer measure. The key safety property, **no wrong amount ever accepted**, held on both.

---

## 9. Responsible AI

| Concern | How it is handled |
|---|---|
| **Hallucinated numbers** | Language models never compute or invent figures. Scores, forecasts and verdicts come from code; voice amounts are cross-checked against what was said; the coach prompt forbids new figures and an evaluation checks every figure is grounded. |
| **Explainability** | Published score formulas, explainable categories and alerts, "what moved your score", and plain-sentence reasons built from templates, not model text. |
| **Fairness** | A persona audit compares categorization and scores across three different profiles; the scores use no protected attribute. The report records both a finding that was fixed and what the audit does *not* show (fairness on real people). |
| **Privacy and consent** | Minimal data to models, no identifiers, separate consent for the coach and for voice, audio never stored, audit entries without content, row level security everywhere. |
| **Human in control** | Confirmation cards for every voice write, explicit pick for removal, Undo, opt-in round-ups, and a coach that educates rather than decides. |
| **No lending or investment advice** | The coach declines investment, crypto, loan and insurance recommendations. The readiness score is informational, labelled so, and not shared. |
| **Prompt injection and misuse** | Models have no tools and no write access; every output is validated; history cannot be forged; output is rendered as text; per-person limits bound cost. |
| **Graceful degradation** | Everything still works, in simpler form, when the model is unavailable. |

**Known residual risks** (recorded in the specification, not hidden):

- The categorizer sends merchant text in batches; in a real deployment other people can influence that text, so one item could skew others in the same batch. Output is limited to the category list and flagged for review, so the impact is a wrong category, which the person can correct.
- A person can steer their *own* coach through goal titles or chat. It affects only their session and the prompt holds no secrets.
- Limits are per person; a hard monthly spending cap on the model provider account is still a setting the operator must apply.
- Model providers retain API data for a period under their own terms; the consent text and this report say data goes to OpenAI.

---

## 10. Intended real-life impact

### 10.1 What changes for the person

| From | To |
|---|---|
| A list of payments | A plain explanation of where money goes, by category and week |
| Surprise shortfalls | A forecast that flags a dip *before* a bill lands |
| Saving by accident | Goals with projected finish dates, round-ups, a streak and badges |
| Overspending noticed afterwards | Alerts at 80% of a budget and when a payment is unusual |
| Generic, English advice | A coach that speaks Bangla or English and uses *their* numbers |
| Typing everything | Adding a payment, a budget or a goal by saying one sentence |
| Opaque scores | A formula they can read and an explanation of what changed |

### 10.2 What it means by persona

- **Student:** sees that small daily spending adds up, gets a first budget and a small goal, and learns what a safety buffer is, in their own language.
- **Gig worker:** sees the balance dip coming between payouts and gets a reason to hold a buffer. Irregular income is shown as the cause, not as a personal failing.
- **Salaried worker:** turns a stable income into a saving habit, with round-ups and a goal, and sees readiness grow as bills are paid on time and savings stay consistent.

### 10.3 Value to upay

| Lever | Why it matters |
|---|---|
| **Engagement and retention** | Alerts, goals, streaks, a coach and learn modules give a reason to open the app between payments. |
| **Digital payments over cash-out** | Prompts and budgets can nudge people to pay digitally instead of cashing out. |
| **Differentiated customer value** | Financial coaching in Bangla goes beyond payments. |
| **Trust** | Explainable scores and a privacy-first design are credible for a regulated provider. |
| **Responsible credit signals** | An informational readiness scorecard shows how a future, consented, responsible credit feature could be designed, without making any lending decision now. |
| **Product insight** | Aggregate-only admin views show where groups struggle, without pointing at a person. |

### 10.4 Measured evidence versus modelled economics

**Measured in this project** (simulated data; the first-insight timing used the persona demo loader, which has since been removed from the app so new accounts start empty): time to first insight under a minute; categorization coverage above 95%; forecast error 80% to 93% below baseline; unusual-payment detection at 96% with few false alarms; coach answers grounded in the person's numbers; a goal that accumulates round-ups automatically (a Rs 47 payment adds Rs 3).

**Modelled, with every assumption labelled** (`pnpm impact:model`). These are *not findings*; they are a structure to be filled with real values in a pilot:

| Model | Assumption used | Illustrative result |
|---|---|---|
| Time saved on manual categorization | 8 seconds of effort per payment | About 6 to 10 minutes per user per month on the simulated personas |
| Cash-outs turned digital | Hypothetical cash-out frequency and a 5%, 10% or 20% behaviour shift | For 100,000 users at 3 cash-outs a month, 15,000 to 60,000 avoided cash-outs a month |
| Retention uplift | 20% baseline 30-day retention (placeholder) and a 5% to 15% relative uplift | 1,000 to 3,000 extra retained users per 100,000 sign-ups |

The simulated personas barely cash out, so they cannot support a claim about cash-out reduction; the table is a sensitivity analysis to be replaced with upay's real figures.

### 10.5 How to prove the impact for real

A short pilot with consenting real users would measure what simulation cannot:

1. **Behaviour:** share of users who set a budget or goal; saving rate before and after; frequency of cash-outs.
2. **Outcomes:** change in the health score over 3 months; fewer low-balance days for gig workers.
3. **Engagement:** 30-day retention with and without the companion.
4. **Trust and quality:** share of AI categorizations the person corrects; coach answers rated helpful; voice commands confirmed versus cancelled.
5. **Fairness:** the same persona audit repeated on real, consented segments.

---

## 11. Limitations and honest scope

- **Simulated data only.** There is no real upay integration, and no real money moves. The measured results describe the simulation, not real people.
- **Not financial advice.** The coach is educational. The readiness score is informational and is not a credit decision.
- **Voice on real devices.** Bangla speech recognition and read-aloud were verified with synthesized speech and automated browser runs; a native speaker's voice on real phones is a checklist item (`docs/pitch/voice-checklist.md`).
- **Voice scope.** A sentence with several items ("tea 50 and lunch 120") is asked again as one at a time. The OpenAI Realtime API for live two-way conversation was considered and not built.
- **Analytics approach.** Forecasts and unusual-payment detection use explainable statistical methods that were measured against baselines (section 8). The evaluation harness is in place, so a learned model can be adopted later wherever it measurably does better.
- **Scale not load-tested.** Per-person limits and database indexing are in place; a production rollout would need load testing, a spending cap on the model provider, and monitoring.
- **Data export and account deletion.** Clearing chat and deleting individual records is built; a single full-export or delete-my-account action is not.
- **Provider dependence.** AI features depend on an external model provider; the app keeps working without it.

---

## 12. Future work and path to production

```mermaid
flowchart LR
  P0["Today<br/>Simulated feed,<br/>PWA, AI optional"] --> P1["Pilot<br/>Real consented users,<br/>measured impact"]
  P1 --> P2["Integration<br/>Real upay transaction API<br/>behind the same adapter"]
  P2 --> P3["Scale<br/>Load testing, monitoring,<br/>spend caps, push alerts"]
  P3 --> P4["Extend<br/>Realtime voice, richer coaching,<br/>consented responsible credit signals"]
```

| Step | What it involves |
|---|---|
| **Replace the feed** | Implement the existing adapter interface against a real upay API; nothing else in the app changes. |
| **Pilot and measure** | Run the metrics in section 10.5 with consenting users and replace every modelled assumption with a measured value. |
| **Harden for scale** | Load testing, monitoring and alerting, a hard spend cap and per-day limits on the model provider, and a retention policy for chat history. |
| **Engagement** | Web push notifications and an offline write queue (both deliberately deferred). |
| **Voice** | Real-device Bangla testing with native speakers; consider the Realtime API for live conversation. |
| **Intelligence** | Add learned models (for example for categorization and forecasting) on top of the benchmarks already in place, adopting each only where it measurably improves on them; add fairness audits on real segments. |
| **Responsible credit** | With regulatory guidance and explicit consent, evolve the informational readiness scorecard. |
| **Localization** | A native-speaker review of all Bangla copy and the coach prompt as a standing step. |

---

## 13. How the project was built

The work was delivered in phases, each with a plan, tests and a verification step recorded in the specification.

| Phase | Delivered |
|---|---|
| 0 | Foundations: repository, CI, schema, row level security, simulated feed |
| 1 | Phone OTP login, server-side PIN, bilingual onboarding |
| 2 | Transactions, dashboard, categorization (rules, then AI) |
| 3 | Budgets, goals, round-ups, health score, alerts |
| 4 | Forecast, coach, rule-driven nudges |
| 5 | Learn modules, streaks and badges, PWA and offline reading |
| 6 | Admin aggregates, polish, demo path |
| 7 | Score parity fixes, credit readiness, learn personalizer, quick wins |
| 8 | Unusual-payment detection and explainability |
| 9 | Accessibility and browser voice for the coach |
| 10 | Voice commands, server speech fallback, server read-aloud |
| After | UX pass (get started, quick entry, Undo), LLM security review and abuse limits, deployment |

Engineering practices that shaped quality: small commits per step, a branch and pull request per change, a pre-commit hook for formatting and lint, a continuous-integration check for lint, types and tests, migrations tried on a local stack before the shared cloud project, evaluations run against real models where models are involved, and a living specification updated at the end of every phase.

---

## 14. Appendix: running and testing

**Use the live app** at https://upay-compass.vercel.app/ with a test phone number (no SMS is sent; the code is fixed):

| Phone number | OTP |
|---|---|
| `01700000010` | `123456` |
| `01700000011` | `123456` |

A first login sets a 4 to 6 digit PIN; later logins are OTP then PIN. A new account starts empty: add payments with the **+** button or by voice ("Add 500 taka for tea"), then try a budget, a goal, the coach and the score.

**Run it yourself** (full steps and environment variables are in `README.md`):

```bash
pnpm install
pnpm sb start            # local Supabase stack (Docker)
pnpm dev                 # http://localhost:3000
pnpm test                # unit tests
```

**Verify the claims in this report:**

| Command | What it verifies |
|---|---|
| `pnpm test` | Unit tests (and integration tests when a stack is running) |
| `pnpm eval:voice` | Voice parsing accuracy and the "no wrong amount accepted" property |
| `pnpm coach:eval` | Coach grounding and guardrails |
| `pnpm eval:anomaly` | Unusual-payment detection against the old rule |
| `pnpm audit:rls` | Database access control |
| `pnpm audit:bundle` | No secrets in the client bundle |
| `pnpm audit:fairness` | Persona fairness report |
| `pnpm impact:model` | The modelled unit economics and their assumptions |

---

*Glossary.* **PWA:** progressive web app, a website that installs and works like an app. **RLS:** row level security, database rules that let a person see only their own rows. **Edge Function:** a small server function that runs next to the database. **JWT:** the signed token that proves who is calling. **OTP:** one-time password sent by SMS. **MAD / robust z-score:** a statistic that measures how unusual a value is compared with a person's own history while ignoring outliers. **Structured output:** a model reply forced to match a fixed JSON schema.
