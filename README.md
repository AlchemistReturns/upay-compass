# upay Compass

Financial companion for the DIU CPC × upay AI Hackathon 2026 (Track 03). See [spec.md](spec.md).

## Layout

- `apps/web` — Next.js (App Router) PWA
- `packages/shared` — types, zod schemas, pure logic (score, forecast, categorizer)
- `adapters/upay-sim` — simulated upay transaction feed
- `supabase/` — migrations, Edge Functions, config

## Setup

Requires Node 20+, pnpm, Docker Desktop.

```bash
pnpm install
cp .env.example apps/web/.env.local   # fill in Supabase URL + anon key
pnpm sb start                         # local Supabase stack (Docker)
pnpm dev                              # http://localhost:3000
```

Checks: `pnpm lint && pnpm typecheck && pnpm test`. The Supabase CLI is a dev dependency; run it as `pnpm sb <cmd>`.
