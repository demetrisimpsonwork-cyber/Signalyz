# Vercel migration checklist — Signalyz frontend

Host the Signalyz Vite/React SPA on **Vercel**, pointed at Supabase project **`hzsswurcqaxrsacseknz`**, without Lovable hosting.

**Out of scope for this migration (do not change yet):** Supabase edge function secrets, Stripe, Anthropic, OAuth redirect URLs, custom domain DNS, production deploy.

**Already complete (not a Vercel blocker):** Resend email on Supabase project `hzsswurcqaxrsacseknz` — domain verified, smoke test passed. Production email uses `SEND_EMAIL_HOOK_SECRET` (auth hook) and `RESEND_API_KEY` (queue dispatcher), not Lovable send.

---

## 1. Build outside Lovable

| Item | Value |
|---|---|
| Framework | Vite 5 + React 18 + TypeScript |
| Package manager | npm |
| Install | `npm install` |
| Build command | `npm run build` (runs `vite build`) |
| Output directory | `dist` |
| Dev server | `npm run dev` (port 8080) |
| Node version | 18.x or 20.x recommended |

The repo is a standard Vite SPA. `lovable-tagger` is dev-only and does not affect production builds.

**Local build verified:** run with target Supabase env vars (see §4) before connecting Vercel.

---

## 2. Required frontend environment variables

These are baked in at **build time** (`import.meta.env`). Set them in Vercel for **Production**, **Preview**, and **Development** unless you intentionally use different projects per environment.

| Variable | Required | Used by |
|---|---|---|
| `VITE_SUPABASE_PROJECT_ID` | Yes (checklist / ops) | Not referenced in app code today; keep for tooling and parity |
| `VITE_SUPABASE_URL` | Yes | `src/integrations/supabase/client.ts`, `src/components/ResumeBuilder.tsx` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | Same as above |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Optional today | Listed in `.env.new-project.example`; checkout uses edge functions, not client Stripe.js yet |

The Supabase client **requires** `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` at runtime. Missing values throw a clear error instead of falling back to a Lovable-managed project.

---

## 3. Vercel environment variable checklist

Copy into **Vercel → Project → Settings → Environment Variables**:

```env
VITE_SUPABASE_PROJECT_ID=hzsswurcqaxrsacseknz
VITE_SUPABASE_URL=https://hzsswurcqaxrsacseknz.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_lRCytBwIi1whLGQR92_4Jw_fHRuxfvk
```

Optional (unchanged in this migration — keep existing Stripe key when you wire client-side Stripe):

```env
VITE_STRIPE_PUBLISHABLE_KEY=<your existing pk_test_ or pk_live_ key>
```

**Do not** add Supabase service role, Stripe secret, Resend, Anthropic, or OAuth secrets to Vercel — those belong in Supabase edge function secrets only.

### Supabase secrets (email — already on `hzsswur`, not Vercel)

| Secret | Function | Purpose |
|---|---|---|
| `SEND_EMAIL_HOOK_SECRET` | `auth-email-hook` | Verify Supabase Auth Send Email hook requests |
| `RESEND_API_KEY` | `process-email-queue` | Send queued auth/transactional mail via Resend |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Both | DB access, queue enqueue/process |

`LOVABLE_API_KEY` is **not** required for production email on `hzsswurcqaxrsacseknz`.

---

## 4. Local build (pre-Vercel)

PowerShell:

```powershell
cd "c:\Users\metri\OneDrive\Documents\Metri\React Projects\Signalyz"

$env:VITE_SUPABASE_PROJECT_ID="hzsswurcqaxrsacseknz"
$env:VITE_SUPABASE_URL="https://hzsswurcqaxrsacseknz.supabase.co"
$env:VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_lRCytBwIi1whLGQR92_4Jw_fHRuxfvk"

npm run build
npm run preview   # optional smoke test on http://localhost:4173
```

Bash:

```bash
VITE_SUPABASE_PROJECT_ID=hzsswurcqaxrsacseknz \
VITE_SUPABASE_URL=https://hzsswurcqaxrsacseknz.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_lRCytBwIi1whLGQR92_4Jw_fHRuxfvk \
npm run build
```

---

## 5. Vercel deployment steps (do not run production until approved)

### A. Connect repository

