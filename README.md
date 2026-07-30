# TMT OFFICIAL — Admin Panel (CMS)

A production-ready admin panel for the TMT OFFICIAL website: Vanilla JS frontend,
Vercel Serverless Functions backend, Supabase (Postgres + Auth + Storage), Resend email.

## 1. Stack

- Frontend: HTML5 / CSS3 / Vanilla JS (ES Modules)
- Backend: Vercel Serverless Functions (Node.js, `/api`)
- Database + Auth + Storage: Supabase
- Email: Resend (provider-abstracted — see `api/_lib/email/`)
- Charts: Chart.js (CDN)
- Icons: Lucide (CDN)
- Fonts: Poppins + Inter (Google Fonts)

## 2. Project layout

```
admin/                 → static admin frontend (deployed as-is by Vercel)
  login.html, index.html
  css/                 → stylesheets
  js/                  → ES modules
  components/          → shared HTML partials (fetched at runtime)
api/                    → Vercel serverless functions
  _lib/                 → shared server-side helpers (supabase client, auth guard, email)
sql/schema.sql          → full Postgres schema + RLS policies
vercel.json             → routing + function config
package.json
.env.example
```

## 3. Environment variables

Create these in the Vercel project (Project → Settings → Environment Variables).
**Never** put the service role key in any client-side file — it is only read inside
`/api/*` functions, which run on the server.

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Public anon key (safe for client, used by login page) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — **server only**, used by `/api` functions |
| `SUPABASE_JWT_SECRET` | Found in Supabase → Settings → API → JWT Settings, used to verify sessions server-side |
| `RESEND_API_KEY` | Resend API key for transactional email |
| `EMAIL_FROM` | e.g. `TMT OFFICIAL <updates@tmtofficial.com>` |
| `ADMIN_ALLOWED_EMAILS` | Comma-separated list of emails allowed to log into the admin panel (extra role gate on top of Supabase Auth) |
| `PUBLIC_SITE_URL` | e.g. `https://tmtofficial.com` — used to build unsubscribe/watch links in emails |

The **only** values exposed to the browser are `SUPABASE_URL` and `SUPABASE_ANON_KEY`,
set directly in `admin/js/config.js` (see below) — these are meant to be public per
Supabase's own security model (Row Level Security does the real enforcement).

> **You must edit `admin/js/config.js` before anything will work.** It ships with
> placeholder values (`SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co'` and
> `SUPABASE_ANON_KEY = 'YOUR_ANON_KEY'`). Static HTML/JS has no build step here, so
> these two lines are edited directly rather than templated from an env var. If you
> see a login page that never redirects, or a dashboard stuck on its loading spinner,
> this is the first thing to check — open the browser console, you'll see network
> errors against `YOUR-PROJECT.supabase.co`.

Copy `.env.example` to `.env` for local dev with `vercel dev`.

## 4. Supabase setup

1. Create a new Supabase project.
2. Open the SQL editor and run `sql/schema.sql` — creates all tables, indexes, and
   Row Level Security policies.
3. Go to Authentication → Providers → enable **Email**.
4. Authentication → Users → create your admin user(s) (email + password).
5. Add those same emails to `ADMIN_ALLOWED_EMAILS` in your env vars.
6. Storage → create a public bucket named `downloads` (used by the Downloads module)
   and a public bucket named `media` (used for settings logo/favicon/banner uploads).
   The schema/policies for storage are included at the bottom of `sql/schema.sql`.

## 5. Local development

```bash
npm install
npm i -g vercel
vercel dev
```

Visit `http://localhost:3000/admin/login.html`.

## 6. Deploy

```bash
vercel --prod
```

Make sure all environment variables above are set in the Vercel dashboard first.

## 7. Security notes

- Every `/api` function (except `login`) calls `requireAuth()` from
  `api/_lib/auth.js`, which verifies the Supabase JWT sent in the
  `Authorization: Bearer <token>` header, and rejects if the email is not in
  `ADMIN_ALLOWED_EMAILS`.
- All DB tables have Row Level Security enabled; only the service role
  (server-side only) can write. Public read policies are scoped narrowly
  (e.g. `videos` public read only where `published = true`).
- All user input passed to Postgres goes through the Supabase JS client's
  parameterized query builder — no raw SQL string concatenation anywhere.
- All HTML rendered from DB content is escaped client-side via `escapeHTML()`
  in `admin/js/utils.js` before insertion into the DOM.
- Rate limiting: `api/_lib/rateLimiter.js` implements a simple in-memory
  token bucket per IP for the `login` and `send-update` endpoints (swap for
  Upstash/Redis in a multi-region deployment — the interface is already
  provider-agnostic).

## 8. Troubleshooting: stuck on a loading screen / no login page

Work through this in order:

1. **`admin/js/config.js` still has placeholder values.** This is the #1 cause.
   Open it and confirm `SUPABASE_URL` / `SUPABASE_ANON_KEY` are your real project's
   values (Supabase Dashboard → Project Settings → API).
2. **Open the browser DevTools console** on the stuck page. A failed `fetch` to
   `your-project.supabase.co` or a CORS error confirms #1. A 401/403 on
   `/api/verify-session` means your Vercel env vars aren't set, or your email
   isn't in `ADMIN_ALLOWED_EMAILS`.
3. **Check you ran `sql/schema.sql`** in the Supabase SQL editor — without the
   `settings` row and tables, several API calls will 500.
4. **Check the Vercel function logs** (`vercel logs` or the dashboard) for the
   specific `/api/*` route — every handler in this project logs errors with a
   `[route:action]` prefix (e.g. `[videos:list]`) to make this fast to find.
5. **Confirm you created an Auth user** in Supabase (Authentication → Users) and
   that its email is also listed in `ADMIN_ALLOWED_EMAILS` — a valid Supabase
   login that isn't allow-listed will show "This account is not authorized...".
6. **Hard refresh / clear `localStorage`** for the site — a stale/corrupt
   `tmt-admin-auth` key from a previous misconfigured attempt can make
   `getSession()` return a session-shaped object that then fails verification
   silently. Clearing storage forces a clean login.

If `index.html` loads forever on its spinner specifically (not `login.html`),
it's almost always because `guardPage()` in `admin/js/auth.js` found a local
session but the `/api/verify-session` call is failing — see step 2.

## 9. Replacing Resend with another email provider

`api/_lib/email/index.js` exports a single `sendEmail({ to, subject, html })`
function. It currently delegates to `api/_lib/email/resend.js`. To switch
providers (e.g. Gmail via nodemailer), implement the same function signature
in a new file (e.g. `gmail.js`) and change the one import line in `index.js`.
No other file in the codebase needs to change.
