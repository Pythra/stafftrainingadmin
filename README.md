# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
# Crunches Admin (React + Vite)

## Cloudflare deploy

This app is a **static Vite build** (`dist/`). Do **not** run `wrangler deploy` alone — build first.

### If the repo root is this folder (`crunchesadmin`)

In **Cloudflare Workers** (or Workers Builds) project settings:

| Setting | Value |
|--------|--------|
| **Root directory** | `/` (or leave empty) |
| **Build command** | *(leave empty)* — Cloudflare already runs `npm ci`; `wrangler.toml` runs `npm run build` before deploy |
| **Deploy command** | `npx wrangler deploy` |

If your dashboard has a separate **Build command** field, set it to `npm run build` and keep deploy as `npx wrangler deploy`.

Or use one deploy command only: `npm run deploy`

### If the repo root is a parent folder

Set **Root directory** to the path of this app, e.g. `Training/Adminsite/crunchesadmin`, so Cloudflare finds `package.json`.  
If you see *"No dependencies detected"*, the root directory is wrong.

### Environment variables (build time)

- `VITE_API_BASE_URL` — backend API URL (default: `https://crunches-training.fly.dev`)

### Alternative: Cloudflare Pages

Create a **Pages** project instead of Workers:

- **Framework preset:** Vite  
- **Build command:** `npm run build`  
- **Build output directory:** `dist`  
- No `wrangler deploy` needed.

SPA routing is handled by `not_found_handling` in `wrangler.toml` — do not add a `public/_redirects` file (it conflicts with Workers static assets).

If deploy still fails with an `_redirects` infinite-loop error, **clear the Cloudflare build cache** (Workers → your project → Settings → Builds → clear cache) and redeploy.