1. [vercel.com/new](https://vercel.com/new) → Import the Signalyz Git repository.
2. **Framework Preset:** Vite (auto-detected).
3. **Root Directory:** `.` (repo root).
4. **Build Command:** `npm run build`
5. **Output Directory:** `dist`
6. **Install Command:** `npm install`

`vercel.json` in the repo adds SPA rewrites so React Router paths (`/auth`, `/dashboard`, etc.) resolve to `index.html`.

### B. Set environment variables

1. Project → **Settings** → **Environment Variables**.
2. Add the three Supabase variables from §3 for **Production**, **Preview**, and **Development**.
3. Save. Redeploy is required for env changes to affect the built bundle.

### C. First deploy (preview only — await approval for production)

1. Push the migration branch to GitHub.
2. Vercel creates a **Preview** deployment automatically.
3. Open the preview URL and smoke-test:
   - Home loads
   - `/auth` loads
   - Sign-in attempt reaches Supabase (network tab → `hzsswurcqaxrsacseknz.supabase.co`)
4. **Do not** promote to Production or attach `signalyz.ai` until explicitly approved.

### D. Supabase Auth URL configuration (when ready — not DNS)

Before switching users to the Vercel URL, add Vercel preview/production URLs in Supabase:

**Authentication → URL Configuration**

- **Site URL:** Vercel production URL (later: `https://signalyz.ai`)
- **Redirect URLs:** `https://<vercel-preview>.vercel.app/**`, production URL, `http://localhost:8080/**`

OAuth provider console redirect URIs are a separate follow-up (out of scope here).

### E. Custom domain (later — not in this step)

When approved:

1. Vercel → **Domains** → add `signalyz.ai` / `www.signalyz.ai`.
2. Update DNS at your registrar per Vercel instructions.
3. Update Supabase Auth Site URL and Redirect URLs to the custom domain.

---

## 6. Code changes in this migration

| File | Change |
|---|---|
| `src/integrations/supabase/client.ts` | Removed Lovable auto-generated pattern; require `VITE_*` env vars (no hardcoded fallbacks) |
| `src/vite-env.d.ts` | Typed `ImportMetaEnv` for frontend env vars |
| `vercel.json` | SPA rewrite rule for client-side routing |
| `docs/vercel-migration-checklist.md` | This document |

**Not modified:** `.env`, Supabase edge functions, backend secrets, Stripe/Anthropic/OAuth.

---

## 7. Email stack (Resend — deployed on `hzsswur`)

Production auth email on **`hzsswurcqaxrsacseknz`** is on Resend:

| Step | Function | Runtime secret | Status |
|---|---|---|---|
| Auth hook receives signup/recovery/etc. | `auth-email-hook` | `SEND_EMAIL_HOOK_SECRET` | Deployed; smoke test passed |
| Queue worker sends HTML | `process-email-queue` | `RESEND_API_KEY` | Deployed; sends via `notify.signalyz.ai` / Resend |
| Domain | Resend dashboard | — | Verified |

Flow: Supabase Auth → `auth-email-hook` (render React Email, enqueue) → `process-email-queue` (Resend API) → recipient.

### Repo source (aligned with deployed `hzsswur`)

Git repo matches the deployed Resend architecture:

- `auth-email-hook` — Standard Webhooks via `SEND_EMAIL_HOOK_SECRET`, enqueue-only
- `process-email-queue` — Resend API via `RESEND_API_KEY`
- Shared helpers — `_shared/authEmailPayload.ts`, `_shared/emailConfig.ts`, `_shared/resend.ts`

---

## 8. Risks and follow-ups

| Risk | Mitigation |
|---|---|
| Auth redirect mismatch | Add Vercel URLs to Supabase Auth before go-live; OAuth still uses Lovable popup on desktop (`src/integrations/lovable/index.ts`) |
| Accidental Lovable email redeploy | Repo now matches Resend deployment — safe to redeploy email functions from git when needed |
| Stripe checkout | Edge functions use Supabase secrets; success/cancel URLs come from `window.location.origin` — works on Vercel once deployed |
| Old Lovable URL still live | Users may hit `signalyz-app.lovable.app` until DNS/traffic cutover |
| Build without env vars | Build succeeds but app throws at runtime if `VITE_SUPABASE_*` missing — always set Vercel env before deploy |
| RLS / empty DB | New Supabase project must have migrations applied (`supabase/config.toml` already references `hzsswurcqaxrsacseknz`) |

### Where Lovable is still used (Signalyz production)

| Area | Lovable dependency | Blocks Vercel frontend? |
|---|---|---|
| **Email send** | None on deployed `hzsswur` (Resend) | No |
| **Google OAuth (desktop)** | `@lovable.dev/cloud-auth-js` in `src/integrations/lovable/index.ts` | No — works from any origin if Supabase Auth URLs allow it |
| **Dev tooling** | `lovable-tagger` in `vite.config.ts` (dev only) | No |

---

## 9. Sign-off checklist

- [ ] Local `npm run build` succeeds with `hzsswurcqaxrsacseknz` env vars
- [ ] Vercel project connected to repo
- [ ] Three `VITE_SUPABASE_*` vars set in Vercel
- [ ] Preview deployment smoke-tested
- [ ] Supabase Auth redirect URLs updated for preview URL
- [ ] **Production deploy approved by owner**
- [ ] Custom domain DNS (future)
