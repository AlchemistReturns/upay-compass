# upay Compass

Financial companion for the DIU CPC × upay AI Hackathon 2026 (Track 03).

**Everything about the product, architecture, roadmap and how to set up and contribute is in [spec.md](spec.md).** New teammates: start at Section 17 (Developer Guide).

## Quick start

Requires Node 20+ and pnpm. Docker Desktop is optional (local Supabase stack only).

```bash
pnpm install
# put the Supabase project URL + anon key in apps/web/.env.local (see spec.md Section 17.2)
pnpm dev               # http://localhost:3000
```

Setup details, test login numbers, the optional local stack, migration rules and the contribution workflow: spec.md Section 17.

## Layout

- `apps/web`: Next.js (App Router) PWA
- `packages/shared`: types, zod schemas, pure logic (score, forecast, categorizer)
- `adapters/upay-sim`: simulated upay transaction feed
- `supabase/`: migrations, Edge Functions, config
