# ML plan: learned models for Compass

Answers the AI/ML depth feedback (15 / 20) in [JUDGE_FEEDBACK_PLAN.md](JUDGE_FEEDBACK_PLAN.md), section 1.

## What the judges asked for

- Replace the heuristic baseline forecasters with ML time-series models that handle seasonal trends.
- Introduce and benchmark learned models for transaction categorization, personalized forecasting, anomaly detection and recommendation.
- Keep the existing explainability and safety design.
- Use local models, because MFS data is sensitive (Bangladesh Bank privacy rules).

## Where we are today

| Task | Today | Where |
|---|---|---|
| Forecast | Heuristic: recurring payments + weekday medians. Already backtested against a seasonal-naive forecast (`backtestForecast`). | `packages/shared/src/forecast.ts` |
| Categorize | Rules (keywords en + bn), then an OpenAI call for unknown merchants. | `categorize.ts`, `supabase/functions/_shared/ai-categorize.ts` |
| Anomaly | Robust z-score (MAD) per merchant or category and weekday. Already has an injected-anomaly evaluation. | `anomaly.ts`, `adapters/upay-sim/src/anomaly-eval.ts` |
| Recommend | Rule-based ranking of learn modules. | `learn-rank.ts` |

The evaluation harnesses for forecast and anomaly already exist, so the work is mostly adding models and comparing them fairly.

## Principles

1. **Small, local, in TypeScript.** Models live in `packages/shared`, so the same code runs in the browser, Node tests and Supabase Edge Functions (Deno). No Python service, no data leaves the system. This is the direct answer to the judge's local-model point.
2. **Learned model proposes, rules still guard.** The model never replaces a safety check. If a model is unsure or there is too little history, the current rule-based result is used.
3. **The language model never computes numbers.** This stays as it is. ML models produce the numbers; the language model only words them.
4. **Every output stays explainable.** Each model returns the top factors with its number, so the existing explain cards keep working.
5. **Benchmark before replacing.** A model ships only if it beats the current method on held-out data by a margin set below.
6. **Be honest about data.** All training data is simulated for now (see Risks).

## 1. Forecasting

**Target:** daily non-recurring spending per user, then the 30-day balance path (recurring items and income stay handled by the existing detector).

**Candidates, in order of effort**

| Model | Notes |
|---|---|
| Seasonal-naive (exists) | The floor to beat. |
| Current heuristic (exists) | The one we are replacing or improving. |
| Holt-Winters, additive, period 7 | Classic seasonal model. Small, fits per user in milliseconds. |
| Ridge regression on lag features | Features: weekday, day of month, days since and until payday, lag 7 and 14, rolling 7 and 28 day mean, last-week spend. Closed-form solution, easy to implement in TS. |
| Gradient-boosted trees (small) | Same features. Adds interactions such as payday spikes. Only if ridge leaves a clear gap. |
| Ensemble | Weighted average, weights chosen by each user's rolling backtest. Falls back to the heuristic below 28 days of history. |

**Evaluation**
- Rolling-origin backtest (several cut-off dates per persona, 30-day horizon).
- Metrics: MAE and sMAPE on daily spend; error on the day-30 balance; **risk-day hit rate** (did we flag the day the balance goes low or negative, within one day); calibration of the low/ok confidence label.
- Report per persona (student, gig, salaried) and overall.

**Ship rule:** at least 10% lower MAE than the current heuristic on average, and no persona worse than the heuristic. Otherwise keep the heuristic and report the negative result.

## 2. Transaction categorization

**Goal:** a learned classifier that sits between the rules and the OpenAI fallback, so fewer merchants reach the language model.

**Model:** character n-gram (2 to 4) TF-IDF features over counterparty + note (works for English, Bangla and mixed spelling), plus channel, direction, amount bucket and hour. Classifier: multinomial logistic regression (or complement naive Bayes as a baseline). Both are small enough to ship as a JSON weight file.

**Flow**
1. User correction (existing) wins.
2. Rules (existing) win when they match.
3. Model predicts; accept only if its probability is above a threshold chosen for at least 95% precision on validation.
4. Otherwise the existing OpenAI fallback, then "needs review".
5. User corrections feed back as new training rows for a lightweight per-user update.

**Data:** the simulator's merchants, plus an extended labelled list we write (common Bangladeshi merchants, apps, transliteration variants, Bangla script). Split by merchant name, not by row, so the test set has unseen merchants.

**Evaluation:** accuracy and macro-F1 on unseen merchants; coverage at 95% precision; and the share of AI-fallback calls removed. Compare rules only, rules + model, and rules + model + OpenAI.

## 3. Anomaly detection

**Goal:** a learned score next to the existing MAD rule, not instead of it.

