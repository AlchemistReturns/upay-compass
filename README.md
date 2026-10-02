# upay Compass

Financial companion for the DIU CPC × upay AI Hackathon 2026 (Track 03).

**Everything about the product, architecture, roadmap and how to set up and contribute is in [spec.md](spec.md).** New teammates: start at Section 17 (Developer Guide).

## Quick start

Requires Node 20+, pnpm, Docker Desktop (running).

```bash
pnpm install
cp supabase/.env.example supabase/.env
pnpm sb start          # local Supabase stack
pnpm sb status         # copy the API URL and anon key into apps/web/.env.local
pnpm dev               # http://localhost:3000
```

Details, test login numbers, the cloud option and the contribution workflow: spec.md Section 17.

## Layout

- `apps/web`: Next.js (App Router) PWA
- `packages/shared`: types, zod schemas, pure logic (score, forecast, categorizer)
- `adapters/upay-sim`: simulated upay transaction feed
- `supabase/`: migrations, Edge Functions, config
