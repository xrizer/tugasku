# AGENTS.md

## Cursor Cloud specific instructions

### What this is
`tugasku` / "LifeHack by afifi" is a single-page **Vite + React** app (`src/App.jsx` is the whole UI) backed by a **hosted Supabase** project. There is no local backend to run — data lives in the remote Supabase instance configured via `.env`.

### Services & commands
There is only one dev service (the Vite frontend). Standard scripts live in `package.json`:
- Dev server: `npm run dev` (Vite, serves on `http://localhost:5173`).
- Build: `npm run build` (`vite build`).
- Preview built output: `npm run preview`.
- **No lint script and no test suite exist** in this repo (`package.json` defines only `dev`/`build`/`preview`). Don't invent one.

### Environment file (required for the app to work)
Vite reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `.env`. `.env` is gitignored, but a committed template `".env copy"` (note the space) holds working publishable values. The startup update script copies `".env copy"` → `.env` only if `.env` is missing, so the dev server has Supabase config out of the box. If you need different Supabase credentials, edit `.env` directly (it won't be overwritten once it exists).

### `api/` folder is NOT part of `npm run dev`
`api/*.js` are **Vercel-style serverless functions** (`register`, `analyze`, `reflect`, `suggest`, `tripai`). Vite does not serve them; `fetch("/api/...")` calls only work under `vercel dev` or on Vercel. They require server-side secrets that are **not** in the repo and use no `VITE_` prefix:
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INVITE_CODE` (used by `api/register.js`).
- `GEMINI_API_KEY` (used by the AI proxy endpoints).

### Auth model (important gotcha)
- Login is `supabase.auth.signInWithPassword` using a synthetic email `"<username>@tugasku.local"`.
- **Public signup and anonymous sign-in are disabled** on the Supabase project, and Supabase rejects the `.local` email domain via the client. New accounts can therefore only be created through the `api/register` admin endpoint (needs `SUPABASE_SERVICE_ROLE_KEY` + `INVITE_CODE`).
- Consequence: the authenticated task board cannot be exercised without either valid login credentials or those admin secrets. Table writes are RLS-scoped to `auth.uid()`.
- No login needed for the **public share view**: `http://localhost:5173/?share=<user_id>` renders read-only public (`is_public`) tasks/moods/time-blocks straight from Supabase — useful for verifying end-to-end connectivity without an account.
