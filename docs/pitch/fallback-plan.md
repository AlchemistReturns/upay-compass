# Fallback plan for a bad venue connection

1. **Before the day:** run the app against the cloud project once from the demo laptop and the demo phone so both have the app installed and their last data saved. Test the airplane-mode step at home.
2. **Record a backup video** of the full demo script on the demo phone (screen recording, about 3 minutes) and keep it on the laptop and on a USB stick.
3. **If Wi-Fi is bad:** use the phone's mobile data. If that is also poor, the installed app still opens and shows the saved dashboard, goals, score and forecast; say so and show the offline banner, then play the video for the coach and admin parts.
4. **If the coach cannot be reached:** it answers from a template built from the same numbers and says the AI is unavailable. That is part of the design, not a failure.
5. **If the cloud project is down:** play the video. Local fallback: `pnpm sb start`, point `apps/web/.env.local` at it, `pnpm dev` (needs Docker; see the developer guide).
6. **Have ready:** the admin phone number and OTP, the demo phone number and PIN written on paper, a charger, and the screenshots in `docs/pitch/`.
