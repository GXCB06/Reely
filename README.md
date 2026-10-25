# Reely

Find the short videos worth copying for your product. Reely searches TikTok and YouTube Shorts,
ranks videos by how far they beat their creator's usual views, and (soon) turns winners into
scripts for your own product. Thai + English.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the keys.
3. In Supabase → SQL editor, run `supabase/migrations/0001_init.sql`.
4. In Supabase → Authentication → URL configuration, add `http://localhost:3000/auth/callback`
   (and your Vercel URL later) to the redirect URLs.
5. `npm run dev` → http://localhost:3000/th/app

`USE_FIXTURES=true` (default) uses saved sample responses, so development costs no API credits.
Set it to `false` to call the real APIs.

## Scripts

`npm run dev` · `npm run build` · `npm test` · `npm run lint` · `npm run typecheck`

Product spec: [docs/SPEC.md](docs/SPEC.md). Contributor and AI-agent rules: [CLAUDE.md](CLAUDE.md).
