# Noface

Anonymous daily confession app MVP for web, iOS, and Android.

## What is included

- Next.js web app with feed, write flow, and "my confessions"
- Expo mobile app with the same MVP flow
- Shared TypeScript package for confession types, validation, moods, and anonymous id generation
- Supabase SQL schema for the `confessions` table and starter RLS policies
- Local demo mode when Supabase credentials are not configured yet

## Product shape

This scaffold follows the supplied spec closely:

- no profiles, followers, comments, or likes
- anonymous `user_id` generated locally on first launch
- text-only confessions with an optional mood tag and a 500 character limit
- shared feed plus a user-specific history view

## Workspace layout

- `apps/web` - Next.js responsive web client
- `apps/mobile` - Expo React Native client for iOS and Android
- `packages/shared` - shared types and validation
- `supabase/schema.sql` - database schema and policy starter

## Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy environment variables when you are ready to connect Supabase:

   ```bash
   cp .env.example apps/web/.env.local
   cp .env.example apps/mobile/.env
   ```

3. Add your values:

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`

4. Apply the SQL in `supabase/schema.sql` to your Supabase project.

## Run

```bash
pnpm dev:web
pnpm dev:mobile
```

## Validation

```bash
pnpm test
pnpm typecheck
pnpm build:web
```

Or run the full stabilization check in one command:

```bash
pnpm validate
```

## CI

- GitHub Actions workflow: `.github/workflows/ci.yml`
- Runs on pushes and pull requests to `main`
- Installs with pnpm, then runs tests, typecheck, and the web production build

## Deployment

### Web

- Deployment workflow: `.github/workflows/deploy-web.yml`
- Target platform: Vercel
- Project config: `apps/web/vercel.json`
- Required GitHub repository secrets:
   - `VERCEL_TOKEN`
   - `VERCEL_ORG_ID`
   - `VERCEL_PROJECT_ID`
- The workflow builds and deploys the Next.js app from `apps/web`

Manual web setup:

```bash
corepack pnpm vercel:web:link
corepack pnpm vercel:web:pull
corepack pnpm vercel:web:deploy:prod
```

When `vercel link` prompts for project settings, use the `apps/web` project and keep it as the deployment root.

Required Vercel environment variables for the web app:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Recommended Vercel project settings:

- Framework preset: `Next.js`
- Root directory: `apps/web`
- Install command: use `apps/web/vercel.json`
- Build command: use `apps/web/vercel.json`

After linking locally, copy the generated values from `apps/web/.vercel/project.json` into GitHub repository secrets:

- `projectId` -> `VERCEL_PROJECT_ID`
- `orgId` -> `VERCEL_ORG_ID`

Create `VERCEL_TOKEN` from your Vercel account settings, then the GitHub deploy workflow can ship `main` automatically.

### Mobile

- EAS config: `eas.json`
- Expo app config: `apps/mobile/app.json`
- The mobile app now includes a bundle identifier, Android package name, and app scheme for build/distribution setup
- Before shipping to stores, update `com.noface.mobile` to your final unique identifier if needed

Common mobile deployment steps:

```bash
corepack pnpm install
corepack pnpm --filter @noface/mobile dev
npx eas login
npx eas build --platform ios --profile production
npx eas build --platform android --profile production
```

## Notes

- Without env vars, both apps run in local demo mode using seeded sample confessions.
- The current MVP intentionally excludes comments, likes, replies, and identity features.
- Feed and my-confession cards can now be shared as downloadable web cards and native mobile share cards.
- My-confession delete is available in demo mode; live delete stays disabled until trusted identity or restore flows exist.
- Private confessions can be saved from web and mobile; they stay out of the public feed and remain visible in My Confessions only.
- Supabase now enforces server-side insert guardrails: blocked links and spam terms, plus a limit of 5 confessions per user in 10 minutes.
- Premium filter preview is now available on web and mobile for the public feed, with mood-match plus short-read and long-read filters.
- Premium filters are still a local preview only; billing, entitlement sync, and stronger moderation tooling are left for the next phase.
- Shared package tests, CI validation, and deployment scaffolding for Vercel plus Expo EAS are now included.