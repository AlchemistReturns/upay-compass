# Action flow: start a monthly savings plan (DPS) from a goal

Judge feedback: introduce actionable one-tap MFS financial product conversion flows (for example direct DPS or term deposit setup).

## The flow

insight -> suggested plan -> one tap -> confirm -> plan stored

1. **Insight.** A goal card on the Goals page shows the goal, how much is saved and the pace.
2. **Suggested plan.** The card has a "Start a DPS" button. It is hidden once the goal is reached.
3. **One tap.** The button opens a sheet already filled in: a monthly amount and a length (6, 12, 24 or 36 months), the total that would be set aside, the projected value at the end, and a check against the person's 30-day forecast. Four chips change the length; the monthly amount follows.
4. **Confirm.** One button, "Confirm plan request".
5. **Plan stored.** The plan is passed through the savings-plan adapter, which returns a reference and the status "requested", and is saved in `savings_plans`. The sheet shows the reference and an Undo (cancels the request). The goal card lists its plans with their status.

## How the numbers are made

Every figure comes from `packages/shared/src/savings-plan.ts` and is unit-tested (`savings-plan.test.ts`). No model is involved.

- Length: the longest preset that ends by the goal's target date; 12 months when there is no usable date; the shortest preset when the date is too near (the sheet then says the plan ends after the date).
- Monthly amount: the smallest whole taka whose projected value reaches what the goal still needs. Raised to ৳100 when smaller, and the sheet says so.
- Projected value: monthly deposits at the start of each month, compounded monthly at a yearly rate divided by 12.
- Affordability: the existing `canAfford` check on the latest forecast, applied to the first deposit. "Tight" means the balance would go below the safety buffer; "no" means below zero.
- A goal that is already reached gets no suggestion.

## What is measured, what is not real

- **Measured:** steps. The flow is 3 steps (Goals tab, tap Start a DPS, Confirm), counted from the UI code (`goal-card.tsx`, `dps-sheet.tsx`) and added to `scripts/ux-tasks.ts` as the task "Start a DPS from a goal" (`pnpm ux:tasks`). The reference count (7) is an **estimate** for a typical wallet app: sign in, find savings products, pick DPS, enter an amount, pick a length, review, confirm. 3 against 7 is 57% fewer. There is no voice flow for this task, so it is left out of the tap-versus-voice persona comparison.
- **Not real:** there is no upay DPS integration. The plan is a request stored in Compass. No deposit is opened, no money moves, and nothing is sent to upay. The yearly rate (`ILLUSTRATIVE_DPS_ANNUAL_RATE`, 7%) is an illustration, not an offer, quote or any bank's rate; the sheet says so. Projected values are not promises.
- **Swappable:** the app talks to a `SavingsPlanProvider` (`createSavingsPlan`). `adapters/upay-sim` implements it by returning a reference. A real upay product API would implement the same interface and replace it in `use-savings-plans.ts`. See `docs/integration/upay-adapter.md`.

## Data

Table `savings_plans` (own rows only; people can read and request plans, and cancel one that is still "requested"). It is included in the data export, removed with the goal or the account, and never purged automatically. The activity log gets one entry per request or cancel with a count of active plans, never an amount or a goal name. See `data-retention.md` and `threat-model.md`.

The screen keeps the existing framing: educational guidance, not financial advice.
