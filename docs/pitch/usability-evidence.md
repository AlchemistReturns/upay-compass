# Usability evidence: navigation complexity and drop-off

Judge feedback: quantify user drop-off caused by complex app navigation in rural regions. No field testing was possible, so this page separates what is measured from the code, what is persona-based, and what is cited.

## 1. Measured: steps per task (`pnpm ux:tasks`)

Step counts are read from the real UI code. A step is a tap, a typed field, a spoken sentence or the final confirm. Reference steps are **estimates** for a typical wallet app, editable in `scripts/ux-tasks.ts`.

| Task | Mode | Screens | Total steps | Estimated reference steps | % fewer steps |
|---|---|---|---|---|---|
| Add a payment | tap | 2 | 4 | 8 | 50% |
| Add a payment | voice | 1 | 3 | 8 | 63% |
| Ask coach: can I afford X? | tap | 2 | 3 | 5 | 40% |
| Ask coach: can I afford X? | voice | 2 | 2 | 5 | 60% |
| Set a budget | tap | 2 | 5 | 7 | 29% |
| Set a budget | voice | 1 | 3 | 7 | 57% |
| Create a goal | tap | 2 | 5 | 7 | 29% |
| Create a goal | voice | 1 | 3 | 7 | 57% |
| Add money to a goal | tap | 2 | 4 | 6 | 33% |
| Add money to a goal | voice | 1 | 3 | 6 | 50% |

## 2. Persona-based evaluation (`pnpm ux:personas`)

Persona-based evaluation: 8 personas, parameters in `scripts/ux-persona-params.ts`. Each persona runs every task in tap and voice mode on the measured step lists above, 2000 seeded runs each. A step fails with a chance set by the persona (typing error rate, speech misrecognition rate, or a tap error rate); a failed step is retried until the persona's patience runs out, then they give up. The low-literacy farmer's parameters are anchored to the two farmer studies cited below (typing error rate 25.39% and tap error rate 13.42% from the Dhaka Tribune study; digital literacy 12.7%, i.e. 1 − 87.3%, from the 2024 Journal of Agriculture and Food Research study). Speech error and patience for that persona, and every parameter of the other seven personas, are stated assumptions. Numbers are persona-based, from parameters, not from people.

| Persona | Lang | Tap completion | Voice completion | Tap avg steps taken | Voice avg steps taken |
|---|---|---|---|---|---|
| Low-literacy farmer | bn | 91.5% | 95.8% | 4.89 | 3.34 |
| Rural homemaker | bn | 95.5% | 99.2% | 5.17 | 3.36 |
| Gig worker | bn | 98.7% | 98.2% | 4.60 | 3.18 |
| Village shopkeeper | bn | 98.7% | 99.5% | 4.90 | 3.29 |
| Older adult | bn | 93.0% | 97.8% | 5.29 | 3.52 |
| Student | en | 99.9% | 99.8% | 4.33 | 2.97 |
| Salaried employee | en | 100.0% | 100.0% | 4.42 | 2.98 |
| Small-business owner | bn | 99.5% | 99.8% | 4.70 | 3.19 |
| **All personas, all tasks** | | **97.1%** | **98.8%** | **4.79** | **3.23** |

Average errors per task across all personas: 0.65 (tap) vs 0.45 (voice). Where personas gave up, it was on average at step 3.44 in tap mode and step 2.27 in voice mode. Per-task and give-up detail: run the script.

## 3. Cited (paraphrased)

- A study of farmers using digital financial services found the top barriers were transaction complexity (25.39%) and lack of guidance (13.42%). [Dhaka Tribune](https://www.dhakatribune.com/amp/business/285007/poultry-fish-farmers-at-the-forefront-of-using)
- In a 400-farmer study, 87.3% used DFS but found it very difficult, and 70.5% lacked knowledge of how to change their PIN. [Journal of Agriculture and Food Research, 2024, via DOAJ](https://doaj.org/article/1d41abb75c384e828ff878e3689e25dc)
- The Bangladesh Bank Financial Inclusion Report 2024 points to low digital literacy, limited smartphone access, and English-only or technical services in rural areas. [The Daily Star](https://online91.thedailystar.net/news/many-left-out-govt-eyes-full-adult-financial-inclusion-june-4085236)
- A 2022 paper links the gap between registered and active mobile financial services users to ease of use and digital literacy. [Emerald](https://emerald.com/insight/content/doi/10.1108/QRFM-06-2021-0095/full/html)

## Limits

- The persona results come from parameters we chose, not from field participants; they show how the flows compare, not real drop-off rates.
- Reference-flow step counts are estimates of a typical wallet app, not measurements of a specific product.
- Step counts leave defaults untouched and ignore one-time steps such as first-use consent.
