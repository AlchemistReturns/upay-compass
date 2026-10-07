# 3-minute demo script

Before going on stage: sign in once, open **Home**, and press the **Gig** button under **Demo tools** (it takes a few seconds). That puts the account in a known state: 120 days of history, one goal. Keep the phone on the Home screen, English or Bangla as you prefer.

| Time | Say | Do |
|---|---|---|
| 0:00 | "Most people in Bangladesh pay with upay but never see where the money goes." | Home: wallet balance, then Activity for the spending-by-category bars |
| 0:20 | "Every payment is sorted automatically. When it is wrong, one tap fixes it, and it remembers." | Activity, open one, change its category, save |
| 0:40 | "Budgets warn you before you overspend." | Plan > Budgets, add Food with a small limit (for example Rs 50), save. The alert appears in the bell |
| 1:00 | "Goals, with round-ups: every payment rounds up to the next ten and the change goes to your goal." | Plan > Goals and savings, create a goal, switch round-ups on |
| 1:20 | "A health score from four simple measures, calculated by code, with the reason for each." | Home, Financial health card, show the breakdown |
| 1:30 | "Each day it shows one tip from your own numbers, and the coach can explain it." | Home, Tip of the day card: tap Ask your coach |
| 1:40 | "It looks ahead. This gig worker's balance will dip below the safety line before the bike payment." | Home, tap the "Needs attention" forecast card: the warning and the chart |
| 2:00 | "And a coach that answers in your language, using your real numbers." | Coach > Chat, tap I agree, ask in Bangla: "আমি কি ৫,০০০ টাকার একটি ফোন কিনতে পারি?" |
| 2:30 | "The app computes the verdict; the AI only explains it. It will not give investment or loan advice." | Point at the answer and the disclaimer |
| 2:40 | "It installs like an app and still opens with no signal." | Show the install card, switch to airplane mode, reload: the dashboard is still there |
| 2:50 | "For upay: anonymous insights about groups of people, never one person." | Admin view (sign in as the admin phone, or show the screenshot) |

## If there is time (about 30 seconds each)

- **Voice:** in the coach tap the microphone and speak a question in English, then tap Listen on the answer. Only where the browser supports it; Bangla listening depends on the device (see `voice-checklist.md`).
- **Voice commands:** tap the mic in the header, say "add 500 taka for tea", show the card (amount, category, date), Confirm, then Undo. Then say "can I afford a 5000 taka phone" to hand off to the coach. Needs internet and the one-time voice consent.
- **Unusual payment:** add a payment about ten times the usual at a place you use often. The alert appears; open it and show "Why this decision" (the score against the threshold).
- **Forecast model:** open Forecast (the model is on by default) and point at the shaded range around the line and the note under the chart that says a learned model was used. The low-balance warning is calculated more cautiously than the line, so it can show even when the line stays above the safety line.
- **Name-pattern filing:** add a payment to a merchant such as "Rahim Pharmasy" (misspelled on purpose). It is filed under Health by the pattern model; open "Why this decision" to see the parts of the name it recognised. Add "Car Rental" and note that it is filed under Bills because of the word "rent" but queued for review, because the model thinks it is Transport.
- **Credit readiness:** open it from Home. Point at the "informational only" banner first, then the four components.

## If something goes wrong

- Press **Demo tools > Gig** on Home to reset to the starting state in a few seconds.
- No coach answer within 10 seconds: say "the model is slow on this connection", wait, or show the saved screenshot. If the AI is down the coach answers from a template and says so.
- Admin view empty (hidden figures): open Insights, press **Create demo cohort** and wait about 30 seconds.
