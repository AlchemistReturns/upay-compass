# Security report

Run on 2026-10-07 against the **local** Supabase stack (never the live deployment). Test users: local phone numbers `+8801700000003` and `+8801700000004`. Companion: [threat-model.md](threat-model.md), [data-retention.md](data-retention.md).

## What was run

| Check | Command | Result |
|---|---|---|
| Row level security and grants audit | `pnpm audit:rls` | **Passed.** 22 tables, RLS on for all; anon reads only `categories`; every security-definer function has a fixed `search_path` and is not callable by anon. Now also checks `purge_expired_data()` is closed to browser roles. |
| Client bundle secret scan | `pnpm build` then `pnpm audit:bundle` | **Passed.** 55 files scanned. |
| Black-box probe | `pnpm security:probe` (needs the stack, functions served, `RLS_TEST_URL`, `RLS_TEST_ANON_KEY`, `RLS_TEST_SERVICE_KEY`) | **170 passed, 0 failed.** Function auth 64, cross-user REST 49, cross-user function ids 4, PIN lockout 7, rate limits 3, anon/admin 29, malformed bodies 14. The script refuses to run against any host but localhost. |
| Integration tests | `pnpm test` with the three variables above | 450 passed, 1 skipped (the optional demo-cohort test) in `packages/shared`; adapters 27 + 17 + 39 passed. Includes the new `privacy.integration.test.ts` (8 tests: export scope, no PIN hash, rejection without a session, deletion needs PIN and confirmation, no rows left in 18 tables, other person untouched, admin role deletable). |
| Dependency audit | `pnpm audit` | Before: 5 findings (2 critical, 1 high, 2 moderate). After: **1 high**, see below. |
| Secret scan | `gitleaks detect` (Docker image `zricethezav/gitleaks`) over 124 commits | 1 hit, not a secret: the public local-demo anon key (`iss: supabase-demo`) in `scripts/e2e-learn-local.mjs`. |
| Types and lint | `pnpm typecheck`, `pnpm lint` | Both clean. |

## Findings

| # | Finding | Severity | What was done |
|---|---|---|---|
| 1 | `tinypool` prototype pollution to code execution (2 advisories), and two `vitest` path-traversal advisories, in the test runner only | Critical (dev tool, not shipped) | **Fixed.** `vitest` raised from 3 to 4.1.11 in four packages; all tests still pass |
| 2 | `braces` stack-exhaustion denial of service, reached only through the `shadcn` scaffolding CLI listed in `apps/web` | High (not in the client bundle; `audit:bundle` passed) | **Not fixed.** A pnpm override did not take effect; left as a known limitation |
| 3 | `supabase/env.functions` (a misnamed copy of the function secrets, with an OpenAI key set) was untracked and not ignored, so `git add .` would have committed it. Not in git history. | High if committed | **Fixed.** Added to `.gitignore`. Consider deleting the file and rotating the key if it was ever shared |
| 4 | Payment labelling sent counterparty name and note to OpenAI without a consent step | Medium | **Fixed.** The model is called only with the person's consent; otherwise payments go to "Other, needs review". New integration test: no consent, no model call, payment filed as Other and marked to check. The consent text (English and Bangla) now lists this use |
| 5 | PIN is an app lock only: a stolen session can clear the PIN (8 wrong tries) and set a new one, which also weakens PIN re-entry for account deletion | Medium | Not fixed (threat model W1) |
| 6 | No security response headers on the web app | Low | **Fixed** for `nosniff`, `X-Frame-Options`, referrer and permissions policy (checked with `curl -I` on a production build). No CSP yet |
| 7 | Signed-in users can write their own `audit_log` rows with unbounded `detail` | Low | Not fixed (W2) |
| 8 | Internal error text returned in some function responses | Low | Not fixed (W4) |

The open item that touches the running app or its data: 5 (Medium). Item 2 is in development tooling only.

## Not covered

Penetration testing by an outside party, the live Supabase project's settings, load testing, and a Content-Security-Policy. The probes are automated checks against known patterns, not a substitute for a formal penetration test.
