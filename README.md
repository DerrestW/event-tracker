# Event Tracker

Local-first event operations and finance app for managing:

- event P&L and net return
- payment breakdowns and reminders
- contacts and to-do lists
- event info, staffing, contracts, and travel
- analytics, yearly totals, and event comparisons
- document uploads plus Excel/PDF exports

## Local Development

```bash
npm install
npm run dev
```

Frontend runs on `http://localhost:3002` when started manually with Vite, and the API runs on `http://localhost:4000`.

## Production

This project includes:

- `Dockerfile`
- `render.yaml`
- `supabase/schema.sql`
- `.env.example`

Render is the recommended deployment target because the app needs persistent storage for:

- SQLite data
- uploaded documents

The server respects `STORAGE_ROOT` in production so the mounted disk can store `data/` and `uploads/`.

## Cheap-First Vercel Path

This app now also supports a Vercel-friendly storage path using Supabase.

### Needed setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Create env vars from `.env.example`.
4. Add the same env vars in Vercel.
5. Deploy the Vite app to Vercel.

### How it works

- If `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are present, the frontend uses Supabase directly.
- If those env vars are missing, the app falls back to the local `/api` server for development.

### Important note

The cheap-first Supabase path is optimized for simplicity, not hardened multi-user security yet. It is the fastest route to a low-cost Vercel deployment for a single-user workflow.
