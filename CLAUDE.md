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
- Gemini 3.1 Flash-Lite, then 3 Flash, then Flash-Lite latest: each moves on after an API error or 15 s without an
  answer (lib/ai/model.ts; 3 Flash's free tier is only 20 requests a day). If the relevance check still fails, the
  research is flagged (`stats.relevanceFailed`) and the page offers a free re-check (`recheckRelevanceAction`). Vercel AI SDK (reads text, product pages and images); zod for every structured AI output
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
app/api/plan/route.ts         # chat step 1, streamed: goal + keyword plan as newline-separated JSON (checks the session itself)
components/ui/                # shadcn components (generated — don't hand-edit)
components/shell/             # sidebar, logo
components/                   # app components (OutlierCard, ...)
lib/adapters/                 # types.ts, youtube.ts, tiktok-scrapecreators.ts, instagram-scrapecreators.ts, index.ts, fixtures.ts
lib/adapters/__fixtures__/    # real vendor responses saved on Day 0 (used when USE_FIXTURES=true)
lib/scoring.ts                # reach score, usual-views score, labels, noise filter (+ scoring.test.ts)
lib/search.ts                 # keywords (with region) → adapters → noise filter → baselines → ranked results
lib/region.ts                 # Thailand / Worldwide / Both → keyword regions; Thai-caption check
lib/feedback.ts               # 👍/👎 per product (clip_feedback): examples for the relevance check, 👎 clips dropped, ranking nudged
lib/goals.ts                  # what the clips are for (sell / shop / startup / brand) → goal-aware ranking; prompts in lib/ai/tasks.ts
lib/link-preview.ts           # reads a pasted product link (blocks private addresses — keep that check)
lib/clip-link.ts              # pasted Instagram Reel / TikTok links (client + server); lib/clip-import.ts reads one
lib/plan.ts                   # 7-day plan per product (content_plans): 👍 + saved + latest research's best clips → one AI call
lib/today.ts                  # Today page: new breakouts (7 days) from tracked accounts + followed topics → 3-5 ideas
lib/formats.ts                # format explorer: same sound + format search → topics, sounds, stage (lib/format-stats.ts)
lib/search-settings.ts        # time window, minimum views, caption language (shared by client and server)
lib/thumbs.ts                 # copies covers to the public `thumbs` storage bucket (vendor links expire in 5-23 h)
vercel.json                   # functions run in sin1 (Singapore), next to Supabase
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
3. Usual-views lookups only for the top 5 creators per platform in a run (8 Instagram creators when a run searches
   Reels without TikTok), for tracked accounts, and for the creator of a pasted clip link. Plus up to 2 similar-product
   accounts per platform (an app or brand like the user's promoting itself: `brand` from `rateRelevance`, or a handle
   matching a competitor): their standout clips join the results and get their own section ("From similar products").
4. Before any external call, check the 24-hour cache (`lib/cache.ts`).
5. Tracked accounts refresh only when their page is opened, max once per 24 h (TikTok 2 credits, Instagram 1, YouTube free).
6. Transcripts only when the user presses "Read what the clip says" on the video page (`lib/hook-breakdown.ts`):
   1 credit the first time anyone reads a clip, then cached for everyone in `video_transcripts` (a clip with no
   speech is remembered as 'none'); max 100 a day; clips over 2 minutes are not sent. The caption-based breakdown
   stays the free default.
7. Every external call goes through `lib/usage.ts` to log to `api_usage`.
8. Develop and test with `USE_FIXTURES=true` (the default). Never call real APIs in loops, tests,
   or seed scripts.
9. TikTok (ScrapeCreators) call parameters: keywords alternate between keyword search with
   `sort_by=most-liked` and `/v1/tiktok/search/top` (default relevance returns mostly <10K-view videos);
   keyword search is NOT trimmed (the trimmed response drops the sound; same 1 credit); both use the run
   window (7/30/90 days, default 90);
   profile videos always `trim=true&include_pinned=false`, max 2 pages for a baseline.
10. Never call `/v1/tiktok/user/audience` (26 credits) or transcripts with `use_ai_as_fallback`.
20. Researches per person per Thai day: `RESEARCHES_PER_DAY` (5, lib/search-settings.ts), enforced in
    `runResearchAction` (lib/limits.ts). Owners listed in the `REELY_OWNER_EMAILS` env var (comma-separated) have no cap
    and see everyone's researches on the account page (lib/usage-report.ts).
11. Instagram: `/v1/instagram/search/popular` with the keyword's English version (Thai returns nothing;
    test: median 44.6K views vs ~9K from reels search), after up to 2 free rewordings ('… tips', '… ideas'; an empty popular answer costs nothing), falling back to `/v2/instagram/reels/search` only when
    popular is empty. Reels look back at least 365 days (popular is mostly older posts; dates come from the
    media id). Baseline = one page of `/v1/instagram/user/reels` (`trim=true`). No profile calls.
    Popular has no next page (~12 reels per keyword), so the looked-up creators' feeds also add their own standout
    reels (2x+ their usual views, max 3 per creator) after a second `rateRelevance` call: no extra credits
    (`feedPicks` in lib/search.ts, counted as `fromFeeds`).
12. Run the AI relevance check (`rateRelevance`) BEFORE baseline lookups, so off-topic creators cost nothing.
    Score 1 means "inside the product's field", not just "same audience"; with 15+ clear matches, only score 2 stays.
16. Covers are copied to storage with `after()` (`persistThumbnails`), never inside the search itself:
    copying ~200 covers inline made a run take 66-80 s instead of ~25 s.
13. Today page: built at most once per user per day (`daily_digests`), only when the page is opened.
    Followed topics: max 2 per user, first 3 keywords, TikTok only, `date_posted=this-week`.
14. "Update with new videos" on a research: at most once per ~20 h per research, only the time since
    the last update, only new videos are added.
15. Format explorer (`lib/formats.ts`): 1 call to `/v1/tiktok/song/videos` for the seed's sound + max 2
    keyword searches (~3 credits); shared `formats` cache for 3 days. Never page through a sound.
    A build starts only when the user presses "Explore this format"; opening the page never spends credits.
17. Goals add no paid calls: the goal changes the keyword recipe, the relevance rubric and the order; the
    "your idea" line under each top-10 clip is one Gemini call per research (`writeIdeasAction`), made by the
    results page once the results show, so it never slows a run.
18. Expired covers repair themselves only when someone is looking at them: a cover that fails to load asks
    `/api/covers` (batched), which re-fetches that one video (`/v2/tiktok/video` or `/v1/instagram/post`, 1 credit),
    copies the cover to storage and updates the row. Max 150 repairs a day for everyone (`REPAIRS_PER_DAY`).
19. A pasted Instagram Reel / TikTok link (`lib/clip-import.ts`): `/v1/instagram/post` or `/v2/tiktok/video` (1 credit,
    ~7 s; skipped when the clip was fetched in the last 24 h), then the chat opens the video page with `?lookup=1`,
    which asks for the creator's usual views (1-2 credits, ~20 s on Instagram; skipped when any value is known).
    Max 60 reads + lookups a day for everyone (`reely/clip-import` in `api_usage`). "More hits from @creator" on the
    video page only reads the shared cache.

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
