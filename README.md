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

Render is the recommended deployment target because the app needs persistent storage for:

- SQLite data
- uploaded documents

The server respects `STORAGE_ROOT` in production so the mounted disk can store `data/` and `uploads/`.
