# Postlaunch MVP — Product Spec (v0.1)

> Working name. A short-form content research tool (in the style of Virlo) for Thai founders,
> SMEs, creators and small agencies. Thai + English. Built to test with 3 users at $0.

## 1. Goal

Help a user **find short-form videos that are clearly outperforming in their niche, understand why,
and turn them into a script for their own product**, then keep an eye on competitors.

**First users:** 3 people (the founders of AccOs Pro and Aetox, plus the builder).

**Success after 2 weeks of use:**
- AccOs Pro finds 5+ relevant outlier videos and tracks FlowAccount and PEAK.
- Aetox gets 3+ scripts it would actually film.
- All 3 users say it saved time compared with scrolling TikTok, and use it at least weekly.

## 2. Core features (MVP)

| # | Feature | What the user does | Done when |
|---|---|---|---|
| 1 | **Find outliers** | On the chat Home, describes the product, pastes its link and/or adds an image, and picks a region (Thailand / Worldwide / Both) → Reely replies with what it understood + up to 5 keywords and exclusions → edits → "Find videos". Sees a grid of TikTok, YouTube Shorts and (optional) Instagram Reels ranked by outlier score, with filters (platform, date, score) and follow-up buttons | A run for "AI accounting software for Thai SMEs" returns ranked, relevant videos in under 60 s |
| 2 | **Track competitors** | Adds a handle (TikTok, YouTube; Instagram on Day 5) → sees recent posts, the account's usual views, and flagged breakouts. Refresh happens when the page is opened (max once/day) | FlowAccount's ~41K-view video is flagged as a breakout against its ~500 usual views |
| 3 | **Make my version** | Opens a video → sees AI breakdown (hook, format, angle, CTA, why it may have worked) → clicks "Make my version" → gets a script for their product | Script has hook / setup / demo / payoff / CTA, in the user's language |

**Supporting (not features on their own):** email-link sign-in, product profile, save to collection,
Thai/English switch.

