# bodiala-web — project guide

React frontend for the **bodiala** RezLive API. Part of a 3-repo project — see the master guide at
`../bodiala/CLAUDE.md` for the backend, stub, run flow, and architecture.

## Stack & run

React 18 · TypeScript · Vite 5 · Node 24.

```powershell
.\dev.cmd            # or `npm run dev`  ->  http://localhost:5173
```

- Vite **proxies `/api` → http://localhost:8080** (`vite.config.ts`), so no CORS setup on the backend.
  Override target with `VITE_API_TARGET`.
- Needs the backend running (in `../bodiala`: `.\dev.ps1`). Static data auto-imports there, so the
  Country/City dropdowns populate with no manual step.
- `npm run build` = `tsc -b` type-check + bundle.

## Structure (`src/`)

- `api.ts` — typed `fetch` client (throws `ApiError`; reads Spring `ProblemDetail.detail`).
- `types.ts` — API response/request types.
- `App.tsx` — shell: Search / My bookings tabs + light/dark theme toggle (persists to `localStorage`, light default).
- `components/` — `SearchView` (country→city→dates/guests + star-rating chips → results), `BookHotelDialog` (prebook → guest form → book), `HotelDetailDialog` (static images/amenities), `BookingsView` (list + cancel).
- `icons.tsx` — inline-SVG icons (no icon dependency).
- `styles.css` — bright **magenta-on-mint** theme (Hotelbeds-inspired), light + dark via `[data-theme]`.

## Gotchas

- **Windows:** `npm run dev` may hit "running scripts is disabled" (PowerShell blocks `npm.ps1`).
  Use **`.\dev.cmd`** or `npm.cmd run dev`. Fixing the policy must happen in the user's own shell.
- Google Fonts is loaded via `@import` (Inter); falls back to system fonts offline.
- Demo image URLs (from sample data) don't resolve → gradient fallback shows; harmless, but it can
  make preview-tool screenshots hang (verify via DOM/`preview_eval`).
