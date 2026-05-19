# Supabase migrations

Apply the SQL files in this folder, in numeric order, against your Supabase
project (SQL editor → New query → paste → Run).

| Order | File                              | Purpose                                                                  |
| ----- | --------------------------------- | ------------------------------------------------------------------------ |
| 001   | `001_cooperative_settings.sql`    | Per-cooperative card template + settings, RLS, defaults                  |
| 002   | `002_platform_objects.sql`        | Indexes, `cooperative_stats` view, `get_platform_totals()` RPC, settings |

All migrations are idempotent (`CREATE … IF NOT EXISTS`, `OR REPLACE`, …) so
re-running is safe.

## Required environment variables

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
INTEGRATION_SECRET_KEY=<base64 32 bytes; openssl rand -base64 32>
```

`INTEGRATION_SECRET_KEY` is used to AES-256-GCM encrypt third-party API tokens
(KoboToolbox etc.) before they're written to the `integrations` table. Without
it the `/api/integrations/kobo` route returns a 500.
