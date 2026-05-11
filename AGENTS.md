# NostromoTeamScheduler

## Repo structure

```
NostromoTeamScheduler/
├── index.html       ← HTML markup only
├── css/
│   └── main.css     ← All styles (dark cyberpunk theme)
├── js/
│   └── app.js       ← All logic (state, render, API, polling)
├── api/
│   └── data.js      ← Serverless function (Vercel Blob persistence)
├── package.json     ← Dependency: @vercel/blob
├── vercel.json      ← Vercel routing config
├── AGENTS.md
└── .gitignore
```

## Dev workflow

- **Run**: `vercel dev` (requires Node.js, Vercel account linked)
- **Deploy**: `vercel --prod`
- **Data**: persisted in Vercel Blob (file `teamschedule.json`) — shared across all users
- **Auto-refresh**: polls API every 30s, patches only changed cells (no blink)
- **Seed**: API seeds the current week with screenshot data on first load (when blob doesn't exist yet)
- **Team**: 7 members, 5-day work week (Mon–Fri), Spanish locale
- **Statuses**: home office, oficina, oficina obligatoria, viaje, festivo, vacaciones, baja, formación

## Conventions

- All UI text is in Spanish (labels, day names, legend)
- Dark cyberpunk theme ("Nostromo" = _Alien_ reference)
- `.idea/` is gitignored (Rider IDE)

## Dependencies

- **External**: `@vercel/blob` — Vercel Blob (object storage for JSON persistence)
- **No other deps**: Google Fonts (`DM Mono`, `Syne`) loaded via `<link>` in HTML

## Gotchas

- No service worker or offline support
- No tests — manual verification only
- Dev requires `vercel dev` (cannot open `index.html` directly due to API calls)
- Last-write-wins policy for concurrent edits
