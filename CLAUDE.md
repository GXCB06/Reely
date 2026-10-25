@AGENTS.md

# CLAUDE.md — Reely

Short-form content research tool (TikTok, YouTube Shorts, Instagram Reels) for Thai founders and
small teams. Home is a chat: the user describes the product (text, link and/or image), picks a region
(Thailand / Worldwide / Both), and Reely plans keywords and finds outlier videos. Users also track
competitors and turn videos into scripts for their own product. Full product spec: `docs/SPEC.md`. Read it before planning any feature.

## Stack

- **Next.js 16** (App Router) + TypeScript (strict) + Tailwind v4 + shadcn/ui (Base UI flavour).
  Next 16 differs from older versions: read `node_modules/next/dist/docs/` before using an API.
  Request interception lives in `proxy.ts` (the old `middleware.ts` name is deprecated).
- Supabase: Postgres, Auth (Google OAuth, email + password), Row Level Security — via `@supabase/ssr`
- next-intl v4: locales `th` (default) and `en`; all pages under `app/[locale]/`
- Gemini Flash-Lite via the Vercel AI SDK (reads text, product pages and images); zod for every structured AI output
- Hosting: Vercel Hobby. Package manager: **npm**

## Commands

- `npm run dev` — local dev server (http://localhost:3000/th/app)
- `npm run build` — production build (must pass before every commit)
- `npm run lint` / `npm run typecheck` / `npm test` (vitest)
- Database changes: add a file in `supabase/migrations/` and paste it into the Supabase SQL editor

## Folder structure

```
app/[locale]/login            # magic-link sign-in
app/[locale]/app/...          # signed-in pages (see docs/SPEC.md §4)
app/auth/callback             # magic-link landing (outside the locale segment)
components/ui/                # shadcn components (generated — don't hand-edit)
components/shell/             # sidebar, logo
components/                   # app components (OutlierCard, ...)
lib/adapters/                 # types.ts, youtube.ts, tiktok-scrapecreators.ts, instagram-scrapecreators.ts, index.ts, fixtures.ts
lib/adapters/__fixtures__/    # real vendor responses saved on Day 0 (used when USE_FIXTURES=true)
lib/scoring.ts                # reach score, usual-views score, labels, noise filter (+ scoring.test.ts)
lib/search.ts                 # keywords (with region) → adapters → noise filter → baselines → ranked results
lib/region.ts                 # Thailand / Worldwide / Both → keyword regions; Thai-caption check
lib/link-preview.ts           # reads a pasted product link (blocks private addresses — keep that check)
lib/today.ts                  # Today page: new breakouts (7 days) from tracked accounts + followed topics → 3-5 ideas
components/chat/              # chat Home (ResearchChat), bubbles, region icons
lib/cache.ts                  # 24-hour shared cache (creators, videos)
lib/usage.ts                  # api_usage logging
lib/supabase/                 # server.ts, client.ts, admin.ts (service role, server only)
lib/env.ts                    # isSupabaseConfigured(), fixturesEnabled()
messages/th.json, messages/en.json
proxy.ts                      # i18n routing + Supabase session refresh + /app protection
supabase/migrations/
docs/                         # SPEC.md, DAY0.md, reports/
.claude/skills/               # ScrapeCreators research skills (MIT)
```

## Adapter interface (do not change without asking)

Defined in `lib/adapters/types.ts`: `NormalizedVideo`, `NormalizedCreator`, `PlatformAdapter`
(`searchVideos(keyword, { region })`, `getCreator`, `getCreatorVideos`, optional `getTranscript`).
The app only talks to adapters (via `lib/adapters/index.ts`), never to vendor APIs directly.

## Cost rules (mandatory — this project must stay free)

1. Only the TikTok and Instagram adapters (ScrapeCreators) make paid calls. Instagram is off by default
   in the composer. Never add another paid provider without asking.
2. Max 5 keywords per run, 1 page per keyword per platform.
3. Usual-views lookups only for the top 5 creators per platform in a run, and for tracked accounts.
4. Before any external call, check the 24-hour cache (`lib/cache.ts`).
5. Tracked accounts refresh only when their page is opened, max once per 24 h.
6. Transcripts only when the user requests the breakdown; try the caption first.
7. Every external call goes through `lib/usage.ts` to log to `api_usage`.
8. Develop and test with `USE_FIXTURES=true` (the default). Never call real APIs in loops, tests,
   or seed scripts.
9. TikTok (ScrapeCreators) call parameters: search always `trim=true&date_posted=last-6-months`;
   profile videos always `trim=true&include_pinned=false`, max 2 pages for a baseline.
10. Never call `/v1/tiktok/user/audience` (26 credits) or transcripts with `use_ai_as_fallback`.
11. Instagram: search `/v2/instagram/reels/search` (1 page, `date_posted=last-year`); baseline = one page
    of `/v1/instagram/user/reels` (`trim=true`). No profile calls (search has no follower counts).
12. Run the AI relevance check (`rateRelevance`) BEFORE baseline lookups, so off-topic creators cost nothing.
13. Today page: built at most once per user per day (`daily_digests`), only when the page is opened.
    Followed topics: max 2 per user, first 3 keywords, TikTok only, `date_posted=this-week`.

## Security rules

- This repo is **public**. API keys live only in `.env.local` (git-ignored) and Vercel env vars.
  Never commit keys, never put them in code, docs or fixtures.
- Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` may reach the browser.
- The service-role client (`lib/supabase/admin.ts`) is server-only.
- Every user-owned table has RLS `user_id = auth.uid()`. Shared cache tables: read for
  authenticated users, write only via the service role.
- Validate all route-handler and server-action input with zod.

## Coding conventions

- Server Components by default; `"use client"` only where needed.
- All user-facing text goes in `messages/th.json` and `messages/en.json` — no hard-coded strings.
- Show the numbers behind every score label ("usually ~510 views → 41.3K").
- A label needs real views too: Breakout = 5x+ AND 10K+ views; Strong = 2x+ AND 5K+ views. Views ÷ followers
  only counts for accounts with 1K+ followers. Default order is "best": label, then views weighted by
  saves + shares (`bestScore` in lib/scoring.ts).
- Design: Peekly-inspired — near-black sidebar, light content panel with rounded corners,
  lavender `page-wash` header, purple primary, rounded-2xl cards, pill buttons. Virlo is the
  reference for flows (brief → keywords → results, outlier cards with views + multiplier).
- AI output language = the user's locale.
- Don't name functions `use*` unless they are React hooks (lint rule).

## How we work (keep Claude Code usage low)

- One feature per session (see docs/SPEC.md §9). Start in plan mode; wait for approval before coding.
- Build the UI with fixtures first, then connect the real adapter.
- Run `npm run build` and fix errors before saying a step is done.
- Commit after each working step with a clear message.
- Don't read or modify `node_modules`, `.next`, or generated shadcn files unless asked.
- If a vendor response is missing a field we need, stop and report it instead of guessing.

## Do not

- Copy Virlo's or Peekly's name, logo, wording, or assets.
- Use Virlo's API (its terms forbid competing products).
- Build billing, teams, an open-ended Copilot chat (the Home chat only runs the research flow),
  bring-your-own AI keys, alerts, or anything listed in docs/SPEC.md §3.