**Quality and focus (2026-10-25, after the first live runs):** an AI relevance check drops off-topic
results before paid lookups; labels need real views (10K+ for Breakout); results open on the 10 best plus
3-5 "formulas that worked" (hook, why, idea for the user's product, example videos); "Show all" keeps the
full filterable grid. TikTok is the default platform (only one with saves and shares).

**Today page (`/app/today`):** the daily reason to come back. Built on the first visit of the day from
tracked accounts and up to 2 followed topics ("Follow this topic daily" on a research), last 7 days only,
skipping videos suggested in the last 14 days → 3-5 "post this today" ideas with a hook and an angle for
the user's product. Saved in `daily_digests`, so reopening costs nothing.

**Phases 1-3 (2026-10-26, after studying Virlo's Orbit and Trends):**
- Search settings before running: posted within 7 / 30 / 90 days (default 90) and minimum views (10K / 50K / 100K).
- Cards: real country flag (TikTok post region, YouTube channel country), TikTok Shop tag, the sound used.
- Agent memory: up to 5 saved products; the chat starts from a product chip; scripts pick the product.
- A research is a living board: "Update with new videos" adds only what was posted since last time.
- Format explorer (`/app/format/[videoId]`, board at `/app/formats`): from any video, who else made this kind of
  clip: how to do it (keep the same / make it yours), who it works for (B2B, consumer, local), what topics people
  applied it to, sounds used, videos posted per day and its stage (fresh / rising / steady / fading).

## 3. Not in the MVP

Open-ended Copilot chat (the Home chat only runs the research flow) · bring-your-own AI keys · automatic alerts (LINE/Telegram) · content trends, hashtags, sounds · Meta ads in-app
(link out to Meta Ad Library only) · Facebook organic · Instagram tracking · PDF reports · teams ·
billing · onboarding tour · mobile app.

## 4. Screens and routes

All routes live under `/[locale]` (`th` default, `en`).

| Screen | Route | Contents |
|---|---|---|
| Sign in | `/login` | Email magic link (Supabase) |
| Home (chat) | `/app` | "What are you building?" composer: text, link (read server-side), image (read by Gemini), region chips, platform chips → Reely's understanding + editable keywords → run. `?q=&region=&go=1` pre-fills and sends |
| Product profile | `/app/product` | Name, link, description, audience, language |
| New research | `/app/research/new` | Redirects to the chat Home |
| Research results | `/app/research/[id]` | Chat thread (the user's message, Reely's reply + keywords with region icons), then the outlier grid (thumbnail, views, followers, date, both scores, platform icon), filters, sort |
| Video detail | `/app/video/[id]` | Embed/link, metrics, AI breakdown, "Make my version", save |
| Tracking | `/app/tracking` | Tracked accounts list, add handle |
| Account detail | `/app/tracking/[platform]/[handle]` | Usual views, recent posts, breakouts highlighted |
| Saved | `/app/saved` | Saved videos |

Visual reference: the Lovable design (screenshots in `/docs/design`). Use shadcn/ui components; do not
copy Virlo's name, logo, wording or assets.

## 5. Outlier scores

- **Reach score** = `views / max(followers, 1)` (comparable to Virlo's approach).
- **Usual-views score** = `views / median(views of the creator's ~20 most recent posts, excluding this
  post and pinned posts)`. Computed only for the **top 5 creators** of a run and for tracked accounts.
- Labels (usual-views score; fall back to reach score when unavailable):
  - `≥ 5×` **Breakout** · `2–5×` **Strong** · `< 2×` **Normal**
- Always show the numbers behind the label ("usually ~510 views → this one 41.3K").
- **Noise filter** (verified on Day 0): hide results with fewer than **1,000 views** or from accounts
  with fewer than **100 followers** by default (user can switch the filter off). Without it, tiny
  YouTube channels top the list (e.g. 118 views on 3 subscribers = "39×").
- YouTube: one search returns 25 videos for 100 quota units; stats and subscribers cost 1 unit each
  per batch of up to 50 IDs. `videoDuration=short` = under 4 minutes; treat ≤ 3 min as Shorts.

## 6. Data sources (all free for the MVP)

| Platform | Source | Use |
|---|---|---|
| YouTube Shorts | YouTube Data API v3 (official, free, 10,000 units/day) | Search, video stats, channel stats |
| TikTok | ScrapeCreators (free credits: 100 + up to ~7,000 bonus) | Search (if supported), profile, profile videos, transcript |
| TikTok backup | Apify free plan (~$5 credit/month) | Only if ScrapeCreators fails |
| Instagram Reels | ScrapeCreators (same credits as TikTok), **off by default** | Reels search (Google-indexed, best-effort, 10 per page, no follower counts) + one page of a creator's reels (~12, play counts) as the usual-views baseline |

Each source sits behind an **adapter** with one shared interface (see CLAUDE.md), so a vendor can be
replaced by rewriting one file.

### Cost-saving rules (mandatory)

1. Only TikTok and Instagram (both ScrapeCreators) use paid calls; Instagram is off unless the user turns it on. YouTube is free.
2. Max **5 keywords** per run, **1 page** per keyword per platform.
3. Usual-views lookup only for the **top 5 creators** per run.
4. **24-hour shared cache** for creators and videos (all users share it).
5. Tracking refreshes **only when the page is opened**, max once per 24 h per account.
6. Use the caption first; fetch a **transcript only when the user asks** for the breakdown.
7. Log every paid call to `api_usage`; show today's/month's count on an admin line in `/app`.

### ScrapeCreators facts (verified on Day 0, 2026-10-25)

- Base URL `https://api.scrapecreators.com`, header `x-api-key`. 1 credit per call so far.
- Keyword search `/v1/tiktok/search/keyword`: **30 videos per call**, includes author followers.
  Always send `date_posted=last-6-months` and `trim=true`.
- Profile videos `/v3/tiktok/profile/videos`: **10 videos per page** (`max_cursor` for the next page).
  Always send `include_pinned=false` and `trim=true`. A 20-video baseline = 2 calls.
- Transcript `/v1/tiktok/video/transcript`: WebVTT text, 1 call.

Per research run: 5 search calls + up to 5 creators × 2 baseline pages = **~15 calls** (less with cache).
Expected usage for 3 daily users: **~1,000–1,200 TikTok calls/month** → the ~5,100 credits on the
account last ~4–5 months.

## 7. AI tasks (Gemini Flash via Vercel AI SDK; structured output with zod)

| Task | Input | Output |
|---|---|---|
| `suggestPlan` | brief, locale | `{ keywords: string[≤5], exclusions: string[], platforms }` |
| `analyzeVideo` | caption, transcript?, metrics | `{ hook, hookType, format, angle, cta, whyItWorked }` — cached per video, shared by all users |
| `makeMyVersion` | product profile, video, analysis, locale | `{ title, beats: [{ label, time, text }], caption, hashtags }` |

Output language = the user's locale. Keep prompts in `/lib/ai/prompts.ts`.

## 8. Data model (Supabase Postgres)

**User-owned (RLS: `user_id = auth.uid()`):** `products`, `research_runs`, `run_results`,
`scripts`, `tracked_accounts`, `saved_videos`.

**Shared cache (RLS: read for authenticated users; write only from the server with the service role):**
`videos`, `creators`, `video_analyses`, `api_usage`.

| Table | Key columns |
|---|---|
| `products` | id, user_id, name, url, description, audience, language |
| `research_runs` | id, user_id, product_id, brief, keywords[], exclusions[], platforms[], status, error, created_at |
| `run_results` | run_id, video_id, reach_score, usual_score, label, rank |
| `videos` | id, platform, platform_video_id (unique per platform), url, thumbnail_url, caption, creator_handle, views, likes, comments, shares, published_at, is_pinned, transcript, fetched_at |
| `creators` | platform, handle (unique per platform), followers, usual_views, sample_size, fetched_at |
| `video_analyses` | video_id, hook, hook_type, format, angle, cta, why_it_worked, model, created_at |
| `scripts` | id, user_id, product_id, video_id, content (jsonb), locale, created_at |
| `tracked_accounts` | id, user_id, platform, handle, last_opened_at |
| `saved_videos` | user_id, video_id, note, created_at |
| `api_usage` | date, provider, endpoint, calls |

## 9. Build schedule (sessions of ≤ 4 hours)

| Day | Goal | Done when |
|---|---|---|
| 0 (1–2 h, no Claude Code) | Accounts + keys, data tests (`DAY0.md`), design screenshots | All data tests pass or the plan is adjusted |
| 1 | Next.js setup, Supabase auth + schema + RLS, i18n, YouTube + TikTok adapters, scores | A keyword search shows real ranked videos |
| 2 | Research flow (brief → plan → run), results page with Virlo-style insight card + Peekly-style tabs/filter chips/sort (§11), video detail + AI breakdown, save | Friends can run research for their products |
| 3 | Product profile, Make my version, saved, deploy to Vercel, test with friends | Both friends use it live |
| 4 | Competitor tracking in the Peekly row layout (§11) | FlowAccount breakout is flagged |
| 5 | Instagram tracking (Meta API), Thai copy polish | Full MVP |

Cut order if behind: Instagram → saved collection → date filter.

## 10. Risks

- **Scraped data (TikTok via ScrapeCreators)** goes against TikTok's terms. Acceptable for a private
  3-user test; get legal advice before charging money.
- **ScrapeCreators may lack TikTok keyword search or change endpoints** → Day 0 test; fall back to
  Apify, or to "track accounts" only for TikTok.
- **Gemini free-tier limits are unclear** → backup: Vercel AI Gateway ($5 free/month).
- **Vercel Hobby is non-commercial** → move to Pro ($20/month) before charging.
- **Thailand PDPA** → privacy policy and terms before opening to the public.

## 11. UI patterns (reviewed 2026-10-25)

Borrow the feel and structure, never Peekly's or Virlo's names, wording, logos or images.

**From Peekly (Organic and Ads pages)**
- Platform pill tabs: `All / TikTok / Reels / Shorts` (rounded segmented control).
- Filter chips: small white buttons (6px radius, hairline ring `0 0 0 1px rgb(0 0 0/.08)` + soft
  shadow `0 2px 6px rgb(0 0 0/.1)`, 12.5px semibold, ~31px tall), each opening a menu of preset
  thresholds. Reely chips: Min views (10k+/50k+/100k+/500k+/1M+), Min outlier (2×+/5×+/10×+),
  Min saves (100+/1k+/10k+), Language (TH/EN), Posted (7d/30d/90d/6mo).
- Sort dropdown, same chip style: Biggest outlier (default) / Most views / Most saves / Most recent.
- Video cards: views + engagement rail (likes, comments, saves, shares) on the thumbnail edge;
  @handle + followers under the card; Save button.
- Account rows (tracking page): left panel with KPI tiles (uppercase label, big number):
  FOLLOWERS, USUAL VIEWS, BREAKOUTS (30D), POSTS / MONTH + a small posts-per-month bar chart;
  right: horizontal strip of the account's videos, breakouts first, "+N more" and "See account".
- Soft paywall later: first rows visible, rest locked with an unlock prompt.
- Tokens: Plus Jakarta Sans, page `#FAFAFA`, cards 12px radius without heavy borders, active
  sidebar item white/10 on the dark sidebar with 8px radius.

**From Virlo**
- Research wizard: Describe → Keywords → Run, with a "good brief covers" checklist
  (topic, audience, angle, what to avoid) and editable keyword and exclusion chips.
- Results header: run stats (videos, total views, breakouts, creators) above the grid.
- Show the numbers behind every score in a tooltip or chip.

**From Virlo's "check my niche" agent (reviewed 2026-10-25)**
- Insight card on top of results: an AI headline with one highlighted word
  ("Accounting software videos *work* on short-form"), a one-line summary, then 3 stat tiles:
  videos found · views on the top video · "X of 10 top results from accounts under 10K followers"
  (shows small accounts can win — motivating for founders).
- Top videos carousel: hook text from the caption in quotes over the thumbnail, @handle, platform
  label, views pill + red score pill, arrows, "See all".
- AI takeaway paragraph under the carousel: the pattern behind the winners, citing specific videos
  ("win on a relatable problem, not a feature list. @x pulled 15M with …").
- Later (GTM, not MVP): public "Will Reely work for your niche?" page — no account, 3 free
  searches with a progress indicator, example chips ("Try: …"), a scrolling strip of viral thumbnails
  with views and follower counts. Must run on cached results to protect credits.

**Brand**
- Logo files: `public/brand/reely-logo-light.png` (light backgrounds), `reely-logo-dark.png`
  (white letters, for the sidebar), `reely-mark.png` (R only), `app/icon.png` (favicon).
  Original: `docs/brand/reely-logo-original.png`. Brand purple `#5636BA` = `--primary`.
