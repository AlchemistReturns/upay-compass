# Impact metrics (one slide)

Every figure below was measured in this repository. Re-run the command to reproduce it.

| Claim | Evidence | How to reproduce |
|---|---|---|
| Time to first insight under 60 seconds | Sign in, pick a persona, and the dashboard, score and forecast appear after one load of 120 days of history | Demo script step 3 |
| Most transactions categorized without AI | At least 90% of seeded transactions are matched by the keyword rules (test-enforced); unknown merchants go to the AI, and anything unsure goes to "Other" for review | `pnpm test` (upay-sim) |
| The forecast is better than a naive guess | Over the last 30 days, 93% (student), 81% (gig) and 80% (salaried) lower average error than "repeat the day 28 days ago" | `pnpm test` (upay-sim) |
| The coach uses the user's real numbers | 16 of 16 questions pass: every figure in an answer comes from the user's data, risky or off-topic questions are declined, nothing internal leaks | `pnpm coach:eval` |
| Savings goals and round-ups accumulate | The demo account has a goal; a Rs 47 payment adds Rs 3 to it automatically. The admin view shows totals across people | Demo script step 6, admin view |
| Learning | 8 short modules in Bangla and English, badges for finishing them | Learn tab |
| Safe by default | RLS on all 16 tables, audit script passes, no secret in the client bundle, no known vulnerable dependency | `pnpm audit:rls`, `pnpm audit:bundle`, `pnpm audit --prod` |
| Accessible | axe found no issues on 12 screens in English and Bangla; tap targets are at least 44 px | Browser run in the Phase 6 notes |
| Fast on a phone | Lighthouse mobile on the production build: performance 98 with real throttling (87 to 91 simulated), accessibility 100, best practices 100 | Lighthouse |
| Quality | 192 automated tests | `pnpm test` |

**Not claimed:** real users, real money, or health score improvement on a real person. All data is simulated and labelled as such in the app.
