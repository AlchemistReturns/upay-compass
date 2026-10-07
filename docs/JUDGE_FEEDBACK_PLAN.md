# Phase 1 judge feedback: required updates

AI Hackathon 2026, upay Compass. Phase 1 score: about 75.7 / 100.

This file lists what the three judges said to improve and what we will change for the next phase. Scores are the Phase 1 average per criterion.

| Criterion | Score | Share of max |
|---|---|---|
| Problem relevance | 15.33 / 20 | 77% |
| AI/ML depth | 15.0 / 20 | 75% |
| Business/customer impact | 14.0 / 20 | 70% |
| Prototype quality | 12.67 / 15 | 84% |
| Innovation | 7.33 / 10 | 73% |
| Scalability and integration | 7.67 / 10 | 77% |
| Responsible AI and security | 3.67 / 5 | 73% |

Status values: `todo`, `in progress`, `done`. Effort: S (days), M (about a week), L (next phase).

---

## 1. AI/ML depth (15 / 20)

**What the judges said**
- Replace the heuristic baseline forecasters with ML time-series models that handle seasonal trends.
- The core intelligence depends on deterministic rules and statistics, not trained predictive models. Introduce and benchmark learned models for transaction categorization, personalized forecasting, anomaly detection and recommendation, while keeping the explainability and safety design.
- Use local models, because MFS data is sensitive and subject to Bangladesh Bank privacy rules.

**Updates**

| # | Update | Effort | Status |
|---|---|---|---|
| 1.1 | Add a seasonal ML forecaster (e.g. Holt-Winters or gradient boosting on lagged features) next to the current baseline in `packages/shared/src/forecast.ts`. Keep the baseline as the fallback. | M | done (ensemble ships behind `ML_FORECAST`; see ML_REPORT.md) |
| 1.2 | Benchmark the ML forecaster against the baseline on the simulated personas (MAE, MAPE, per-persona). Publish the table in the report. | M | done (holdout -28%, fresh people -30%, unusual people -9% balance error) |
| 1.3 | Train a small learned classifier for merchant categorization. Compare it with the keyword rules and the current AI call, using the existing categorize tests as ground truth. | M | done (behind `ML_CATEGORIZE`; strong on new spellings of known shop types, not on never-seen shop types) |
| 1.4 | Replace the fixed anomaly thresholds with a learned model (e.g. isolation forest or per-user robust z-score) and report precision and recall on injected anomalies. | M | done, not shipped as a flagger (the isolation forest did not beat the rule; recorded in ML_REPORT.md) |
| 1.5 | Add an `OPENAI_BASE_URL` setting to the six functions that call OpenAI, so a local or self-hosted model (Ollama, vLLM) can replace the hosted one. Document the setup. | S | done (see ML_REPORT.md, "What is wired into the app") |
| 1.6 | Keep rule-based explanations and LLM-never-computes-numbers as-is. Show that each learned model still produces an explainable output. | S | done (range and method note on the forecast, name parts on the filing explanation) |

---

## 2. Business and customer impact (14 / 20)

**What the judges said**
- Add one-tap MFS financial product conversion flows (e.g. direct DPS or term deposit setup).
- Impact is modelled from simulated data, not demonstrated with real customer behaviour. A controlled pilot should measure retention uplift, savings behaviour, cash-out reduction, feature adoption, satisfaction and value.
- Narrow the business impact to one or two measurable outcomes. Show how a Compass insight leads to a specific customer action, and the value for both the customer and upay.

**Updates**

| # | Update | Effort | Status |
|---|---|---|---|
| 2.1 | Pick two headline outcomes, for example monthly savings rate and cash-out frequency. Rewrite `docs/pitch/impact-metrics.md` around them only. | S | todo |
| 2.2 | Write one worked example chain: insight (e.g. "income arrives on the 1st, cash-out spikes on the 2nd") to action (set a DPS) to value for the customer (savings added) and for upay (deposit balance, retention). | S | todo |
| 2.3 | Add a one-tap "Start a DPS / term deposit" action on the savings and goal screens. It hands off to a mock upay product API behind the data adapter. | M | todo |
| 2.4 | Write a pilot design: cohort size, control group, duration, metrics, and success thresholds. Add instrumentation for adoption and savings events. | M | todo |
| 2.5 | Be explicit in the report that current impact numbers are simulated, and keep them separate from pilot results. | S | todo |

