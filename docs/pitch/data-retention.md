# Data retention and deletion

How long upay Compass keeps each kind of data, why, and how it goes away. The periods below are the constants at the top of `purge_expired_data()` in `supabase/migrations/20261012090000_retention.sql`; change both together.

| Data | Why it is kept | Retention | How it is deleted |
|---|---|---|---|
| Profile, payments, budgets, goals, goal contributions, savings entries, alerts, streaks and badges, learning progress, personalized lessons, health and readiness scores, forecasts, category corrections | It is the person's own record; the app cannot work without it | Until the person deletes it or deletes their account. **Never purged automatically.** | Account deletion (below). Some rows can also be removed in the app (a payment, a goal, a budget). |
| Coach chat text (`coach_messages`) | Shows the conversation history | 90 days | Daily purge; the person can also clear the chat; removed with the account |
| Activity log (`audit_log`, what happened and when, never content) | Rate-limit counts, "My AI activity", abuse review | 90 days | Daily purge. On account deletion the person's rows lose their detail and their user id, then follow the 90-day rule |
| Rate-limit slots (rows in `audit_log` with entity `limit`) | Enforce per-person limits (the longest window is 60 minutes) | 1 day | Daily purge |
| AI request events (`model_events`: counts, durations, model name, no content, no user id) | Monitoring page | 30 days | Daily purge |
| Passkey sign-in challenges | One-time proof for a passkey sign-in; valid 5 minutes | 1 day at most | Deleted when used; daily purge for the rest |
| PIN hash, passkey public keys | Unlock the app on this person's devices | Until the person removes the passkey, or deletes their account. The PIN is also cleared after 8 wrong tries. | Account deletion; "remove passkey" in the app |
| Consent to share data with the AI (`coach_consent_at`, `voice_consent_at` on the profile) | Proof that the person agreed | Until withdrawn or account deletion | "Stop sharing" in Profile; account deletion |
| Voice recordings | Not kept. They are forwarded for transcription and forgotten; only an activity-log entry (size, language) is written | None | Not applicable |

## How the purge runs

`purge_expired_data()` deletes the rows older than the periods above and returns the number removed per kind. The migration schedules it with pg_cron every day at 03:17 UTC (job name `purge-expired-data`; check with `select * from cron.job;`). If pg_cron cannot be enabled on a project, the migration still succeeds and prints a notice; run `select public.purge_expired_data();` in the SQL editor on a schedule instead. Only the service role and the database owner can call it.

## Download or delete your data

- **Download:** Profile → Your data → *Download my data*. The `export-my-data` function returns one JSON file with the person's own profile, payments, budgets, goals, goal contributions, savings, alerts, streaks and badges, consents, coach chat, category corrections, scores, forecasts, passkey device names and activity log. It never contains the PIN hash, passkey keys, other people's rows or server secrets. Limit: 5 downloads per hour.
- **Delete:** Profile → Your data → *Delete my account*. The person types `DELETE` and enters their current PIN. The `delete-account` function checks the PIN with the same function and attempt limit as the lock screen, then deletes the sign-in account; every table with a person's rows is linked to it with `ON DELETE CASCADE`, so all of their rows go with it. The activity log is the only table kept (for aggregate counts): its rows lose their detail and user id. One final entry `account_deleted` is written with no user id and no content. Limit: 5 attempts per hour.

## Not covered by this app

- **Database backups** on the hosting provider may hold deleted data until their own backup window ends. The window for this project's Supabase plan was not checked.
- **OpenAI** receives the data described in the consent screens when a person uses the coach, voice or personalized lessons, and, only if the person has agreed, the counterparty name and note of a payment the app's rules cannot place (phone-number-like digits removed). How long OpenAI keeps it is set by OpenAI's terms and the project's account settings, not by this app.
