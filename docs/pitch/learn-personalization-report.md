# Made for you: persona evaluation

Simulated data only: 120 days per persona ending 2026-10-02, no budgets, the demo "Phone fund" goal. Signals are built the way the Edge Function builds them; topics are picked by `pickPersonalizedTopics` (threshold 0.4, at most 3, one per category first). No model is called. Regenerate with `pnpm eval:learn -- --write`.

| Persona | Health score (savings / budget / buffer / stability) | Topics picked (score, reason) |
|---|---|---|
| Student | 53 (46 / n/a / 26 / 100) | `buffer_in_days` (0.737, buffer_thin)<br>`reading_your_score` (0.515, score_weak_part)<br>`small_repeats` (0.452, savings_low) |
| Gig worker | 28 (0 / n/a / 14 / 61) | `buffer_in_days` (0.858, buffer_thin)<br>`small_repeats` (0.85, savings_low)<br>`borrowing_pressure` (0.75, forecast_negative) |
| Salaried | 63 (66 / n/a / 44 / 100) | `scam_safety` (0.75, unusual_payment)<br>`buffer_in_days` (0.7, forecast_low)<br>`reading_your_score` (0.443, score_weak_part) |

Facts sent to the model for each persona's first topic (numbers and ids only):

- Student, `buffer_in_days`: `{"buffer_days":24,"buffer_target_days":90,"safety_buffer_days":7,"low_balance_days":0}`
- Gig worker, `buffer_in_days`: `{"buffer_days":13,"buffer_target_days":90,"safety_buffer_days":7,"low_balance_days":25}`
- Salaried, `scam_safety`: `{}`

Distinct topic sets across the three personas: **3 of 3**. The personas do not all get the same lessons.

## Style check: recorded fixtures next to the hand-written modules

| Module | Lang | Body words | Sections | Longest sentence |
|---|---|---|---|---|
| budget-basics (course) | en | 120 | 2 | 17 |
| budget-basics (course) | bn | 98 | 2 | 14 |
| needs-vs-wants (course) | en | 119 | 2 | 19 |
| needs-vs-wants (course) | bn | 93 | 2 | 12 |
| emergency-fund (course) | en | 120 | 3 | 19 |
| emergency-fund (course) | bn | 106 | 3 | 19 |
| save-small (course) | en | 121 | 3 | 15 |
| save-small (course) | bn | 96 | 3 | 12 |
| mobile-money-safety (course) | en | 131 | 3 | 16 |
| mobile-money-safety (course) | bn | 109 | 3 | 14 |
| irregular-income (course) | en | 127 | 3 | 13 |
| irregular-income (course) | bn | 111 | 3 | 12 |
| goals-that-stick (course) | en | 128 | 4 | 15 |
| goals-that-stick (course) | bn | 103 | 4 | 14 |
| borrowing-basics (course) | en | 131 | 3 | 13 |
| borrowing-basics (course) | bn | 120 | 3 | 11 |
| buffer_in_days fixture | en | 88 | 3 | 18 |
| buffer_in_days fixture | bn | 77 | 3 | 16 |
| beyond_basics fixture | en | 103 | 3 | 14 |

The fixtures were written by hand to the prompt; live model output still has to be checked once the function is deployed (see the checklist in docs/PROJECT_STATE.md).
