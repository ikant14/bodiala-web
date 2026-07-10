# bodiala-web

React + TypeScript + Vite frontend for the **bodiala** RezLive integration API.

User flow: pick a **country** → **city** → dates/guests → **search hotels** → **book** (prebook →
confirm → book) → view/cancel bookings.

## Prerequisites

- **Node.js 18+** (built with 24 LTS).
- The **bodiala** backend running on `http://localhost:8080`. For the live actions (search/book) run
  it with the `stub` profile (or real RezLive credentials):
  ```powershell
  # in the bodiala repo
  .\dev.ps1
  ```

## Run

```bash
npm install        # first time only (deps may already be installed)
npm run dev        # http://localhost:5173
```

### Windows: "running scripts is disabled on this system"

PowerShell resolves `npm` to `npm.ps1`, and Windows blocks `.ps1` scripts by default. Two options:

- **Zero-config:** run **`.\dev.cmd`** (or double-click `dev.cmd`). It's a batch file, which the
  script policy doesn't govern, so it always works.
- **Make plain `npm run dev` work permanently** — run this **once, in your own PowerShell**, then
  open a new window:
  ```powershell
  Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
  ```

The dev server **proxies `/api` → `http://localhost:8080`** (see `vite.config.ts`), so the browser
makes same-origin requests and no CORS setup is needed on the backend. Point it elsewhere with:

```bash
VITE_API_TARGET=http://localhost:9999 npm run dev
```

## Build

```bash
npm run build      # type-checks and outputs to dist/
npm run preview    # serve the production build locally
```

## What talks to what

| UI action | Endpoint |
|---|---|
| Country / city dropdowns | `GET /api/static-data/countries`, `/cities?country=` |
| Search hotels | `POST /api/search/by-destination` |
| Book dialog | `POST /api/bookings/prebook` then `POST /api/bookings` |
| My bookings + cancel | `GET /api/bookings`, `POST /api/bookings/{id}/cancel` |

> The backend **auto-imports the sample static data on startup**, so the Country/City dropdowns are
> populated with no manual step. Search/booking need the `stub` profile or real credentials —
> otherwise the backend returns **503** and the UI shows the error.
