# Architecture (one slide)

```mermaid
flowchart LR
  subgraph Phone["Phone: installable PWA (Next.js, Bangla first)"]
    UI[Screens: dashboard, budgets, goals,<br/>forecast, coach, learn, admin]
    Cache[(Last data saved on the phone<br/>offline reading)]
    UI <--> Cache
  end

  subgraph Supabase["Supabase (one shared cloud project)"]
    Auth[Phone OTP + server-side PIN]
    DB[(Postgres + row level security<br/>every table, own rows only)]
    RPC[Security definer functions<br/>goals, round-ups, badges, admin aggregates]
    Fn[Edge Functions<br/>ingest, forecast, score, nudges, coach]
    ML[Small models run in the functions<br/>forecast ensemble, name-pattern categorizer<br/>on by default, switch off with a flag]
    Fn --> ML
  end

  Sim[Simulated upay feed<br/>swappable adapter] --> Fn
  LLM[OpenAI model] <-- "compact numbers only,<br/>no names or phone numbers" --> Fn

  UI -- "JWT" --> Auth
  UI -- "reads with RLS" --> DB
  UI -- "writes via functions" --> RPC
  UI -- "invoke" --> Fn
  Fn --> DB
  RPC --> DB
```

## What to say

- **Numbers come from code, never from the AI.** The health score, the 30-day forecast and every affordability verdict are computed by tested code. The model only explains them in Bangla or English.
- **Privacy by design.** Row level security on every table, a PIN checked only on the server, the coach sees a short summary with no phone, name or merchant, and the admin view only shows groups of 5 or more people.
- **Small learned models, on our own server.** The 30-day forecast can use a seasonal model (Holt-Winters plus a trained ridge regression) and shows a likely range; merchant names the keyword rules cannot place can be filed by a pattern model. They run inside our functions, so no customer data goes to a third party for them, and each one falls back to the plain rules if it declines or fails. On simulated people the forecast model cut balance error by about 30%; see `docs/ML_REPORT.md` for what that does and does not show.
- **Swappable data source.** The simulated upay feed implements the same interface a real upay API would, so the rest of the app does not change.
- **Works offline.** After one visit the app opens without a connection and shows the last saved data; changes wait until the phone is back online.