---

## 3. Scalability and integration (7.67 / 10)

**What the judges said**
- Connect the swappable data adapter to live MFS transaction webhooks, or a real or sandbox upay API.
- Current implementation uses simulated data and has not been load-tested at production scale.
- Demonstrate scalability with load testing, transaction-ingestion benchmarks, API reliability testing, monitoring, and failure and reconciliation handling.

**Updates**

| # | Update | Effort | Status |
|---|---|---|---|
| 3.1 | Add a webhook ingestion endpoint (signed, idempotent, with retries) that writes into the same transaction table as the simulator. | M | todo |
| 3.2 | Write the adapter contract for the real upay API, with a sandbox stub, so switching from simulator to live is a config change. | M | todo |
| 3.3 | Add a reconciliation job: compare ingested transactions with a source-of-truth export and report gaps and duplicates. | M | todo |
| 3.4 | Load-test ingestion and the main read paths (k6 or similar). Report throughput, p95 latency and error rate at several user counts. | M | todo |
| 3.5 | Extend the existing performance and health page with ingestion lag, failure counts and a failover or degraded-mode note. | S | todo |
| 3.6 | Estimate the cost per active user per month (database, functions, AI calls). | S | todo |

---

## 4. Prototype quality (12.67 / 15)

**What the judges said**
- Use upay's own brand colour combination across the design, keep it consistent with the brand identity, and make it more user-friendly and interactive.
- Next phase: real-device field testing, production load and stress testing, and validation against a live or sandbox upay API.

**Updates**

| # | Update | Effort | Status |
|---|---|---|---|
| 4.1 | Move the theme tokens to upay's brand palette and apply them to buttons, charts, navigation and the PWA manifest. | S | todo |
| 4.2 | Add small interactions: tap-through chart details, animated progress on goals, clearer empty states. | S | todo |
| 4.3 | Run a field test on at least three real low-end Android devices and record issues. | M | todo |
| 4.4 | Link the load tests (3.4) and sandbox API validation (3.2) from this section. | S | todo |

---

## 5. Innovation (7.33 / 10)

**What the judges said**
- Expand voice engine capabilities to support regional Bangla dialect variations.
- Next phase: adaptive personalized coaching and behavioural-learning models that learn safely from longitudinal customer behaviour.
- Add a "Today's Financial Tip" generated from the user's transaction behaviour.

**Updates**

| # | Update | Effort | Status |
|---|---|---|---|
| 5.1 | Add a "Today's Financial Tip" card on the dashboard. The tip is chosen by the existing rules from the user's own transactions, and only the wording uses the language model. | S | todo |
| 5.2 | Add a dialect-to-standard-Bangla step in front of the voice parser (see section 5a). | M | todo |
| 5.3 | Add adaptive coaching: track which tips and nudges the user acts on, and rank future ones by that history. Keep it per user, with consent. | L | todo |

### 5a. Regional Bangla dialect plan

