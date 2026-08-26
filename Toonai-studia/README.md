# ToonAI Studio — MVP

A real, working full-stack scaffold: React/TS/Vite/Tailwind PWA frontend + Node/TS/Express backend +
PostgreSQL/Prisma database + Redis/BullMQ async job pipeline. No fake buttons, no fake credit
grants, no fake video generation — every integration point either does a real call or fails loudly
with a clear "not configured" error.

## What's implemented and working end-to-end

- **Auth**: email/password signup+login (bcrypt hashing, JWT access + rotating refresh tokens),
  Google Sign-In (verifies the real Google ID token server-side), phone/OTP architecture (returns
  a clear "provider not configured" error until you plug in an SMS vendor).
- **10 free credits**: granted exactly once per verified account, enforced in a DB transaction.
- **Credit system**: `CreditBalance` + append-only `CreditLedgerEntry` audit trail. Reserve → deduct
  → refund flow, all inside Postgres transactions, so double-taps/replays/race conditions can't
  double-spend. Every duration's cost is configurable via `AdminSetting`.
- **Generation pipeline**: Text-to-video and Image-to-video routes reserve credits, create a
  `Project` + `GenerationJob`, enqueue a BullMQ job, and return immediately (`202 Accepted`) with a
  `jobId` the client polls — the HTTP request never blocks on AI generation. The worker
  (`src/jobs/worker.ts`) calls the real provider, polls for completion, handles timeouts, and
  **refunds credits automatically on any failure**, including a missing provider config.
- **Provider interfaces** (`src/providers/`): `VideoProvider`, `ImageToVideoProvider`, `TextProvider`,
  `VoiceProvider`, `StorageProvider`. Each concrete implementation makes real HTTP calls to a
  configurable base URL/API key and throws `ProviderNotConfiguredError` if unset — the app never
  fabricates a video/audio result.
- **Payments**: Google Play Billing server-to-server verification using the purchase token as a
  unique DB column (idempotency key), so a duplicate/replayed token can never grant credits twice.
  Purchase history endpoint returns only non-sensitive fields.
- **Admin API**: configure welcome credits, per-duration credit costs, credit packs, subscription
  plans, ban users, view purchases/jobs/revenue. Revenue totals are computed only from `COMPLETED`
  purchases and are never directly editable.
- **Content moderation hook**: prompts are checked server-side before a job is queued; fails closed
  (blocks) if no moderation provider is configured, and content-report endpoint for users.
- **Security**: helmet, CORS allowlist, per-route rate limiting, zod input validation everywhere,
  signed S3 URLs, secrets only via env vars, no plaintext passwords, no card/PIN storage.
- **Frontend**: working PWA shell with real API calls — Home (live credit balance), Signup/Login,
  Create → Text-to-Video (full prompt/duration/aspect/style/camera picker → real API call → job
  polling), Projects (live status polling), Profile/logout.

## What's intentionally stubbed as an integration point, not faked

These require *your* vendor accounts/credentials — the code path is real and correctly wired, but
returns an explicit `501 Not Configured` until you add the keys in `.env`:

- Email/OTP verification provider (any transactional email or SMS/OTP vendor)
- The actual AI vendor behind `VideoProvider` / `ImageToVideoProvider` / `TextProvider` /
  `VoiceProvider` (Runway/Luma/Pika/Kling/ElevenLabs/etc. — adjust the request/response mapping in
  `src/providers/` to match whichever vendor you choose)
- S3-compatible bucket credentials
- Google Play Console service account (for purchase verification)
- Rewarded-ad server-side reward verification
- Content moderation vendor

## Not yet built (next priorities, per your spec's ordering)

- Remaining screens: Splash/Onboarding, Image-to-Video UI, AI Story editor, AI Voice picker,
  Video Editor (timeline/trim/subtitles UI), Pricing/Buy Credits/Payment History screens, Settings/
  Help/Privacy/Terms/Delete Account screens.
- FFmpeg encode step is wired into the worker's pipeline position but the actual subtitle burn-in /
  watermark overlay / resolution-normalization ffmpeg commands need to be filled in
  (`src/jobs/worker.ts`, marked with a comment) once you've chosen exact subtitle/watermark specs.
- Scene-level editing (reorder/regenerate/delete) for AI Story projects.
- Kotlin/Jetpack Compose Android app (backend routes are designed to be client-agnostic so this can
  consume the same REST API).
- Admin dashboard **UI** (the secure admin API exists; a React admin panel to call it does not yet).
- Automated tests and CI/deployment scripts.

## Setup

```bash
# Backend
cd backend
cp .env.example .env   # fill in DATABASE_URL, JWT secrets, and provider keys as you get them
npm install
npx prisma migrate dev --name init
npx prisma db seed
npm run dev             # API on :4000
npm run worker          # separate process, consumes the generation queue (needs Redis running)

# Frontend
cd ../frontend
npm install
npm run dev              # :5173, proxies to the API via VITE_API_BASE_URL
```

You'll need local Postgres and Redis running (or point `DATABASE_URL`/`REDIS_URL` at hosted ones).

## Project structure

```
backend/
  prisma/schema.prisma   # full DB schema: users, credits, subscriptions, projects,
                          # generation_jobs, purchases, credit_products, admin settings
  src/
    config/env.ts         # fail-fast env loading
    lib/                  # prisma client, auth (jwt/bcrypt)
    middleware/           # requireAuth, requireAdmin
    services/credits.service.ts   # the credit reserve/deduct/refund core
    providers/             # VideoProvider, ImageToVideoProvider, TextProvider,
                            # VoiceProvider, StorageProvider + concrete HTTP/S3 impls
    jobs/                  # BullMQ queue + worker (the async generation pipeline)
    routes/                # auth, credits, generate, projects, purchases, admin, moderation
frontend/
  src/pages/               # Home, Login, Signup, Create, TextToVideo, Projects, Profile
  src/lib/api.ts           # typed fetch client with token refresh
```
