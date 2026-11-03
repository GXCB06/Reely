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
lib/ask.ts                    # Ask Reely answer and thread types, thread memory (lib/scripts.ts writes and saves scripts)
lib/eval.ts                   # relevance test set metrics (precision@10, creators@5, IG useful, cost per useful clip), judge-check agreement; data in lib/eval-data.ts, owner page app/[locale]/app/eval
lib/eval-replay.ts            # order variants replayed on stored results (/app/eval/replay); lib/eval-check.ts = blind judge check (/app/eval/check)
lib/eval-queue.ts             # labelling queue (/app/eval/label): every judged clip once per brief, hidden repeats; data in lib/eval-queue-data.ts
lib/ranking.ts                # the "best" order (exact matches first, goal, account fit, 👍/👎) used by the search and every page that ranks results
lib/run-context.ts            # credits counted per research (stats.credits)
lib/events.ts                 # client_events names and sources (lib/event-log.ts writes them); never what users typed
lib/export.ts                 # research export: CSV (Excel), Markdown (for Claude / ChatGPT), JSON; data from lib/export-data.ts, served by app/api/research/[id]/export
lib/embed.ts                  # official TikTok / YouTube / Instagram embed players (components/clip-player.tsx: hover preview + in-app player)
lib/plan.ts                   # 7-day plan per product (content_plans): 👍 + saved + latest research's best clips → one AI call
lib/account-analysis.ts       # My channels maths (pure): snapshot, hit rate, posting pattern, monthly usual; data in lib/own-accounts.ts, pages app/[locale]/app/me
lib/canvas.ts                 # Content Canvas formats, inputs, copy text (pure); data in lib/canvas-data.ts, prompt `canvasPrompt` / `writeCanvas` in lib/ai/tasks.ts, pages app/[locale]/app/canvas
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
3. Usual-views lookups only for the top 5 TikTok / YouTube creators per platform in a run (Instagram: the seed accounts
   of rule 11, within its 25-credit cap), for tracked accounts, and for the creator of a pasted clip link. Plus up to 2 similar-product
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
20. Researches per person per Thai day: `RESEARCHES_PER_DAY` (null = no cap while collecting feedback; was 5), enforced in
    `runResearchAction` (lib/limits.ts). Owners listed in the `REELY_OWNER_EMAILS` env var (comma-separated) have no cap
    and see everyone's researches on the account page (lib/usage-report.ts).
11. Instagram: `/v1/instagram/search/popular` with the keyword's English version (Thai returns nothing;
    test: median 44.6K views vs ~9K from reels search), after up to 2 free rewordings ('… tips', '… ideas'; an empty popular answer costs nothing), falling back to `/v2/instagram/reels/search` only when
    popular is empty. Reels look back at least 365 days (popular is mostly older posts; dates come from the
    media id). Baseline = one page of `/v1/instagram/user/reels` (`trim=true`). No profile calls.
    Popular has no next page (~12 reels per keyword), so Instagram is **creator-first** (v0.2 1.5, lib/search.ts):
    seed accounts, best first: known creators (Instagram accounts this user's earlier researches for the product rated
    fit 2, last 90 days, free), Instagram's own account search (`/v1/instagram/search`, 1 credit, ~15 s, understands
    Thai; up to 3 keywords, Thai as typed and worldwide ones in English, `pickRelevantAccounts` keeps 4), this run's
    on-topic Instagram creators, accounts the AI knows for the category (`suggestInstagramAccounts`; a made-up handle
    is a free 404), then this run's fit-2 TikTok / YouTube accounts under the same handle (4). Each seed's feed is read
    with 2 pages (`instagramReels`, ~24 reels): the 4 best seeds first, then (`secondStep`) up to 10 by priority when
    those gave 2+ on-topic Reels, or 4 from the sources the first step didn't use when they didn't (a mixed first step
    was measured worse), only while the run is under 55 s
    and **never past 25 Instagram credits per research** (`IG_CREDIT_CAP`, keyword and
    account searches included; `creditsSoFar` in lib/run-context.ts). A reel counts at 2x+ its own account's usual
    views (from 8+ reels; no absolute floor beyond 1K), up to 4 per account, then a second `rateRelevance` call;
    counted as `fromFeeds`, with `accountsChecked` and `seeds` by source in the stats.