**Model:** per-user isolation forest, or a simpler per-user density model, on features such as log amount, ratio to merchant median, ratio to category-weekday median, hour, days since last payment to this merchant, and daily total so far. The MAD result stays as the readable explanation ("about 3 times your usual").

**Evaluation:** reuse `anomaly-eval.ts` (injected anomalies). Report precision, recall and F1, and false alarms per user per month, for MAD only, model only, and combined. Combine as "flag if both agree, or if either is very strong".

**Ship rule:** the combined detector must keep recall while cutting false alarms, or raise recall at the same false-alarm rate.

## 4. Recommendations (learn modules and tips)

**Today:** rule-based ranking.

**Plan:** a logistic ranking model on engagement (opened, finished, quick-check score, dismissed), with the rules as the cold start and a small exploration rate so it can learn. Features: topic, the user's current health-score gaps, persona, language, time of day, recent nudges acted on.

**Honest limit:** with simulated users the engagement labels are made up, so we can only show that the pipeline learns a planted preference. Real evidence needs the pilot. We will say that in the report. This also feeds item 5.3 (adaptive coaching) in the judge plan.

## Code layout

```
packages/shared/src/ml/
  linear.ts          ridge + logistic regression (pure TS)
  holt-winters.ts
  trees.ts           small gradient boosting / isolation forest (only if needed)
  tfidf.ts           character n-grams
  features.ts        feature builders shared by all models
  forecast-ml.ts     ML forecaster + ensemble
  categorize-ml.ts   classifier + threshold
  anomaly-ml.ts
  models/            trained weights as JSON (versioned, small)
scripts/ml/
  train-categorizer.mjs
  eval-forecast.mjs      # benchmark table
  eval-categorize.mjs
  eval-anomaly-ml.mjs
docs/ML_REPORT.md        # results tables, generated by the scripts
```

Existing patterns are kept: tests with vitest, `pnpm` scripts such as `eval:anomaly`, and `generateTransactions` for data.

## Phases

| Phase | Work | Output |
|---|---|---|
| A (2 to 3 days) | Feature builders, ridge and logistic code with unit tests, rolling-origin backtest harness | `ml/` basics, `eval-forecast` runs the current heuristic and seasonal-naive |
| B (3 to 4 days) | Holt-Winters and ridge forecaster, ensemble, benchmark table | Forecast results in `ML_REPORT.md`, decision on ship rule |
| C (3 days) | Categorizer: extended labelled data, TF-IDF + logistic, threshold, wire into the categorize flow before the AI fallback | Accuracy and fallback-reduction table |
| D (2 to 3 days) | Anomaly model, combined detector, evaluation | Precision, recall, false-alarm table |
| E (2 days) | Explanations for every model, UI wording, monitoring (model used, fallback rate) on the health page | Explain cards and monitor events |
| F (later, pilot) | Recommendation ranking and per-user online learning on real engagement | Needs real users |

Phases A and B give the biggest visible gain and answer the judges' first point directly, so do them first.

## Using the models in the app

- **Forecast:** `forecastCashflow` keeps its signature. It gains a `method` field (`heuristic`, `ml`, `ensemble`) so the UI and the health page can show which one ran.
- **Categorize:** `categorize()` stays synchronous for rules. A new `categorizeWithModel()` runs after it, before the Edge Function's OpenAI step.
- **Anomaly:** the existing detector returns the flag; the model adds a score and a short factor list.
- **Fallbacks:** if model weights fail to load or history is short, the current method runs, and the monitor records it.

## Risks and how we handle them

| Risk | Handling |
|---|---|
| **Simulated data makes the benchmark circular.** A model can learn the generator, not real behaviour. | Use several seeds and held-out seeds; add a shifted-persona test (different parameters, noise, label noise); report results as "on simulated data"; validate on pilot or sandbox data when available. Do not claim real-world accuracy. |
| ML does not beat the heuristic. | The ship rule says keep the heuristic. A clear negative result with numbers is still a valid benchmark. |
| Little history per user. | Minimum history gates; pool across users for the categorizer; fall back to the heuristic. |
| Bangla spelling variety for merchants. | Character n-grams, transliteration variants in the training list, user corrections. |
| Models drift or misbehave. | Track model use, fallback rate and flag rate on the health page (judge item 6.7). |
| Privacy. | All inference runs in our own code. Training uses simulated data. No customer data goes to a third party for these models. |

## Definition of done

- `ML_REPORT.md` with benchmark tables for forecast, categorization and anomaly, each against the current method.
- Each shipped model passes its ship rule, or is documented as not shipped with the numbers.
- Unit tests for the model code and a regression test that the fallback path still works.
- Explain output for every model decision.
- The judge-plan items 1.1 to 1.6 updated to `done` or `not shipped (result recorded)`.