Existing resources to build on (check licences before use):
- [BanglaASR](https://huggingface.co/bangla-speech-processing/BanglaASR): Whisper-small tuned on Common Voice Bangla, about 400 hours, WER 4.58% on standard Bangla.
- [BuzzASR Bengali](https://huggingface.co/BuzzASR/bengali): Whisper-large-v3 tuned for Bengali.
- [BanglaDialecto](https://arxiv.org/pdf/2411.10879): Noakhali dialect speech, about 10 hours from 24 speakers, with dialect to standard speech conversion.
- [Reg2Bangla](https://www.researchsquare.com/article/rs-9118485/v2): 20 regional dialects to standard Bangla text, 3,350 recordings.
- [Vashantor](https://arxiv.org/pdf/2311.11142): 32,500 sentences for Chittagong, Noakhali, Sylhet, Barishal and Mymensingh.
- ONUBAD and the [Mendeley parallel corpus](https://data.mendeley.com/datasets/42gvc83xkg): more dialect to standard Bangla pairs.

Approach:
1. Speech to text: fine-tune Whisper, starting from BanglaASR, on dialect audio. Add an optional `dialect` field to `voice-transcribe`.
2. Dialect to standard Bangla: train a small seq2seq model (e.g. BanglaT5) on Vashantor and ONUBAD. Run it before the voice parser so the parser and coach need no change.
3. Serve both from a small self-hosted service, so voice data stays off third-party providers.
4. Measure WER per dialect before and after tuning on a held-out set. Add dialect phrases to `scripts/voice-golden.mjs`.
5. Keep `gpt-4o-transcribe` as the fallback.

Risk: dialect speech data is small. Expect good results first for Noakhali, Sylhet and Chittagong, and plan to collect more recordings.

---

## 6. Responsible AI and security (3.67 / 5)

**What the judges said**
- Upgrade the PIN security mechanism.
- Do formal penetration testing and threat modeling, add production data retention and deletion controls, and account and data export.
- Extend fairness testing to real customer segments, establish formal data retention and deletion policies, and continuously monitor model behaviour and security threats.

**Updates**

| # | Update | Effort | Status |
|---|---|---|---|
| 6.1 | Strengthen the PIN: stronger hashing parameters, attempt lockout with backoff, optional device biometric unlock, and a PIN-change flow. Review `20261002153733_server_side_pin.sql`. | S | todo |
| 6.2 | Add account deletion and a "download my data" export in Profile. | S | todo |
| 6.3 | Write a data retention policy: what is kept, for how long, and a scheduled job that deletes expired rows. | S | todo |
| 6.4 | Write a threat model (STRIDE style) covering auth, voice, AI calls, webhooks and admin. | M | todo |
| 6.5 | Run a penetration test, or at least an OWASP-based checklist pass plus an automated scan, and record findings and fixes. | M | todo |
| 6.6 | Extend `docs/pitch/fairness-report.md` to segments (gender, region, language, income type), and report gaps. | M | todo |
| 6.7 | Add alerts on the monitoring page for model behaviour drift (refusals, fallback rate, unsafe-output rejections) and failed-login spikes. | S | todo |

---

## 7. Problem relevance (15.33 / 20)

**What the judges said**
- Provide quantitative metrics on user drop-off rates caused by complex app UI navigation in rural regions.

**Updates**

| # | Update | Effort | Status |
|---|---|---|---|
| 7.1 | Add sourced numbers to the problem statement: rural drop-off, digital and financial literacy, and MFS usage in Bangladesh (Bangladesh Bank, BBS, GSMA, World Bank). Cite each. | S | todo |
| 7.2 | Where no public number exists for upay, say so, and propose how the pilot will measure it (task completion and time per task). | S | todo |
| 7.3 | Add the screen-count and tap-count comparison for common tasks (check balance, add expense, set a goal) with and without voice. | S | todo |

---

## Suggested order

1. **Days 1 to 3 (small, visible):** 4.1, 5.1, 6.1, 6.2, 6.3, 7.1 to 7.3, 2.1, 2.2, 1.5.
2. **Week 1 to 2:** 1.1 to 1.4, 2.3, 3.1 to 3.5, 6.7, 4.2, 4.3.
3. **Next phase:** dialect models (5.2), pilot (2.4), adaptive coaching (5.3), pen test and threat model (6.4, 6.5), fairness on real segments (6.6).

## What to show the judges next time

- A benchmark table: ML models against the baselines.
- A load-test result and a webhook ingestion demo.
- One impact chain with two measurable outcomes.
- A dialect voice demo with WER per dialect.
- The threat model, retention policy and account deletion.