12. Run the AI relevance check (`rateRelevance`) BEFORE baseline lookups, so off-topic creators cost nothing.
    Score 1 means "inside the product's field", not just "same audience"; with 15+ clear matches, only score 2 stays.
    At the same time (in parallel, so slow models don't add up) the ACCOUNTS behind the clips are rated (`rateCreators`,
    up to 80, from up to 6 captions each: this run's plus posts already cached; 1 AI call per 40, no credits): a fit-0 account gets no usual-views lookup or feed picks, and
    its clips are dropped unless the clip itself scored 2 (`dropForCreator`, counted as `offCreator`). Lookups go to
    on-topic accounts first; the "best" order (`bestOrder` in lib/ranking.ts, used everywhere results are ranked) weighs
    the account's fit inside each label tier. Fit, account type and a one-line "why" are stored on `run_results`.
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
    video page only reads the shared cache. A link pasted into "Ask Reely" under a research is read the same way
    (`followUpAction`, reference clip). Ask Reely answers only from that research's clips: a reply, picked clips, their
    hooks (quoted from captions or transcripts already read, never invented), or a script from one clip (`writeScript` in
    lib/scripts.ts, one AI call, saved to `scripts`). The thread is stored in `research_followups`; the last 4 turns go into
    the prompt so "hook 2" resolves. No credits beyond a pasted link.

21. Relevance test set (`/app/eval`, owners in `REELY_OWNER_EMAILS` only): judges stored results with `judgeRelevance`
    (2 AI calls per brief, never credits) and stores labels in `relevance_labels`. **Every change to the search (keywords,
    relevance, Instagram, ranking) runs the test set and saves a snapshot before it ships**; report the before/after, for
    core AND hold-out briefs (`eval_briefs.holdout`: measured, never tuned on; a gain on core only doesn't ship).
    Order and filter changes are measured first with **Replay** (`/app/eval/replay`: same stored results and labels, AI only,
    no credits); live re-runs only for changes Replay can't show. Results store the search's own relevance score
    (`run_results.relevance`), and owner researches store every candidate found (`run_candidates`, kept or dropped and why;
    never for other users). **The owner's blind labels are the truth** (`/app/eval/label`: every clip in a judged place,
    once per brief, saved on each research of that brief; about every 20th clip is a hidden repeat that measures label
    consistency). Report numbers with "Only my labels" and their human coverage; the AI judge (v3; v4 failed its test
    half on 2026-11-02) only fills places not labelled yet, and is trusted only while it agrees with those labels.
22. Content Canvas (`/app/canvas`, v0.3 Part A): one AI call per generation or one-tap rewrite, **no credits**, at most
    `CANVAS_PER_DAY` (40) per person per rolling 24 h. It reads only what is stored (captions, cached breakdowns, transcripts
    already read); a pasted clip link follows rule 19, and "Read what the clip says" stays on the video page (rule 6). No
    AI video, voice or image generation (paid providers).
23. My channels (`/app/me`, v0.3 Part B): a founder's own public accounts, at most 3 per product (`own_accounts`). One
    deeper read when a channel is added (`addOwnAccount`: TikTok 4 pages = 4 credits via `tiktokProfileVideos`, Instagram
    3 pages = 3 credits, YouTube free), then only the normal 24-hour refresh of rule 5 when its page is opened. Posts live
    in the shared cache. Public numbers only: no account login (OAuth), no private analytics.

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
  only counts for accounts with 1K+ followers. Default order is "best" (`bestOrder`, lib/ranking.ts): exact matches
  first (relevance 2, or not scored), then label, then views weighted by engagement
  (likes + 3x comments + 5x saves and shares per view, versus a typical clip on that platform: `engagementFactor`,
  `bestScore` in lib/scoring.ts), account fit and 👍/👎. The results page's best 10 come from exact matches only;
  clips scored 1 get their own section, "Same audience, broader topic" (`topSplit` in lib/results.ts; search quality S1). A searched platform with fewer than 3 exact matches gets a plain
  notice instead of padding (`thinPlatforms`; S5). Cards show the plain engagement % (likes + comments + saves + shares per view).
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
- Build billing, teams, an open-ended Copilot chat (the Home chat only runs the research flow; the "Ask Reely" box
  under a research only answers from that research's clips (reply, clips, hooks, a script from one of them) or proposes
  a new search: `followUpAction`; the Content Canvas runs fixed formats only, with one optional extra line, never a
  chat thread), a model picker,
  bring-your-own AI keys, alerts, or anything listed in docs/SPEC.md §3.
